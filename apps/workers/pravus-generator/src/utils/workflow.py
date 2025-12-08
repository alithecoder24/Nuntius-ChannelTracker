import os
import shutil
import json
from datetime import datetime
from typing import List, Dict, Tuple, Optional, Union
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor, as_completed

from src.utils.models import Video, Profile, TaskStatusUpdater
from src.utils.audio import AudioPipeline
from src.utils.card_generator import RedditCardGenerator
from src.utils.video import VideoProcessor
from src.utils.utils import custom_print

FILE = "workflow"

def clean_filename(title: str, max_length: int = 70) -> str:
    """
    Create a Windows-safe, human-readable filename from a title.
    - Removes forbidden characters
    - Normalizes spaces
    - Truncates and appends "..." if too long
    """
    forbidden = '\\/:*?"<>|'
    cleaned = ''.join(c for c in title if c not in forbidden)
    cleaned = " ".join(cleaned.split())
    if len(cleaned) > max_length:
        cleaned = cleaned[:max_length].rstrip() + "..."
    return cleaned


def parse_txt_with_title(file_path: str) -> tuple:
    """
    Parse a .txt file that may contain structured TITLE/SCRIPT sections:
    
    ===TITLE===
    My long title...

    ===SCRIPT===
    Full script text...
    
    If markers are missing, fall back to: title = filename (without extension),
    script = full file content.
    """
    with open(file_path, "r", encoding="utf-8") as f:
        text = f.read()

    if "===TITLE===" in text and "===SCRIPT===" in text:
        try:
            after_title = text.split("===TITLE===")[1]
            title_part, script_part = after_title.split("===SCRIPT===", 1)
            title = title_part.strip()
            script = script_part.strip()
            if title:
                return title, script
        except Exception:
            # fall back to old behavior below
            pass

    # Fallback: old plain txt behavior
    base_name = os.path.basename(file_path).rsplit(".", 1)[0]
    return base_name, text.strip()


class WorkflowManager:
    """
    Class that orchestrates the entire workflow from text processing to final video generation.
    Acts as a facade for the various components of the system.
    """
    
    def __init__(self, task_id: Optional[str] = None, base_dir: Optional[str] = None):
        """Initialize the workflow manager."""
        self.task_id = task_id
        self.base_dir = base_dir or os.getcwd()
        self.status_updater = TaskStatusUpdater(task_id)
        
        # Initialize component processors
        self.audio_pipeline = AudioPipeline(task_id)
        self.video_processor = VideoProcessor(task_id)
    
    def update_status(self, status=None, stage=None, message=None, progress=None):
        """Update task status using the task_updater."""
        self.status_updater.update(status=status, stage=stage, message=message, progress=progress)
    
    def generate_images(
        self,
        videos: Dict[str, Video], 
        username: str, 
        selected_profile: str
    ) -> Tuple[str, List[str]]:
        """
        Generate intro card images for the provided videos.
        
        Args:
            videos: Dictionary mapping base names to Video objects
            username: Username to display on the cards
            selected_profile: ID of the profile to use for card styling
            
        Returns:
            Tuple containing:
            - Directory where cards were saved
            - List of paths to generated card images
        """
        # Initialize card generator
        card_generator = RedditCardGenerator(
            username=username,
            selected_profile=selected_profile,
            current_dir=self.base_dir
        )
        
        # Extract Video objects for card generation
        # Instead of just sending the keys (base_names), we'll send the actual Video objects
        # so the card generator can access the original titles
        
        # Print the Video objects for debugging
        for base_name, video in videos.items():
            custom_print(FILE, f"Video object for {base_name}:")
            custom_print(FILE, f"  Title: {video.title}")
            custom_print(FILE, f"  Content length: {len(video.content)} chars")
            custom_print(FILE, f"  Audio path: {video.audio_path}")
        
        # Generate cards using the video objects directly
        custom_print(FILE, f"Generating {len(videos)} intro cards...")
        output_dir, card_paths = card_generator.generate_multiple_cards(videos)
        
        # Update Video objects with card paths
        # This is handled inside the generate_multiple_cards function now
        return output_dir, card_paths

    def generate_videos(
        self,
        videos: Dict[str, Video], 
        mix_path: str, 
        output_dir: str, 
        resolution: Tuple[int, int] = (1080, 1920),
        fps: int = 30,
        profile: Optional[Profile] = None
    ) -> List[Video]:
        """
        Generate videos for each Video object and merge them with audio.
        Now processes multiple videos in parallel for better performance.
        
        Args:
            videos: Dictionary mapping base names to Video objects
            mix_path: Path to the video clip mix directory
            output_dir: Directory to save the output videos
            resolution: Resolution for the output videos (width, height)
            fps: Frame rate for the output videos
            
        Returns:
            List of Video objects with updated paths
        """
        # Ensure output directory exists
        os.makedirs(output_dir, exist_ok=True)
        
        if not videos:
            custom_print(FILE, "No videos to generate", error=True)
            return []
        
        if not os.path.exists(mix_path):
            custom_print(FILE, f"Video mix directory does not exist: {mix_path}", error=True)
            return []

        # Get video files from the mix directory
        video_files = self.video_processor.get_video_files(mix_path)
        if not video_files:
            custom_print(FILE, f"No video files found in mix directory: {mix_path}", error=True)
            return []
        # Determine the number of worker threads based on video count and system resources
        max_workers = min(len(videos), 3)  # Limit to 3 concurrent video processes to avoid overwhelming system
        custom_print(FILE, f"Processing {len(videos)} videos with {max_workers} parallel workers")
        # Process videos in parallel using ProcessPoolExecutor with serializable data
        processed_videos = []
        total_videos = len(videos)
        
        # Determine the number of worker processes based on video count and system resources
        max_workers = min(len(videos), 3)  # Limit to 3 concurrent video processes
        custom_print(FILE, f"Processing {len(videos)} videos with {max_workers} parallel processes")
        
        # Process videos in parallel using ProcessPoolExecutor with serializable arguments
        video_items = list(videos.items())
        
        with ProcessPoolExecutor(max_workers=max_workers) as executor:
            # Submit all video processing tasks with serializable arguments
            future_to_video = {}
            
            for index, (base_name, video_obj) in enumerate(video_items):
                # Extract serializable data from video_obj and profile
                video_data = {
                    'title': video_obj.title,
                    'audio_path': video_obj.audio_path,
                    'title_duration': video_obj.title_duration,
                    'content_duration': video_obj.content_duration
                }
                
                profile_data = None
                if isinstance(profile, Profile):
                    profile_data = {
                        'highlight_color': profile.highlight_color,
                        'animations_enabled': profile.animations_enabled,
                        'font': profile.font,
                        'video_length': profile.video_length
                    }

                future = executor.submit(
                    _process_video_subprocess,
                    base_name, video_data, mix_path, output_dir, fps, resolution,
                    profile_data, total_videos, index, self.task_id
                )
                future_to_video[future] = (base_name, video_obj)
            
            # Collect results as they complete
            for future in as_completed(future_to_video):
                base_name, video_obj = future_to_video[future]
                try:
                    result = future.result()
                    if result and result.get('success'):
                        # Update the original video object with the result
                        video_obj.video_path = result.get('video_path')
                        video_obj.final_video_path = result.get('final_video_path')
                        processed_videos.append(video_obj)
                        custom_print(FILE, f"Successfully processed video: {base_name}")
                    else:
                        custom_print(FILE, f"Failed to process video: {base_name}", error=True)
                        
                    # Check if any queued tasks can be started after each video completes
                    from main import task_manager
                    task_manager.check_and_start_queued_tasks()
                        
                except Exception as e:
                    custom_print(FILE, f"Exception processing video {base_name}: {str(e)}", error=True)
        
        custom_print(FILE, f"Video generation completed. {len(processed_videos)}/{total_videos} videos processed successfully. Files saved to {output_dir}")
        return processed_videos
    
    def process_complete_task(
        self,
        profile_id: str,
        voice_name: str,
        background_id: str,
        channel_name: Optional[str] = None,
        uploaded_files: Optional[List[str]] = None,
        uploaded_files_info: Optional[List[Dict[str, str]]] = None,
    ) -> Dict:
        """
        Process a complete video generation task: audio, images, and videos.
        This method centralizes the workflow logic from main.py's process_task.
        
        Args:
            profile_id: ID of the selected profile
            voice_name: Name or ID of the voice to use
            background_id: ID of the background video mix to use
            channel_name: Channel name for output folder
            uploaded_files: List of specific file paths to process
            uploaded_files_info: List of dictionaries with file metadata
            
        Returns:
            Dictionary with results of the processing
        """
        results = {
            "success": False,
            "audio_complete": False,
            "image_complete": False,
            "video_complete": False,
            "errors": [],
            "image_results": [],
            "video_results": [],
            "output_folder": None
        }
        
        try:
            from main import task_manager
            from src.utils.task import TaskStatus
            
            # Helper function to resolve paths relative to base_dir
            def resolve_path(directory):
                """Resolve path relative to base_dir if needed"""
                if not directory:
                    return None
                    
                if self.base_dir and not os.path.isabs(directory):
                    return os.path.join(self.base_dir, directory)
                return directory
            
            # Set up path to video mix directory
            video_mix_base_dir = "Assets/VideoClipMix"
            
            # Create Profile object
            profile = None
            try:
                if profile_id:                
                    profile_path = os.path.join(self.base_dir, "Assets/Profiles", profile_id)
                else:
                    custom_print(FILE, "No profile ID provided", error=True)
                    return results

                config_path = os.path.join(profile_path, 'config.json')
                
                if os.path.exists(config_path):
                        with open(config_path, 'r') as f:
                            profile_data = json.load(f)
                            
                            # Use the provided channel_name or get from profile
                            ch_name = channel_name or profile_data.get('channel_name', 'unknown')
                            
                            # Create Profile object
                            profile = Profile(
                                channel_name=ch_name,
                                badge_style=profile_data.get('badge_style', ''),
                                voice=voice_name or profile_data.get('voice', ''),
                                background_video=background_id or profile_data.get('background_video', ''),
                                selected_badges=profile_data.get('selected_badges', []),
                                music=profile_data.get('music', ''),
                                highlight_color=profile_data.get('highlight_color', '#ffffff'),
                                animations_enabled=profile_data.get('animations_enabled', True),
                                font=profile_data.get('font', 'Montserrat'),
                                video_length=profile_data.get('video_length', 0)
                            )
            except Exception as e:
                custom_print(FILE, f"Error creating Profile object: {e}", error=True)
                # Fallback to using profile_id as a string if object creation fails
                profile = profile_id
            
            # Get an output folder from task data or create one if needed
            output_folder = None
            audio_dir = None
            image_dir = None
            video_dir = None

            # Check if task already has output folder
            task_data = task_manager.get_task(self.task_id)
            if task_data and "output_folder" in task_data:
                output_folder = task_data["output_folder"]

                # Create subdirectories if they don't exist
                audio_dir = os.path.join(output_folder, "audio")
                image_dir = os.path.join(output_folder, "images")
                video_dir = os.path.join(output_folder, "videos")

                # Ensure subdirectories exist
                for directory in [audio_dir, image_dir, video_dir]:
                    os.makedirs(directory, exist_ok=True)
            else:
               custom_print(FILE, "No output folder found in task data", error=True)
            
            # Store the output folder path in results
            results["output_folder"] = output_folder
            
            # Resolve paths
            resolved_audio_dir = resolve_path(audio_dir)
            resolved_image_dir = resolve_path(image_dir)
            resolved_video_dir = resolve_path(video_dir)
            
            # Ensure we have either valid input_dir or uploaded_files
            if not uploaded_files:
                error_msg = "No input files provided. Please specify uploaded_files."
                custom_print(FILE, error_msg, error=True)
                results["errors"].append(error_msg)
                self.update_status(status="error", message=error_msg)
                return results
            
            # Prepare a mix path if background video is selected
            mix_path = None
            if background_id and video_mix_base_dir:
                mix_path = os.path.join(resolve_path(video_mix_base_dir), background_id)
                if not os.path.exists(mix_path):
                    custom_print(FILE, f"Warning: Background video mix not found: {mix_path}")
                    mix_path = None
                
            # Set default silence settings for audio processing
            silence_settings = {
                'min_silence_len': 50,
                'silence_thresh': -50
            }
            # Stage 1: Generate Audio
            print(self.task_id)
            
            if task_manager.get_task(self.task_id).get("status") == TaskStatus.CANCELLED:
                custom_print(FILE, f"Task {self.task_id} was cancelled, skipping audio processing")
                return results
            
            self.update_status(status="processing", stage="audio", message="Processing audio files...", progress=15)
            # Create mapping of file paths to original filenames
            filename_mapping = self.create_original_filename_mapping(uploaded_files_info)
            
            # Process audio files using the AudioPipeline with parallel processing
            form_data = task_data.get("form_data_for_processing", {})
            
            # Enhanced audio processing with parallel file handling
            videos = self._process_audio_files_parallel(
                output_dir=resolved_audio_dir,
                voice_name=voice_name,
                silence_settings=silence_settings,
                uploaded_files=uploaded_files,
                filename_mapping=filename_mapping,
                form_data=form_data,
                video_length=profile.video_length if isinstance(profile, Profile) else 0
            )
            
            results["audio_complete"] = bool(videos)
            
            # If audio processing failed, update the status and exit
            if not videos:
                self.update_status(status="error", message="Failed to process audio files")
                results["errors"].append("Failed to process audio files")
                return results

            self.update_status(status="processing", stage="card", message="Generating intro cards...", progress=45)
            
            # Use the workflow module to generate images
            _, generated_cards = self.generate_images(
                videos=videos,
                username="User",  # Default username
                selected_profile=profile_id
            )
            
            # Rename the generated cards so they match what video.py expects:
            # images/<AUDIO_BASENAME>.png  (AUDIO_BASENAME = basename of video_obj.audio_path)
            final_card_paths = []
            card_texts = list(videos.keys())
            
            for i, card_path in enumerate(generated_cards):
                if i < len(card_texts):
                    base_name = card_texts[i]
                    video_obj = videos.get(base_name)
                    if not video_obj:
                        continue

                    # Use the audio basename so video.py can find it with its logic
                    audio_base = os.path.splitext(os.path.basename(video_obj.audio_path))[0]
                    new_filename = f"{audio_base}.png"
                    
                    # Create the new path
                    new_path = os.path.join(resolved_image_dir, new_filename)
                    
                    # Remove existing file if it already exists
                    if os.path.exists(new_path):
                        os.remove(new_path)
                        
                    # Rename the file if the paths are different
                    if card_path != new_path:
                        os.rename(card_path, new_path)
                    
                    # Update the Video object
                    video_obj.introcard_path = new_path
                    
                    final_card_paths.append(new_path)
            
            results["image_results"] = final_card_paths
            results["image_complete"] = bool(final_card_paths)
            # Stage 3: Generate Videos (if background is selected)
            if background_id and mix_path:
                if task_manager.get_task(self.task_id).get("status") == TaskStatus.CANCELLED:
                    custom_print(FILE, f"Task {self.task_id} was cancelled, skipping video generation")
                    return results
                    
                self.update_status(status="processing", stage="video", message="Generating background videos...", progress=75)
                # Use the workflow module to generate videos
                processed_videos = self.generate_videos(
                    videos=videos,
                    mix_path=mix_path,
                    output_dir=resolved_video_dir,
                    profile=profile
                )
                
                # Convert Video objects to dictionaries
                video_results = []
                for video in processed_videos:
                    video_results.append({
                        'path': video.final_video_path,
                        'base_name': video.title
                    })
                
                results["video_results"] = video_results
                results["video_complete"] = bool(processed_videos)
                
                # If video processing was needed but failed, add an error
                if not processed_videos:
                    self.update_status(status="error", message="Failed to generate videos, but audio and images were created successfully.")
                    results["errors"].append("Failed to generate videos")
                    results["success"] = False
                    return results
            # Update overall success status
            results["success"] = results["audio_complete"] and results["image_complete"] and results.get("video_complete", False)
            
            # Set final status based on completion
            if results["success"]:
                if background_id and mix_path:
                    results["video_complete"] = bool(processed_videos)
                    completion_message = f"Task completed successfully! Generated {len(videos)} audio files, {len(final_card_paths)} cards"
                    if results["video_complete"]:
                        completion_message += f", and {len(processed_videos)} videos"
                else:
                    completion_message = f"Task completed successfully! Generated {len(videos)} audio files and {len(final_card_paths)} cards"
                
                self.update_status(status="complete", message=completion_message, progress=100)
                # delete audio directory and images
                if os.path.exists(resolved_audio_dir):
                    shutil.rmtree(resolved_audio_dir)
                if os.path.exists(resolved_image_dir):
                    shutil.rmtree(resolved_image_dir)
                custom_print(FILE, f"Deleted audio directory: {resolved_audio_dir}")
                custom_print(FILE, f"Deleted image directory: {resolved_image_dir}")
            else:
                error_msg = "Task completed with errors. Check the output folder for partial results."
                self.update_status(status="error", message=error_msg)
                results["errors"].append(error_msg)
            if background_id and mix_path:
                results["success"] = results["success"] and results["video_complete"]
                
            # Final status update
            if results["success"]:
                self.update_status(status="complete", message="Processing complete! You can now open the generated files.")
            elif not results["image_complete"]:
                self.update_status(status="error", message="Failed to generate intro cards")
            
        except Exception as e:
            error_message = f"An unexpected error occurred: {str(e)}"
            import traceback
            traceback.print_exc()
            custom_print(FILE, error_message, error=True)
            results["errors"].append(error_message)
            self.update_status(status="error", message=error_message)
            
        return results
    
    def create_output_folder(self, profile: Union[Profile, str], channel_name: Optional[str] = None) -> Tuple[str, str, str, str]:
        """
        Create a structured output folder following the pattern:
        Output/DD-MM-YYYY-channelname-id/
        
        Args:
            profile: Profile object or profile_id string
            channel_name: Optional override for channel name (used as-is, no sanitization)
            
        Returns:
            tuple: (
                output_folder_path, 
                audio_subfolder, 
                images_subfolder, 
                videos_subfolder
            )
        """
        # Get current date in DD-MM-YYYY format
        current_date = datetime.now().strftime("%d-%m-%Y")
        
        # Handle different types of profile input
        if isinstance(profile, Profile):
            # If a Profile object is provided, use its channel_name directly
            if not channel_name:
                channel_name = profile.channel_name
        else:
            # If a string (profile_id) is provided
            # Try to get the channel name from the profile if not provided
            if not channel_name:
                try:
                    profile_path = os.path.join(self.base_dir, "Assets/Profiles", profile)
                    config_path = os.path.join(profile_path, 'config.json')
                    if os.path.exists(config_path):
                        import json as _json
                        with open(config_path, 'r') as f:
                            profile_data = _json.load(f)
                            channel_name = profile_data.get('channel_name', 'unknown')
                    else:
                        channel_name = "unknown"
                except Exception as e:
                    custom_print(FILE, f"Error loading profile: {e}", error=True)
                    channel_name = "unknown"
        
        # Use channel name as-is with no sanitization
        # User will assume risk of problematic filenames
        if not channel_name:
            channel_name = "unknown"
        
        # Build the base folder name without ID
        base_folder_name = f"{current_date}-{channel_name}"
        
        # Check if Output folder exists, create if not
        output_dir = os.path.join(self.base_dir, "output")
        os.makedirs(output_dir, exist_ok=True)
        
        # Find the highest existing ID for similar folders
        highest_id = 0
        
        # Loop through existing folders and find the highest ID for folders with the same name
        for folder_name in os.listdir(output_dir):
            folder_path = os.path.join(output_dir, folder_name)
            if os.path.isdir(folder_path):
                # Check if the folder name starts with our base name
                if folder_name.startswith(base_folder_name):
                    # Check if it has an ID at the end
                    parts = folder_name.split('-')
                    if len(parts) > 1 and parts[-1].isdigit():
                        try:
                            folder_id_int = int(parts[-1])
                            highest_id = max(highest_id, folder_id_int)
                        except ValueError:
                            pass
                    elif folder_name == base_folder_name:
                        # If exact match without ID, treat as ID 1
                        highest_id = max(highest_id, 1)
        
        # Create new folder with incremented ID
        new_id = highest_id + 1
        new_folder_name = f"{base_folder_name}-{new_id}"
        output_folder_path = os.path.join(output_dir, new_folder_name)
        
        # Create the main output folder and subfolders
        os.makedirs(output_folder_path, exist_ok=True)
        
        # Create subfolders
        audio_folder = os.path.join(output_folder_path, "audio")
        os.makedirs(audio_folder, exist_ok=True)
        
        images_folder = os.path.join(output_folder_path, "images")
        os.makedirs(images_folder, exist_ok=True)
        
        videos_folder = os.path.join(output_folder_path, "videos")
        os.makedirs(videos_folder, exist_ok=True)
        
        custom_print(FILE, f"Created output folder structure at {output_folder_path}")        
        return (output_folder_path, audio_folder, images_folder, videos_folder)
    
    @staticmethod
    def create_original_filename_mapping(uploaded_files_info: Optional[List[Dict[str, str]]]) -> Dict[str, str]:
        """
        Create a mapping of file paths to their original filenames.
        
        Args:
            uploaded_files_info: List of dictionaries with 'path' and 'original_filename' keys
            
        Returns:
            Dictionary mapping file paths to original filenames
        """
        if not uploaded_files_info:
            return {}
            
        mapping = {}
        for file_info in uploaded_files_info:
            if isinstance(file_info, dict) and 'path' in file_info and 'original_filename' in file_info:
                mapping[file_info['path']] = file_info['original_filename']
        
        return mapping

    def _process_single_audio_file(self, file_path: str, filename_mapping: Dict[str, str], 
                                   output_dir: str, voice_name: str, video_length: int, silence_settings: Dict,
                                   form_data: Dict, total_files: int, current_index: int) -> Optional[Video]:
        """
        Process a single input file (txt/docx/etc.) into audio and return a Video object.

        Supports:
        - New TXT format with ===TITLE=== / ===SCRIPT=== markers
        - Old TXT format (whole file is script, title from filename)
        - Other types are passed through to the AudioPipeline unchanged
        """
        try:
            # Check for task cancellation
            from src.utils.task import TaskStatus
            from main import task_manager
            task = task_manager.get_task(self.task_id)
            if task and task.get("status") == TaskStatus.CANCELLED:
                custom_print(FILE, f"Task {self.task_id} was cancelled, stopping processing for {file_path}")
                return None

            # Determine original filename and extension
            original_filename = filename_mapping.get(file_path, os.path.basename(file_path))
            ext = os.path.splitext(file_path)[1].lower()

            # Default: process the original file directly
            processing_path = file_path
            display_name = original_filename
            parsed_title = None

            # Special handling for .txt with optional TITLE/SCRIPT markers
            if ext == ".txt":
                title, script_text = parse_txt_with_title(file_path)
                parsed_title = title
                display_name = title

                # Write script to temporary txt used by AudioPipeline
                base_name = os.path.splitext(os.path.basename(file_path))[0]
                temp_txt_path = os.path.join(output_dir, f"{base_name}_script.txt")
                with open(temp_txt_path, "w", encoding="utf-8") as out_f:
                    out_f.write(script_text)
                processing_path = temp_txt_path

            # Update individual file progress - starting
            task_manager.update_file_progress(self.task_id, display_name, "processing", 0)

            # Calculate progress for this individual file
            base_progress = 15  # Starting progress for audio stage
            progress_per_file = 30 / max(total_files, 1)  # 30% range for audio processing
            current_progress = base_progress + (current_index * progress_per_file)

            # Update task status with individual file progress
            self.update_status(
                status="processing",
                stage="audio",
                message=f"Processing audio file {display_name} ({current_index + 1}/{total_files})",
                progress=int(current_progress),
            )

            # Process single file using audio pipeline
            videos = self.audio_pipeline.process(
                output_dir=output_dir,
                voice_name=voice_name,
                video_length=video_length,
                silence_settings=silence_settings,
                uploaded_files=[processing_path],
                filename_mapping={processing_path: display_name},
                form_data=form_data,
            )

            # Update individual file progress - completed
            task_manager.update_file_progress(self.task_id, display_name, "complete", 100)

            # Return the first (and only) video from the result
            if videos and len(videos) > 0:
                video_key = list(videos.keys())[0]
                video_obj = videos[video_key]
                # If we parsed a structured title from txt, override Video.title with it
                if parsed_title:
                    video_obj.title = parsed_title
                return video_obj

            return None

        except Exception as e:
            # Update individual file progress - failed
            from main import task_manager as _tm
            original_filename = filename_mapping.get(file_path, os.path.basename(file_path))
            _tm.update_file_progress(self.task_id, original_filename, "failed", 0)
            custom_print(FILE, f"Error processing audio file {file_path}: {str(e)}", error=True)
            return None

    def _process_audio_files_parallel(self, output_dir: str, voice_name: str, video_length: int,
                                     silence_settings: Dict, uploaded_files: List[str],
                                     filename_mapping: Dict[str, str], form_data: Dict) -> Dict[str, Video]:
        """
        Process multiple audio files in parallel for better performance.
        
        Args:
            output_dir: Output directory for audio files
            voice_name: Voice to use for audio generation
            silence_settings: Settings for silence detection
            uploaded_files: List of file paths to process
            filename_mapping: Mapping of file paths to original filenames
            form_data: Additional form data
            
        Returns:
            Dictionary mapping base names to Video objects
        """
        if not uploaded_files:
            custom_print(FILE, "No audio files to process", error=True)
            return {}
        
        # Determine the number of worker threads based on file count and system resources
        max_workers = min(len(uploaded_files), 8)  # Use 8 workers to match subtitle generation threading
        custom_print(FILE, f"Processing {len(uploaded_files)} audio files with {max_workers} parallel workers")

        # Process audio files in parallel
        processed_videos = {}
        total_files = len(uploaded_files)
        
        with ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="AudioWorker") as executor:
            # Submit all audio processing tasks
            future_to_file = {}
            
            for index, file_path in enumerate(uploaded_files):
                future = executor.submit(
                    self._process_single_audio_file,
                    file_path, filename_mapping, output_dir, voice_name, video_length,
                    silence_settings, form_data, total_files, index
                )
                future_to_file[future] = file_path
            
            # Collect results as they complete
            for future in as_completed(future_to_file):
                file_path = future_to_file[future]
                try:
                    result = future.result()
                    if result:
                        # Create a base name for the video object
                        original_filename = filename_mapping.get(file_path, os.path.basename(file_path))
                        base_name = os.path.splitext(original_filename)[0]
                        processed_videos[base_name] = result
                        custom_print(FILE, f"Successfully processed audio file: {original_filename}")
                    else:
                        custom_print(FILE, f"Failed to process audio file: {file_path}", error=True)
                except Exception as e:
                    custom_print(FILE, f"Exception processing audio file {file_path}: {str(e)}", error=True)
        
        custom_print(FILE, f"Audio processing completed. {len(processed_videos)}/{total_files} files processed successfully.")
        return processed_videos
    


def _process_video_subprocess(base_name: str, video_data: Dict, mix_path: str, 
                            output_dir: str, fps: int, resolution: Tuple[int, int],
                            profile_data: Optional[Dict], total_videos: int, 
                            current_index: int, task_id: Optional[str]) -> Dict:
    """
    Process a single video in a subprocess with serializable data.
    This function is designed to work with ProcessPoolExecutor.
    """
    try:
        import os
        from src.utils.video import VideoProcessor
        from src.utils.audio import get_audio_duration
        from src.utils.utils import custom_print as _cp
        from src.utils.task import TaskStatus
        from main import task_manager

        FILE = "workflow_subprocess"

        # Check for task cancellation
        if task_id:
            task = task_manager.get_task(task_id)
            if task and task.get("status") == TaskStatus.CANCELLED:
                _cp(FILE, f"Task {task_id} was cancelled, stopping processing for {base_name}")
                return {"success": False, "error": "Task cancelled"}

        # Ensure we have an audio file
        audio_path = video_data.get('audio_path')
        if not audio_path or not os.path.exists(audio_path):
            _cp(FILE, f"Skipping video generation for {base_name}: No audio file", error=True)
            return {"success": False, "error": "No audio file"}

        # Determine total duration for the video
        if video_data.get('title_duration') and video_data.get('content_duration'):
            total_duration = video_data['title_duration'] + video_data['content_duration']
        else:
            total_duration = video_data.get('content_duration') or get_audio_duration(audio_path)

        safe_title = video_data.get('title') or base_name

        # Remove pre-existing simple video with same base_name
        existing_video_path = os.path.join(output_dir, f"{base_name}.mp4")
        if os.path.exists(existing_video_path):
            os.remove(existing_video_path)

        _cp(FILE, f"Generating video with length {total_duration}s for audio: {base_name}")
        _cp(FILE, f"Will use title for final output name (cleaned for filesystem): {safe_title}")

        # Initialize video processor
        video_processor = VideoProcessor(task_id)

        # Generate base video from mix
        video_result = video_processor.generate_videos_from_mix(
            mix_path=mix_path,
            output_dir=output_dir,
            file_name=base_name,
            count=1,
            video_length=float(total_duration),
            fps=fps,
            resolution=resolution,
        )

        if not video_result or len(video_result) == 0:
            return {"success": False, "error": "Video generation from mix failed"}

        video_path = video_result[0]
        temp_output = os.path.join(output_dir, f"{base_name}_merged.mp4")

        # Extract profile settings
        highlight_color = "#ffffff"
        animations_enabled = True
        font_name = "Montserrat"
        if profile_data:
            highlight_color = profile_data.get('highlight_color', '#ffffff')
            animations_enabled = profile_data.get('animations_enabled', True)
            font_name = profile_data.get('font', 'Montserrat')
            video_length = profile_data.get('video_length', 0)

        # Merge audio & apply subtitles
        success = video_processor.merge_audio_with_video(
            video_path=video_path,
            audio_path=audio_path,
            output_path=temp_output,
            apply_subtitles=True,
            offset_subtitles=0,
            font_name=font_name,
            highlight_color=highlight_color,
            animations_enabled=animations_enabled,
            title_duration=video_data.get('title_duration'),
        )

        if success and os.path.exists(temp_output):
            # Clean title for filesystem use and truncate with "..." if needed
            safe_file_title = clean_filename(safe_title)
            final_path = os.path.join(output_dir, f"{safe_file_title}.mp4")

            # Remove existing final file if present
            if os.path.exists(final_path):
                os.remove(final_path)

            # Rename merged file to final path
            os.rename(temp_output, final_path)

            # Clean up intermediate video
            if os.path.exists(video_path) and video_path != final_path:
                os.remove(video_path)

            _cp(FILE, f"Finished processing video: {safe_file_title}")

            return {
                "success": True,
                "video_path": video_path,
                "final_video_path": final_path,
                "title": safe_title,
                "duration": total_duration,
            }

        return {"success": False, "error": "Video merge failed"}

    except Exception as e:
        from src.utils.utils import custom_print as _cp
        FILE = "workflow_subprocess"
        _cp(FILE, f"Error processing video {base_name}: {str(e)}", error=True)
        return {"success": False, "error": str(e)}


def update_task_status(task_id, status=None, stage=None, message=None, progress=None):
    """Update task status using the task manager"""
        
    try:
        from src.utils.task import TaskStatus
        from main import task_manager
        
        task = task_manager.get_task(task_id)
        if not task:
            custom_print(FILE, f"Task {task_id} not found for status update")
            return
            
        # Do not apply further updates if task was cancelled
        if task.get("status") == TaskStatus.CANCELLED:
            return
            
        # Prepare update data
        update_data = {}
        
        if status:
            update_data["status"] = status
            
        if stage:
            # Map stage IDs to human-readable names to avoid displaying IDs in UI
            stage_display_names = {
                "audio": "Processing Audio",
                "card": "Creating Cards",
                "video": "Generating Video",
                "subtitle_prep": "Preparing Subtitles",
                "subtitle_frames": "Creating Subtitle Frames",
                "subtitle_overlay": "Applying Subtitle Overlay",
                "init": "Initializing"
            }
            # Always use the mapped stage name if it exists, otherwise use the original
            display_stage = stage_display_names.get(stage, stage)
            update_data["stage"] = display_stage
            
        if message:
            update_data["message"] = message
            
        if progress is not None:
            update_data["progress"] = progress
            
        # Only update if we have changes
        if update_data:
            task_manager.update_task(task_id, update_data)
            
            # Log the update
            custom_print(FILE, f"Task {task_id} Update: Stage: {update_data.get('stage', 'Unknown')}, Message: {update_data.get('message', 'No message')}, Progress: {update_data.get('progress', 0)}")
    except ImportError:
        custom_print(FILE, f"Could not import task_manager to update task {task_id}", error=True)
    except Exception as e:
        custom_print(FILE, f"Error updating task {task_id} status: {str(e)}", error=True)
