import os
import shutil
from typing import Dict, List, Optional, Tuple, Union
import unicodedata
import json
from dotenv import load_dotenv
from pydub import AudioSegment

from src.utils.elevenlabs import ElevenlabsTTS
from src.utils.models import Video, TaskStatusUpdater
from src.utils.audio_process import AudioProcessor
from src.utils.text_utils import process_text_files
from src.utils.utils import custom_print
from src.utils.ai33 import AI33TTS

FILE = "audio"
POP_SFX = "src/assets/pop_sfx.mp3"



class AudioPipeline:
    """Orchestrates the full audio processing pipeline."""
    
    def __init__(self, task_id: Optional[str] = None):
        self.task_id = task_id
        self.status_updater = TaskStatusUpdater(task_id)
        self.audio_processor = AudioProcessor(task_id)
        self.tts_converter: Optional[Union[ElevenlabsTTS, AI33TTS]] = None
    
    def adjust_transcription_timings(self, audio_path: str, speed_multiplier: float) -> bool:
        """
        Adjust timings in the saved JSON transcript after audio speed adjustment.
        
        Args:
            audio_path: Path to the audio file (e.g., "file.mp3")
            speed_multiplier: Speed multiplier that was applied to the audio
            
        Returns:
            True if successful, False otherwise
        """
        json_path = audio_path.replace(".mp3", ".json")
        
        if not os.path.exists(json_path):
            custom_print(FILE, f"Transcript file not found: {json_path}", error=True)
            return False
        
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                transcript_data = json.load(f)
            
            def adjust_time_in_dict(data):
                """Recursively adjust all time values in a dictionary."""
                if isinstance(data, dict):
                    for key, value in data.items():
                        if key in ["start", "end"] and isinstance(value, (int, float)):
                            data[key] = value / speed_multiplier
                        else:
                            adjust_time_in_dict(value)
                elif isinstance(data, list):
                    for item in data:
                        adjust_time_in_dict(item)
            
            adjust_time_in_dict(transcript_data)
            
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(transcript_data, f, indent=2)
            
            custom_print(FILE, f"Adjusted transcript timings by {speed_multiplier:.2f}x in {json_path}")
            return True
            
        except Exception as e:
            custom_print(FILE, f"Error adjusting transcript timings: {e}", error=True)
            return False
    
    def _process_audio_for_text(self, text: str, title: str, voice_name: str,
                              output_dir: str, base_name: str, video_length: int,
                              silence_settings: Dict, voice_model: str) -> Optional[Video]:
        """
        Process a single text to create title and content audio with subtitles.
        
        Args:
            text: Content text to convert to speech
            title: Title text to convert to speech
            voice_name: Name of the voice to use
            output_dir: Directory to save the output files
            base_name: Base name for the output files
            video_length: Target video length in seconds (audio will be sped up if longer than this)
            silence_settings: Optional settings for silence removal
              Returns:
            Video object with the processed audio paths and durations
        """
            
        # Create output file paths
        raw_output = os.path.join(output_dir, f"{base_name}_raw.mp3")
        final_output = os.path.join(output_dir, f"{base_name}.mp3")

        try:
            # Combine title and content with double newline separator
            combined_text = f"{title.replace('_', '?')}\n\n{text}"
            combined_text = unicodedata.normalize("NFC", combined_text)
            combined_text = combined_text.replace("—", "")
            quote_replacements = {
                '”': '"',  # Left double quotation mark
                '“': '"',  # Right double quotation mark
                '„': '"',  # Double low-9 quotation mark
            }
            
            for old_quote, new_quote in quote_replacements.items():
                combined_text = combined_text.replace(old_quote, new_quote)

            custom_print(FILE, f"Converting text to speech for {title}")
            
            # Step 1: Convert text to speech (raw audio)
            if voice_name.startswith("ai33-"):
                self.tts_converter = AI33TTS()
            else:
                # Default to ElevenLabs for all other voices (including no prefix)
                self.tts_converter = ElevenlabsTTS()

            print(f"Using voice model: {voice_model}")
            if voice_model.lower() == "default":
                result = self.tts_converter.convert_text(
                    combined_text, voice_name, raw_output
                )
            else:
                result = self.tts_converter.convert_text(
                    combined_text, voice_name, raw_output, model=voice_model
                )

            if type(result) is str:
                timing_data = None
            else:
                timing_data = result.get('timing_data', None)

            current_audio_path = raw_output
            
            # Step 2: Apply silence removal if configured
            silence_adjusted_path = os.path.join(output_dir, f"{base_name}_silence.mp3")
            silence_params = silence_settings or {'min_silence_len': 400, 'silence_thresh': -35}
            timing_data = self.tts_converter.process_audio_silence(
                current_audio_path,
                silence_adjusted_path,
                timing_data,
                silence_params.get('min_silence_len', 400),
                silence_params.get('silence_thresh', -35)
            )
            
            current_audio_path = silence_adjusted_path

            # Step 3: create transcript file
            title_duration = 0.0
            shutil.copy(current_audio_path, final_output)
            if timing_data:
                title_duration = self.tts_converter.save_transcription(combined_text, timing_data, final_output, title=title)
            else:
                # ai33
                title_duration = self.tts_converter.save_transcription(combined_text, final_output, title=title)
            os.remove(final_output)
            
            
            # Step 4: Check duration and apply speed adjustment if needed
            current_duration = self.audio_processor.get_audio_duration(current_audio_path)
            speed_multiplier = 1.0
            
            if video_length > 0 and current_duration > video_length:
                # Calculate required speed multiplier to fit within video_length
                speed_multiplier = current_duration / video_length
                custom_print(FILE, f"Audio duration ({current_duration:.2f}s) exceeds video length ({video_length}s)")
                custom_print(FILE, f"Applying speed multiplier: {speed_multiplier:.2f}x")
                
                # Apply speed adjustment using ffmpeg atempo filter for better quality
                import subprocess
                
                # atempo filter has a limit of 0.5-2.0, so we may need to chain multiple filters
                atempo_filters = []
                remaining_speed = speed_multiplier
                
                while remaining_speed > 2.0:
                    atempo_filters.append("atempo=2.0")
                    remaining_speed /= 2.0
                
                while remaining_speed < 0.5:
                    atempo_filters.append("atempo=0.5")
                    remaining_speed /= 0.5
                
                if remaining_speed != 1.0:
                    atempo_filters.append(f"atempo={remaining_speed}")
                
                filter_chain = ",".join(atempo_filters)
                
                cmd = [
                    "ffmpeg",
                    "-i", current_audio_path,
                    "-filter:a", filter_chain,
                    "-y",
                    final_output
                ]
                
                custom_print(FILE, f"Running ffmpeg with filter: {filter_chain}")
                result = subprocess.run(cmd, capture_output=True, text=True)
                
                if result.returncode != 0:
                    custom_print(FILE, f"ffmpeg error: {result.stderr}", error=True)
                    raise Exception(f"ffmpeg speed adjustment failed: {result.stderr}")
                
                # adjust transcription timings
                self.adjust_transcription_timings(final_output, speed_multiplier)
                # adjust title duration
                title_duration /= speed_multiplier
            else:
                # No speed adjustment needed, copy to final output
                shutil.copy(current_audio_path, final_output)
            

            # Step 5: Add pop sound effect at the beginning
            self._add_pop_sound_effect(final_output)
            
            # Step 6: Clean up temporary files
            for temp_file in [raw_output, silence_adjusted_path]:
                if os.path.exists(temp_file) and temp_file != final_output:
                    os.remove(temp_file)
            
            # Calculate content duration
            current_duration = self.audio_processor.get_audio_duration(final_output)
            content_duration = current_duration - title_duration
            
            # Create a Video object with calculated durations
            video_obj = Video(
                title=title,
                content=text,
                title_duration=title_duration,
                content_duration=content_duration,
                audio_path=final_output,
                video_path=None,
                introcard_path=None,
                final_video_path=None
            )
            
            return video_obj
                  
        except Exception as e:
            custom_print(FILE, f"Error processing audio for {base_name}: {str(e)}", error=True)
            return None
    
    def _add_background_music(self, audio_path: str, music_path: str) -> bool:
        """
        Add background music to an audio file.
        
        Args:
            audio_path: Path to the speech audio file
            music_path: Path to the background music file
            
        Returns:
            True if successful, False otherwise
        """
        if not os.path.exists(audio_path) or not os.path.exists(music_path):
            return False
            
        try:
            # Load audio files
            speech_audio = AudioSegment.from_file(audio_path)
            music_audio = AudioSegment.from_file(music_path)
            
            # Calculate the combined duration in milliseconds
            combined_length_ms = len(speech_audio)
            
            # If music is shorter than speech, loop it
            if len(music_audio) < combined_length_ms:
                # Calculate how many loops we need
                loops_needed = int(combined_length_ms / len(music_audio)) + 1
                music_audio = music_audio * loops_needed
            
            # Trim music to match the combined audio length
            music_audio = music_audio[:combined_length_ms]
            
            # Mix the audio files
            combined_audio = speech_audio.overlay(music_audio)
              # Export back to the same file
            combined_audio.export(audio_path, format="mp3")
            
            return True
        except Exception as e:
            custom_print(FILE, f"Error adding background music: {e}", error=True)
            return False

    def process(self, output_dir: str, voice_name: str, video_length: int,
                silence_settings: Optional[Dict],
                uploaded_files: Optional[List[str]],
                filename_mapping: Optional[Dict[str, str]],
                form_data: Optional[Dict]) -> Dict[str, Video]:
        """
        Complete pipeline to process text files to audio.
        Implements the full text-to-audio process including silence removal and subtitle generation.
        
        Args:
            output_dir: Directory to save processed audio files
            voice_name: Name of the ElevenLabs voice to use
            video_length: Target video length in seconds
            silence_settings: Optional dict with 'min_silence_len' and 'silence_thresh'
            uploaded_files: Optional list of specific file paths to process
            filename_mapping: Optional mapping of file paths to original filenames
            form_data: Optional form data containing music selection
        
        Returns:
            Dictionary mapping filenames to Video objects with audio paths and durations
        """
        # Ensure output directory exists
        os.makedirs(output_dir, exist_ok=True)
        
        # 1. Process text files
        text_files = process_text_files(
            specific_files=uploaded_files, 
            filename_mapping=filename_mapping
        )
        if not text_files:
            custom_print(FILE, "No text files found in input directory", error=True)
            return {}
        
        # 2. Process each file to generate audio
        video_objects = {}
        
        for base_name, file_data in text_files.items():
            # Get the file data
            text_content = file_data["content"]
            original_filename = file_data["original_filename"]
            # Get pure filename without extension for title
            original_title = os.path.splitext(original_filename)[0]
            
            # Process this text file
            video_obj = self._process_audio_for_text(
                text=text_content,
                title=original_title,
                voice_name=voice_name,
                output_dir=output_dir,
                base_name=base_name,
                video_length=video_length,
                silence_settings=silence_settings,
                voice_model=form_data.get("profile_config", {}).get("voice_model", "default") if form_data else "default"
            )
            
            if video_obj:
                # Check if we need to add background music
                if form_data and "profile_config" in form_data and "music" in form_data["profile_config"] and form_data["profile_config"]["music"] != "none":
                    # Define music directory - use a standard location
                    music_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(output_dir))), "Assets", "Music")
                    music_path = os.path.join(music_dir, form_data["profile_config"]["music"])
                    custom_print(FILE, f"Music path: {music_path}")
                    
                    if os.path.exists(music_path):
                        custom_print(FILE, f"Adding background music from {music_path}")
                        self._add_background_music(video_obj.audio_path, music_path)
                
                video_objects[base_name] = video_obj
                custom_print(FILE, f"Audio processing complete for {original_title}: Title: {video_obj.title_duration}s, Content: {video_obj.content_duration}s")
        
        custom_print(FILE, f"Audio generation completed. Files saved to {output_dir}")
        return video_objects
    
    def _add_pop_sound_effect(self, audio_path: str) -> bool:
        """
        Add a pop sound effect at the beginning of the audio file.
        
        Args:
            audio_path: Path to the audio file to modify
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Check if pop sound effect file exists
            if not os.path.exists(POP_SFX):
                custom_print(FILE, f"Pop SFX file not found: {POP_SFX}. Skipping pop effect.", error=True)
                return False
            
            # Load the main audio and pop sound effect
            main_audio = AudioSegment.from_file(audio_path)
            pop_sfx = AudioSegment.from_file(POP_SFX)
            
            # Ensure pop effect is not too long (limit to 500ms)
            if len(pop_sfx) > 500:
                pop_sfx = pop_sfx[:500]
            
            
            # Add the pop at the very beginning
            # Overlay pop effect with main audio
            final_audio = main_audio.overlay(pop_sfx)
            
            # Export the combined audio back to the same file
            final_audio.export(audio_path, format="mp3")
            
            custom_print(FILE, f"Added pop sound effect at the beginning of {audio_path}")
            return True
            
        except Exception as e:
            custom_print(FILE, f"Error adding pop sound effect: {e}", error=True)
            return False


# Export convenience functions for backward compatibility
def get_audio_duration(audio_path: str) -> float:
    """Backward compatibility function for get_audio_duration"""
    processor = AudioProcessor()
    return processor.get_audio_duration(audio_path)

def get_available_voices() -> List[Dict[str, str]]:
    """
    Returns list of available voice names from ElevenLabs API.
    Backward compatibility function.
    
    Returns:
        list: List of dictionaries containing voice information
    """    # Load environment variables
    load_dotenv()
    try:
        converter = ElevenlabsTTS()
        return converter.get_available_voices()
    except Exception as e:
        custom_print(FILE, f"Error getting available voices: {e}", error=True)
        return []


