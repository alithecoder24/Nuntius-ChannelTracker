import os
import shutil
from typing import Dict, List, Optional, Tuple, Union
from pydub import AudioSegment, silence

from src.utils.models import BaseProcessor, TaskStatusUpdater
from src.utils.utils import custom_print

FILE = "audio_process"

class AudioProcessor(BaseProcessor):
    """Class for handling audio processing tasks."""
    
    def __init__(self, task_id: Optional[str] = None):
        self.task_id = task_id
        self.status_updater = TaskStatusUpdater(task_id)

    def get_audio_duration(self, audio_path: str) -> float:
        """
        Get the duration of an audio file using pydub.
        
        Args:
            audio_path: Path to the audio file
              Returns:
            Float: Duration of the audio file in seconds, or 0 if file cannot be read
        """
        try:
            if not os.path.exists(audio_path):
                custom_print(FILE, f"Audio file not found: {audio_path}", error=True)
                return 0
                
            audio = AudioSegment.from_file(audio_path)
            return audio.duration_seconds
        except Exception as e:
            custom_print(FILE, f"Error getting audio duration: {str(e)}", error=True)
            return 0
    
    def remove_silence(self, audio_path: str, output_path: str,
                      min_silence_len: int = 200, silence_thresh: float = -40,
                      return_timing_segments: bool = False) -> Tuple[Optional[float], Optional[List[Tuple[float, float]]]]:
        """
        Remove silence from an audio file and save the output with optional timing tracking.
        
        Args:
            audio_path: Path to the input audio file
            output_path: Path to save the processed audio
            min_silence_len: Minimum length of silence to detect in ms
            silence_thresh: Silence threshold in dB
            return_timing_segments: If True, returns timing segments for timing adjustment
            
        Returns:
            Tuple: (Duration of processed audio in seconds or None if failed, 
                   List of (start_time, end_time) tuples for kept audio segments in original timeline or None)
        """
        custom_print(FILE, f"Loading {audio_path}")
        sound = AudioSegment.from_file(audio_path)
        custom_print(FILE, f"Loaded successfully: Duration {sound.duration_seconds} seconds")
        
        if sound.duration_seconds < 0.1:
            custom_print(FILE, f"Audio duration is too short: {sound.duration_seconds} seconds. Skipping export.", error=True)
            return None, None

        # Detect silence ranges in the original audio
        silence_ranges = silence.detect_silence(
            sound, 
            min_silence_len=min_silence_len, 
            silence_thresh=silence_thresh
        )
        
        custom_print(FILE, f"Detected {len(silence_ranges)} silence ranges")
        
        # If no silence detected, return original audio
        if not silence_ranges:
            sound.export(output_path, format=output_path.split(".")[-1])
            duration = sound.duration_seconds
            timing_segments = [(0.0, duration)] if return_timing_segments else None
            return duration, timing_segments
        
        # Build segments of audio to keep (non-silent parts)
        keep_segments = []
        last_end = 0
        
        for silence_start, silence_end in silence_ranges:
            if silence_start > last_end:
                keep_segments.append((last_end, silence_start))
            last_end = silence_end
        
        # Add the final segment after the last silence
        if last_end < len(sound):
            keep_segments.append((last_end, len(sound)))
        
        if not keep_segments:
            custom_print(FILE, "No audio segments to keep after silence removal.", error=True)
            return None, None
        
        custom_print(FILE, f"Keeping {len(keep_segments)} audio segments")
        
        # Build the processed audio and timing mapping
        processed_sound = AudioSegment.empty()
        timing_segments = [] if return_timing_segments else None
        
        for i, (start_ms, end_ms) in enumerate(keep_segments):
            segment = sound[start_ms:end_ms]
            processed_sound += segment
            
            # Add small gap between segments (except for the last one)
            if i < len(keep_segments) - 1:
                processed_sound += AudioSegment.silent(duration=50)  # 50ms gap
            
            # Convert to seconds and store timing if requested
            if return_timing_segments:
                original_start_sec = start_ms / 1000.0
                original_end_sec = end_ms / 1000.0
                timing_segments.append((original_start_sec, original_end_sec))
                custom_print(FILE, f"Segment {i}: {original_start_sec:.3f}s - {original_end_sec:.3f}s (duration: {(end_ms - start_ms)/1000:.3f}s)")
        if return_timing_segments:
            # Add 3db volume boost to the processed audio
            processed_sound = processed_sound + 3
        
        # Export the processed audio
        processed_sound.export(output_path, format=output_path.split(".")[-1])
        custom_print(FILE, f"Saved processed audio to {output_path}")
        custom_print(FILE, f"Original duration: {sound.duration_seconds:.3f}s, Processed duration: {processed_sound.duration_seconds:.3f}s")
        custom_print(FILE, f"Removed {sound.duration_seconds - processed_sound.duration_seconds:.3f}s of silence")
        
        return processed_sound.duration_seconds, timing_segments


