import hashlib
import json
import os
import random
import shutil
import subprocess
import tempfile
import traceback
from datetime import datetime
from typing import List, Dict, Tuple, Set, Union, Optional

from PIL import Image, ImageDraw

import ffmpeg

from src.utils.card_generator import RedditCardGenerator
from src.utils.models import Video, BaseProcessor, TaskStatusUpdater
from src.utils.captions import SubtitleProcessor
from src.utils.utils import custom_print, get_ffmpeg_encoder_params

FILE = "video"


class VideoProcessor(BaseProcessor):
    """
    Class responsible for all video processing operations including
    video creation, mixing, and adding subtitles.
    """
    
    def __init__(self, task_id: Optional[str] = None):
        """Initialize the video processor with optional task ID for status updates."""
        self.task_id = task_id
        self.status_updater = TaskStatusUpdater(task_id)
        
        from src.utils.utils import get_hardware_info
        hw_info = get_hardware_info()
        if hw_info['nvidia_gpu']:
            gpu_name = hw_info.get('gpu_name', 'NVIDIA GPU')
            custom_print(FILE, f"🚀 {gpu_name} detected - using NVENC hardware acceleration")
        elif hw_info['apple_silicon']:
            custom_print(FILE, f"🚀 Apple Silicon detected - using VideoToolbox hardware acceleration")
        else:
            custom_print(FILE, f"Running on {hw_info['platform']} ({hw_info['machine']}) - using software encoding")
    
    def get_video_duration(self, video_path: str) -> float:
        """Get the duration of a video file using ffmpeg-python."""
        try:
            probe = ffmpeg.probe(video_path)
            return float(probe['format']['duration'])
        except ffmpeg.Error as e:
            custom_print(FILE, f"Error probing video file: {e.stderr}")
            return 0.0
    
    def get_video_files(self, directory: str) -> List[str]:
        """Get all video files in a directory."""
        if not os.path.exists(directory):
            return []
        
        return [
            os.path.join(directory, f) for f in os.listdir(directory)
            if os.path.isfile(os.path.join(directory, f)) and 
            f.lower().endswith(('.mp4', '.mov', '.avi', '.mkv', '.webm'))
        ]
    
    def update_mix_config(self, mix_path: str, used_combinations: Set[str] = None) -> Dict:
        """Update the mix configuration with the used combinations."""
        config_path = os.path.join(mix_path, 'config.json')
        
        # Read existing config
        if os.path.exists(config_path):
            with open(config_path, 'r') as f:
                config = json.load(f)
        else:
            config = {"name": "Default Mix", "emoji": "🎬", "video_count": 0, "used_combinations": []}
        
        # Add used_combinations to config if provided
        if used_combinations:
            if "used_combinations" not in config:
                config["used_combinations"] = []
            
            for combo in used_combinations:
                if combo not in config["used_combinations"]:
                    config["used_combinations"].append(combo)
        
        # Update video count
        video_count = len(self.get_video_files(mix_path))
        config["video_count"] = video_count
        
        # Save updated config
        with open(config_path, 'w') as f:
            json.dump(config, f)
        
        return config
    
    def generate_clip_combination_hash(self, clips: List[str]) -> str:
        """Generate a unique hash for a combination of clips."""
        # Sort clip filenames for consistent hashing regardless of order
        sorted_clips = sorted([os.path.basename(clip) for clip in clips])
        combined = ''.join(sorted_clips)
        return hashlib.md5(combined.encode()).hexdigest()
    
    def select_clips_for_video(
        self,
        mix_path: str, 
        target_length: float, 
        avoid_recent: bool = True,
        max_attempts: int = 10
    ) -> Tuple[List[Tuple[str, float, float]], str]:
        """
        Select clips from the mix directory to create a video of the target length.
        
        Args:
            mix_path: Path to the mix directory containing video clips
            target_length: Target length of the resulting video in seconds
            avoid_recent: Whether to avoid recently used combinations
            max_attempts: Maximum attempts to find unique combination
            
        Returns:
            Tuple containing:
            - List of (clip_path, start_time, duration) tuples
            - Hash of the selected combination
        """
        # Get video files and their durations
        video_files = self.get_video_files(mix_path)
        
        if not video_files:
            return [], ""
        
        # Read mix config to get used combinations with error handling
        used_combinations = set()
        if avoid_recent:
            config_path = os.path.join(mix_path, 'config.json')
            if os.path.exists(config_path):
                try:
                    with open(config_path, 'r') as f:
                        config = json.load(f)
                        used_combinations = set(config.get("used_combinations", []))
                except (json.JSONDecodeError, IOError, PermissionError) as e:
                    custom_print(FILE, f"Warning: Could not read mix config {config_path}: {e}")
        def _select_random_clips():
            """Helper function to select random clips for target length."""
            random.shuffle(video_files)
            selected_clips = []
            total_duration = 0.0
            
            # Special case: if target length is very short, just cut from a single random clip
            if target_length <= 10.0:  # For very short durations (10 seconds or less)
                for video_file in video_files:
                    duration = self.get_video_duration(video_file)
                    if duration > target_length:
                        # Pick a random start time within the clip, ensuring we have enough content
                        max_start = duration - target_length
                        start_time = random.uniform(0, max(0, max_start))
                        selected_clips.append((video_file, start_time, target_length))
                        return selected_clips
            
            for video_file in video_files:
                duration = self.get_video_duration(video_file)
                if duration <= 0:
                    continue
                
                # If adding this clip exceeds target length, calculate how much of it to use
                if total_duration + duration > target_length:
                    remaining_duration = target_length - total_duration
                    if remaining_duration >= 1.0:  # Reduced minimum from 2.0 to 1.0 seconds
                        # Pick a random start time for variety
                        max_start = duration - remaining_duration
                        start_time = random.uniform(0, max(0, max_start)) if max_start > 0 else 0
                        selected_clips.append((video_file, start_time, remaining_duration))
                    break
                
                # Add the entire clip
                selected_clips.append((video_file, 0, duration))
                total_duration += duration
                
                # If we've reached target length, stop
                if total_duration >= target_length:
                    break
            
            # Fallback: if no clips were selected, use the first available clip with random cut
            if not selected_clips and video_files:
                for video_file in video_files:
                    duration = self.get_video_duration(video_file)
                    if duration > 0:
                        clip_duration = min(duration, target_length)
                        max_start = duration - clip_duration
                        start_time = random.uniform(0, max(0, max_start)) if max_start > 0 else 0
                        selected_clips.append((video_file, start_time, clip_duration))
                        break
            
            return selected_clips
        
        # Try to find a unique combination
        for attempt in range(max_attempts):
            selected_clips = _select_random_clips()
            
            # Check if we have enough clips
            if not selected_clips:
                continue
                
            total_duration = sum(clip[2] for clip in selected_clips)
            if total_duration < target_length * 0.5:
                continue
                
            # Generate combination hash
            clip_paths = [clip[0] for clip in selected_clips]
            combination_hash = self.generate_clip_combination_hash(clip_paths)
            
            # Check if this combination has been used before
            if not avoid_recent or combination_hash not in used_combinations:
                return selected_clips, combination_hash
          # If we couldn't find a unique combination, return the last attempt
        custom_print(FILE, "Could not find a unique combination of clips, using random selection")
        selected_clips = _select_random_clips()
        if selected_clips:
            clip_paths = [clip[0] for clip in selected_clips]
            combination_hash = self.generate_clip_combination_hash(clip_paths)
            return selected_clips, combination_hash
        
        # Final fallback - if still no clips, cut from any available clip
        if video_files:
            video_file = random.choice(video_files)
            duration = self.get_video_duration(video_file)
            if duration > 0:
                clip_duration = min(duration, target_length)
                max_start = max(0, duration - clip_duration)
                start_time = random.uniform(0, max_start) if max_start > 0 else 0
                selected_clips = [(video_file, start_time, clip_duration)]
                combination_hash = self.generate_clip_combination_hash([video_file])
                custom_print(FILE, f"Using fallback clip: {video_file} from {start_time:.2f}s for {clip_duration:.2f}s")
                return selected_clips, combination_hash
        
        # Absolute final fallback - return empty if nothing worked
        return [], ""
    
    def create_video_from_clips(
        self,
        selected_clips: List[Tuple[str, float, float]],
        output_path: str,
        fps: int = 30,
        resolution: Tuple[int, int] = (1080, 1920),  # Default is portrait 9:16
        preset: str = 'medium'
    ) -> bool:
        """
        Create a video from selected clips using ffmpeg-python.
        
        Args:
            selected_clips: List of (clip_path, start_time, duration) tuples
            output_path: Path to save the output video
            fps: Frame rate of the output video
            resolution: Resolution of the output video (width, height)
            preset: ffmpeg preset for encoding speed/quality tradeoff
            
        Returns:
            True if successful, False otherwise
        """
        if not selected_clips:
            custom_print(FILE, "No clips selected, cannot create video", error=True)
            return False
        
        try:
            temp_dir = tempfile.mkdtemp()
            inputs = []
            
            # Process each clip individually with simpler filter chains
            for i, (clip_path, start_time, duration) in enumerate(selected_clips):
                # Prepare the output path for this segment
                segment_path = os.path.join(temp_dir, f"segment_{i}.mp4")
                
                # Process clip with separate filter steps
                try:
                    # First trim the clip
                    stream = ffmpeg.input(clip_path, ss=start_time, t=duration)
                    
                    # Scale maintaining aspect ratio
                    stream = ffmpeg.filter(stream, 'scale', width=resolution[0], height=resolution[1], 
                                         force_original_aspect_ratio='decrease')
                    
                    # Pad to fill target resolution
                    stream = ffmpeg.filter(stream, 'pad', width=resolution[0], height=resolution[1], 
                                         x='(ow-iw)/2', y='(oh-ih)/2')
                      # Set frame rate
                    stream = ffmpeg.filter(stream, 'fps', fps=fps)
                    
                    # Get encoder parameters for optimal performance
                    encoder_params = get_ffmpeg_encoder_params()
                    
                    # Output to segment file with hardware acceleration if available
                    stream = ffmpeg.output(stream, segment_path, pix_fmt='yuv420p', **encoder_params)
                    
                    # Run ffmpeg command
                    ffmpeg.run(stream, quiet=True, overwrite_output=True)
                    
                    inputs.append(segment_path)
                except ffmpeg.Error as e:
                    custom_print(FILE, f"Error processing clip {clip_path}: {e.stderr.decode()}", error=True)
                    continue
            
            if not inputs:
                custom_print(FILE, "No segments were successfully processed", error=True)
                return False
                
            # Create a file list for concatenation
            concat_file = os.path.join(temp_dir, "concat.txt")
            with open(concat_file, 'w') as f:
                for input_file in inputs:
                    f.write(f"file '{input_file}'\n")
            
            # Concatenate all segments
            try:
                (
                    ffmpeg
                    .input(concat_file, format='concat', safe=0)
                    .output(output_path, c='copy')
                    .run(quiet=True, overwrite_output=True)
                )
            except ffmpeg.Error as e:
                custom_print(FILE, f"Error concatenating segments: {e.stderr.decode()}", error=True)
                return False
            
            # Clean up temporary files
            shutil.rmtree(temp_dir)
            
            return os.path.exists(output_path)
        
        except Exception as e:
            custom_print(FILE, f"An error occurred: {str(e)}", error=True)
            # Attempt to clean up
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir)
            return False
    
    def generate_videos_from_mix(
        self,
        mix_path: str,
        output_dir: str,
        file_name: str = None,
        count: int = 1,
        video_length: float = 60,
        fps: int = 30,
        resolution: Tuple[int, int] = (1080, 1920)  # Default is now portrait 9:16
    ) -> List[Union[str, Video]]:
        """
        Generate multiple videos from a mix.
        
        Args:
            mix_path: Path to the mix directory
            output_dir: Directory to save the output videos
            file_name: Base name for the output files (without extension)
            count: Number of videos to generate
            video_length: Length of each video in seconds
            fps: Frame rate of the output videos
            resolution: Resolution of the output videos (width, height)
            
        Returns:
            List of paths to generated videos or Video objects
        """
        # Create output directory if it doesn't exist
        os.makedirs(output_dir, exist_ok=True)
        
        # If no filename provided, use a timestamp-based name
        if not file_name:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            file_name = f"video_{timestamp}"
        
        generated_videos = []
        new_combinations = set()
        
        for i in range(count):
            # Select clips for this video
            selected_clips, combination_hash = self.select_clips_for_video(
                mix_path, 
                video_length, 
                avoid_recent=True
            )
            
            if not selected_clips:
                custom_print(FILE, f"Couldn't select clips for video {i+1}", error=True)
                custom_print(FILE, selected_clips, combination_hash)
                continue
            
            # Create output path
            output_filename = f"{file_name}.mp4" if count == 1 else f"{file_name}_{i+1}.mp4"
            output_path = os.path.join(output_dir, output_filename)
            
            # Create the video
            success = self.create_video_from_clips(
                selected_clips,
                output_path,
                fps=fps,
                resolution=resolution
            )
            
            if success:
                custom_print(FILE, f"Generated video {i+1}/{count}: {output_path}")
                generated_videos.append(output_path)
                new_combinations.add(combination_hash)
            else:
                custom_print(FILE, f"Failed to generate video {i+1}/{count}", error=True)
        
        # Update mix config with newly used combinations
        if new_combinations:
            self.update_mix_config(mix_path, new_combinations)
        return generated_videos
    
    def merge_audio_with_video(
        self,
        video_path: str, 
        audio_path: str, 
        output_path: str, 
        apply_subtitles: bool = True, 
        offset_subtitles: float = 0.5,
        highlight_color: str = "#ffffff",
        font_name: str = "montserrat",
        animations_enabled: bool = True,
        title_duration: Optional[float] = None
    ) -> bool:
        """
        Merge an audio file with a video file using ffmpeg, optionally adding styled, animated subtitles from SRT files.
        
        Args:
            video_path: Path to the video file
            audio_path: Path to the audio file
            output_path: Path to save the merged output
            apply_subtitles: Whether to apply subtitles based on SRT files
            offset_subtitles: Time in seconds to offset the subtitles (usually title duration)
            highlight_color: Hex color string for subtitle highlighting (e.g., "#ffffff")
            animations_enabled: Whether to enable subtitle animations
            title_duration: Duration of the title in seconds, for intro effects.
            
        Returns:
            bool: True if successful, False otherwise
        """
        temp_dir = tempfile.mkdtemp()
        # Intermediate file for video + audio merge, within the temp directory
        video_with_audio_path = os.path.join(temp_dir, "video_with_audio.mp4")
        # Path for the final output (potentially with subtitles), also initially within temp_dir
        final_output_temp_path = os.path.join(temp_dir, os.path.basename(output_path))

        try:
            # Check if input files exist
            if not os.path.exists(video_path):
                custom_print(FILE, f"Video file not found: {video_path}")
                return False
                
            if not os.path.exists(audio_path):
                custom_print(FILE, f"Audio file not found: {audio_path}")
                return False
              
            # Step 1: Merge video and audio using ffmpeg-python
            custom_print(FILE, f"Merging video '{video_path}' and audio '{audio_path}' to '{video_with_audio_path}'")
            self.status_updater.update(stage="video", 
                                      message="Merging video and audio tracks...", 
                                      progress=30)
            
            video_input_stream = ffmpeg.input(video_path)
            audio_input_stream = ffmpeg.input(audio_path)
            
            stream = ffmpeg.output(
                video_input_stream.video, 
                audio_input_stream.audio, 
                video_with_audio_path, 
                vcodec='copy', 
                acodec='aac', 
                shortest=None
            )
            ffmpeg.run(stream, quiet=True, overwrite_output=True)

            
            if not (os.path.exists(video_with_audio_path) and os.path.getsize(video_with_audio_path) > 0):
                custom_print(FILE, f"Failed to merge audio and video to {video_with_audio_path}", error=True)
                self.status_updater.update(stage="video", 
                                          message="Failed to merge audio and video", 
                                          progress=100)
                return False
                
            custom_print(FILE, f"Successfully merged audio and video to {video_with_audio_path}")
            self.status_updater.update(stage="video", 
                                      message="Audio and video merged successfully", 
                                      progress=40)
            
            # Step 2: Apply subtitles if requested
            if apply_subtitles:
                custom_print(FILE, "Attempting to apply subtitles from SRT files...")
                self.status_updater.update(stage="subtitle_prep", 
                                          message="Searching for subtitle files...", 
                                          progress=45)
                
                audio_basename = os.path.basename(audio_path)
                base_name_no_ext = os.path.splitext(audio_basename)[0]
                
                # Get the absolute path to the pycaps template
                subtitle_processor = SubtitleProcessor()
                subtitle_processor.generate_captions(
                    video_with_audio_path=video_with_audio_path,
                    final_output_temp_path=final_output_temp_path,
                    audio_path=audio_path,
                    font_name=font_name,
                    highlight_color=highlight_color,
                    title_text=base_name_no_ext,
                )

                intro_card_path = os.path.join(os.path.dirname(audio_path), "..", "images", f"{base_name_no_ext}.png")

                intro_video_path = self._create_intro_overlay_video(
                    intro_card_path=intro_card_path,
                    title_duration=title_duration,
                    frame_rate=30,
                    width=1080,
                    height=1920,
                    temp_dir=temp_dir,
                )
                if intro_video_path and os.path.exists(intro_video_path):
                    custom_print(FILE, f"Applying intro overlay from {intro_video_path}")
                    self.status_updater.update(stage="subtitle_prep", 
                                              message="Applying intro overlay...", 
                                              progress=55)
                    # Overlay intro video onto the final output with subtitles
                    try:
                        # Create a separate output file to avoid reading and writing to the same file
                        final_with_intro_path = os.path.join(temp_dir, "final_with_intro.mp4")
                        
                        video_stream = ffmpeg.input(final_output_temp_path)
                        intro_stream = ffmpeg.input(intro_video_path)
                        
                        # Overlay intro on top of the video (video only)
                        overlayed_video = ffmpeg.overlay(video_stream.video, intro_stream)
                        
                        # Get encoder parameters optimized for hardware
                        encoder_params = get_ffmpeg_encoder_params()
                        
                        # Output with both overlayed video and original audio
                        stream = ffmpeg.output(
                            overlayed_video,
                            video_stream.audio,
                            final_with_intro_path,
                            acodec='aac',
                            pix_fmt='yuv420p',
                            **encoder_params
                        )
                        ffmpeg.run(stream, quiet=True, overwrite_output=True)
                        
                        # Replace the original file with the one that has the intro
                        if os.path.exists(final_with_intro_path):
                            os.remove(final_output_temp_path)
                            shutil.move(final_with_intro_path, final_output_temp_path)
                            custom_print(FILE, "Successfully applied intro overlay.")
                        else:
                            custom_print(FILE, "Failed to create video with intro overlay", error=True)
                    except ffmpeg.Error as e:
                        custom_print(FILE, f"Error applying intro overlay: {e.stderr.decode()}", error=True)
            else: # apply_subtitles is False
                custom_print(FILE, "apply_subtitles is False. Skipping subtitle application.")
                self.status_updater.update(stage="video", 
                                          message="Skipping subtitle application", 
                                          progress=70)
                shutil.copy(video_with_audio_path, final_output_temp_path)

            # Step 3: Move the final result from temp_dir to the actual output_path
            if os.path.exists(final_output_temp_path) and os.path.getsize(final_output_temp_path) > 0:
                # Ensure destination directory exists
                os.makedirs(os.path.dirname(output_path), exist_ok=True)
                if os.path.exists(output_path):
                    os.remove(output_path)
                shutil.move(final_output_temp_path, output_path)
                custom_print(FILE, f"Successfully created final video: {output_path}")
                return True
            else:
                custom_print(FILE, f"Final output file '{final_output_temp_path}' was not created or is empty.")
                return False

        except Exception as e:
            custom_print(FILE, f"Error in merge_audio_with_video: {str(e)}")
            traceback.print_exc()
            return False
        finally:
            # Clean up temporary directory
            if os.path.exists(temp_dir):
                try:
                    shutil.rmtree(temp_dir)
                    custom_print(FILE, f"Cleaned up temporary directory: {temp_dir}")
                except Exception as e_clean:
                    custom_print(FILE, f"Error cleaning up temp directory {temp_dir}: {e_clean}")


    def _create_intro_overlay_video(self, intro_card_path: str, title_duration: float, 
                                   frame_rate: int, width: int, height: int, 
                                   temp_dir: str) -> str:
        """Create a video overlay for the intro card with the same scaling animation as subtitles"""
        
        # Load the intro card image
        try:
            intro_image = Image.open(intro_card_path).convert('RGBA')
            custom_print(FILE, f"Loaded intro card: {intro_card_path}")
        except Exception as e:
            custom_print(FILE, f"Error loading intro card: {e}", error=True)
            return ""
        
        # Calculate frame count for the title duration + 0.3 seconds fade out
        fade_out_duration = 0.3
        total_duration = title_duration + fade_out_duration
        total_frames = int(total_duration * frame_rate)
        title_frames = int(title_duration * frame_rate)
        fade_frames = int(fade_out_duration * frame_rate)
        
        if total_frames <= 0:
            custom_print(FILE, f"Invalid title duration: {title_duration}s", error=True)
            return ""
        
        # Create frames for the intro card with scaling animation
        intro_frames = []
        for frame_num in range(total_frames):
            # Create base transparent image
            frame = Image.new('RGBA', (width, height), (0, 0, 0, 0))
            
            # Calculate animation progress
            t_ratio = frame_num / max(1, total_frames - 1)
            
            # Apply complex scaling and fade animation based on specifications
            scale = 1.0
            alpha_multiplier = 1.0
            # Frame 1-10: Scale from 60% to 80%
            if frame_num <= 9:  # Frames 0-9 (first 10 frames)
                scale = 0.6 + (0.2 * (frame_num / 9))  # Scale from 0.6 to 0.8
            # During title duration: Scale from 80% to 100%
            elif frame_num < title_frames:  # During the title duration
                remaining_frames = title_frames - 10  # Frames between frame 10 and end of title
                if remaining_frames > 0:
                    progress = (frame_num - 10) / remaining_frames
                    scale = 0.8 + (0.2 * progress)  # Scale from 0.8 to 1.0
                else:
                    scale = 1.0
            # Fade out period: Scale to 110% and fade out
            else:
                fade_progress = (frame_num - title_frames) / fade_frames  # 0 to 1 over fade frames
                scale = 1.0 + (0.1 * fade_progress)  # Scale from 1.0 to 1.1
                alpha_multiplier = 1.0 - fade_progress  # Fade from 1.0 to 0.0
              # Scale the intro card image
            card_image = intro_image.copy()
            if scale != 1.0:
                new_size = (int(intro_image.width * scale), int(intro_image.height * scale))
                card_image = card_image.resize(new_size, Image.LANCZOS)
            
            # Apply alpha fade if needed
            if alpha_multiplier < 1.0:
                # Create a new image with reduced alpha
                faded_image = Image.new('RGBA', card_image.size, (0, 0, 0, 0))
                # Convert to RGBA if not already
                if card_image.mode != 'RGBA':
                    card_image = card_image.convert('RGBA')
                # Apply alpha fade by multiplying alpha channel
                pixels = card_image.load()
                faded_pixels = faded_image.load()
                for y_coord in range(card_image.height):
                    for x_coord in range(card_image.width):
                        r, g, b, a = pixels[x_coord, y_coord]
                        new_alpha = int(a * alpha_multiplier)
                        faded_pixels[x_coord, y_coord] = (r, g, b, new_alpha)
                card_image = faded_image
            
            # Ensure card_image is RGBA for consistent processing
            if card_image.mode != 'RGBA':
                card_image = card_image.convert('RGBA')

            # Calculate final card position
            card_final_x = (width - card_image.width) // 2
            card_final_y = height // 5 - card_image.height // 2
            card_final_y = max(0, card_final_y)            # Only attempt shadow if card has dimensions
            if card_image.width > 0 and card_image.height > 0:
                shadow_offset_x = 6  # Reduced from 10 to 6
                shadow_offset_y = 6  # Reduced from 10 to 6
                base_shadow_color_tuple = (0, 0, 0, 120)  # Increased from 90 to 120 for darker shadow

                # Adjust shadow alpha based on card's alpha_multiplier for fade effect
                animated_shadow_alpha = int(base_shadow_color_tuple[3] * alpha_multiplier)
                shadow_effect_color = (base_shadow_color_tuple[0], base_shadow_color_tuple[1], base_shadow_color_tuple[2], animated_shadow_alpha)

                # Calculate scaled radius for the shadow's shape, assuming original card radius was 30px
                original_card_radius = 30
                # 'scale' is defined earlier in the function based on animation
                current_shadow_radius = int(original_card_radius * scale) 
                
                # Clamp the radius to be valid for the current card_image size
                min_card_dim = min(card_image.width, card_image.height)
                if min_card_dim <= 0: # Avoid division by zero or negative radius if card is too small
                    current_shadow_radius = 1
                else:
                    # Ensure radius is at least 1 if card dimensions are positive,
                    # and not more than half the smallest dimension.
                    current_shadow_radius = max(1, min(current_shadow_radius, min_card_dim // 2))                # Create feathered shadow using multiple layers with decreasing opacity
                feather_distance = max(12, int(15 * scale))  # Reduced from max(15, int(20 * scale)) for tighter shadow
                shadow_layers = 8  # Number of feather layers for smooth gradient
                
                # Calculate position for pasting the shadow
                shadow_pos_x = card_final_x + shadow_offset_x
                shadow_pos_y = card_final_y + shadow_offset_y
                
                # Create multiple shadow layers with increasing size and decreasing opacity
                for layer in range(shadow_layers):
                    # Calculate layer properties
                    layer_progress = layer / (shadow_layers - 1)  # 0 to 1
                    layer_expansion = int(feather_distance * layer_progress)  # How much to expand this layer
                    layer_alpha = int(shadow_effect_color[3] * (1.0 - layer_progress * 0.8))  # Fade out alpha
                    
                    # Create shadow color for this layer
                    layer_shadow_color = (shadow_effect_color[0], shadow_effect_color[1], shadow_effect_color[2], layer_alpha)
                    
                    # Create expanded shadow base for this layer
                    expanded_width = card_image.width + (layer_expansion * 2)
                    expanded_height = card_image.height + (layer_expansion * 2)
                    layer_shadow_base = Image.new('RGBA', (expanded_width, expanded_height), (0, 0, 0, 0))
                    layer_draw = ImageDraw.Draw(layer_shadow_base)
                    
                    # Draw rounded rectangle for this layer with expanded radius
                    layer_radius = current_shadow_radius + layer_expansion
                    layer_radius = max(1, min(layer_radius, min(expanded_width, expanded_height) // 2))
                    
                    if expanded_width > 0 and expanded_height > 0:
                        RedditCardGenerator.draw_rounded_rectangle(
                            draw=layer_draw,
                            xy=[(0, 0), (expanded_width, expanded_height)],
                            fill=layer_shadow_color,
                            radius=layer_radius
                        )
                        
                        # Paste this shadow layer offset by the expansion amount
                        layer_pos_x = shadow_pos_x - layer_expansion
                        layer_pos_y = shadow_pos_y - layer_expansion
                        frame.paste(layer_shadow_base, (layer_pos_x, layer_pos_y), layer_shadow_base)
            
            # Paste the actual card image on top of the shadow (or directly if no shadow was created)
            frame.paste(card_image, (card_final_x, card_final_y), card_image)
            
            # Save frame
            frame_path = os.path.join(temp_dir, f"intro_frame_{frame_num:05d}.png")
            frame.save(frame_path, "PNG")
            intro_frames.append(frame_path)
        
        # Create intro overlay video
        intro_video_path = os.path.join(temp_dir, "intro_overlay.mov")
        
        # Create frame list for ffmpeg
        frame_list_path = os.path.join(temp_dir, "intro_frames.txt")
        frame_duration = 1.0 / frame_rate
        
        with open(frame_list_path, 'w') as f:
            for frame_path in intro_frames:
                normalized_path = frame_path.replace('\\', '/')
                f.write(f"file '{normalized_path}'\n")
                f.write(f"duration {frame_duration}\n")
        
        try:
            from src.utils.utils import get_hardware_info
            hw_info = get_hardware_info()
            
            if hw_info['nvidia_gpu']:
                cmd = [
                    "ffmpeg", "-y",
                    "-f", "concat", "-safe", "0", "-i", frame_list_path,
                    "-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le",
                    "-r", str(frame_rate),
                    intro_video_path
                ]
            elif hw_info['apple_silicon']:
                cmd = [
                    "ffmpeg", "-y",
                    "-f", "concat", "-safe", "0", "-i", frame_list_path,
                    "-c:v", "prores_ks", "-profile:v", "4444", 
                    "-pix_fmt", "yuva444p10le", "-vendor", "apl0",
                    "-r", str(frame_rate),
                    intro_video_path
                ]
            else:
                cmd = [
                    "ffmpeg", "-y",
                    "-f", "concat", "-safe", "0", "-i", frame_list_path,
                    "-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le",
                    "-r", str(frame_rate),
                    intro_video_path
                ]
            
            custom_print(FILE, f"Creating intro overlay video: {' '.join(cmd)}")
            result = subprocess.run(cmd, check=False, capture_output=True, text=True)
            
            if result.returncode != 0:
                custom_print(FILE, f"ffmpeg error: {result.stderr}", error=True)
                raise subprocess.CalledProcessError(result.returncode, cmd, result.stdout, result.stderr)
            
            if not os.path.exists(intro_video_path):
                custom_print(FILE, "Failed to create intro overlay video", error=True)
                return ""
            
            custom_print(FILE, f"Created intro overlay video: {intro_video_path}")
            self.status_updater.update(stage="subtitle_overlay", 
                                      message="Intro card overlay created successfully", 
                                      progress=85)
            
            return intro_video_path
            
            
        except subprocess.CalledProcessError as e:
            custom_print(FILE, f"Error creating intro overlay video: {e}", error=True)
            return ""
