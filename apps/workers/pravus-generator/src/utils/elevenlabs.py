import base64
import os
import unicodedata
from typing import Any, Dict, List, Optional, Tuple, Union
from dotenv import load_dotenv
from elevenlabs import AudioWithTimestampsResponse, VoiceSettings
from elevenlabs.client import ElevenLabs
from pydub import AudioSegment, silence

from src.utils.models import CharacterTiming, WordTiming
from src.utils.speech_to_text import parse_elevenlabs_timing_data
from src.utils.utils import custom_print
from src.utils.audio_process import AudioProcessor


FILE = "elevenlabs"


class ElevenlabsTTS:
    """Class for converting text to speech using ElevenLabs API."""
    
    def __init__(self, api_key: Optional[str] = None):
        """Initialize the Text to Audio Converter."""
        if not api_key:
            load_dotenv()
            api_key = os.getenv('ELEVENLABS_API_KEY')
            
        if not api_key:
            raise ValueError("API key not found. Please provide an API key or set ELEVENLABS_API_KEY in .env file.")
            
        self.client = ElevenLabs(api_key=api_key)
        self.audio_processor = AudioProcessor()
        
        self.voice_settings = VoiceSettings(
            stability=0.5,
            similarity_boost=1,
            style=0,
            use_speaker_boost=True,
            speed=1.15
        )
        
        self.voice_list = []
        self._voices_cached = False
        
        self.model_list = []
        self._models_cached = False
    
    def _fetch_voices(self) -> None:
        """Fetch voices from ElevenLabs API and cache them."""
        try:
            custom_print(FILE, "Fetching voices from ElevenLabs API...")
            self.voice_list = self.client.voices.get_all(show_legacy=True).voices
            self._voices_cached = True
            custom_print(FILE, f"Fetched {len(self.voice_list)} ElevenLabs voices")
        except Exception as e:
            self.voice_list = []
            raise RuntimeError(f"Failed to fetch voices: {str(e)}")
    
    def _fetch_models(self) -> None:
        """Fetch available TTS models from ElevenLabs API and cache them."""
        try:
            custom_print(FILE, "Fetching models from ElevenLabs API...")
            self.model_list = self.client.models.list()
            custom_print(FILE, f"Fetched {len(self.model_list)} ElevenLabs models")
        except Exception as e:
            self.model_list = []
            raise RuntimeError(f"Failed to fetch models: {str(e)}")
    
    def get_available_voices(self, force_refresh: bool = False) -> List[Dict[str, str]]:
        """
        Returns list of available voice names from ElevenLabs API.
        Uses cached voices unless force_refresh is True.
        
        Args:
            force_refresh: If True, fetch voices from API even if cached
        
        Returns:
            list: List of dictionaries containing voice information
        """
        if not self._voices_cached or force_refresh:
            self._fetch_voices()
        else:
            custom_print(FILE, f"Using cached ElevenLabs voices ({len(self.voice_list)} voices)")
        
        return [{"voice_id": f"elevenlabs/{voice.voice_id}", "name": f"elevenlabs/{voice.name}"} for voice in self.voice_list]
    
    def get_available_models(self, force_refresh: bool = False) -> List[Dict[str, str]]:
        """
        Returns list of available TTS models from ElevenLabs API.
        Uses cached models unless force_refresh is True.
        
        Args:
            force_refresh: If True, fetch models from API even if cached
        
        Returns:
            list: List of dictionaries containing model information
        """
        if not self._models_cached or force_refresh:
            self._fetch_models()
        else:
            custom_print(FILE, f"Using cached ElevenLabs models ({len(self.model_list)} models)")
        
        return [{
            "model_id": model.model_id,
            "name": "elevenlabs/" + model.name,
            "description": getattr(model, 'description', ''),
            "can_do_text_to_speech": getattr(model, 'can_do_text_to_speech', False),
            "can_do_voice_conversion": getattr(model, 'can_do_voice_conversion', False)
        } for model in self.model_list]
    
    def convert_text(self, text: str, voice_id: str, output_filename: str, 
                   model: str = "eleven_multilingual_v2") -> Dict:
        """
        Convert text to audio and save to file. Returns timing data for further processing.
        
        Args:
            text: Text to convert to speech
            voice_id: Voice ID with prefix (e.g., "elevenlabs/{voice_id}")
            output_filename: Path to save the output audio file
            model: Model ID to use for TTS
            
        Returns:
            Dictionary with 'audio_path' and 'timing_data' (ElevenLabs response with alignment)
        """
        if not self._voices_cached:
            self._fetch_voices()
        
        clean_voice_id = voice_id
        
        if "/" in voice_id:
            parts = voice_id.split("/")
            if len(parts) == 2:
                prefix = parts[0]
                clean_voice_id = parts[1]
                if prefix != "elevenlabs":
                    raise ValueError(f"Voice ID '{voice_id}' must have 'elevenlabs/' prefix")
        else:
            raise ValueError(f"Voice ID '{voice_id}' must include 'elevenlabs/' prefix")
        
        # Verify the voice exists in our cached list
        voice_exists = any(v.voice_id == clean_voice_id for v in self.voice_list)
        if not voice_exists:
            raise ValueError(f"Voice ID '{clean_voice_id}' not found in available voices")
        
        try:
            audio_response: AudioWithTimestampsResponse = self.client.text_to_speech.convert_with_timestamps(
                voice_settings=self.voice_settings,
                text=unicodedata.normalize("NFC", text),
                voice_id=clean_voice_id,
                model_id=model,
            )
            custom_print(FILE, f"Generated audio with ElevenLabs voice ID '{clean_voice_id}'")
            
            # Save the raw audio directly
            with open(output_filename, 'wb') as f:
                f.write(base64.b64decode(audio_response.audio_base_64))
            
            custom_print(FILE, f"Saved raw audio to: {output_filename}")
            
            # Return the audio path and timing data for further processing
            return {
                'audio_path': output_filename,
                'timing_data': audio_response
            }
            
        except Exception as e:
            raise RuntimeError(f"Failed to convert text: {str(e)}")

    def save_transcription(self, original_text, timing_data, output_path, title: str = None) -> float:
        """
        Saves transcription to an output file.
        
        Args:
            original_text: Original text that was sent to TTS
            timing_data: Timing data from ElevenLabs
            output_path: Path to save the transcription
            title: Optional title text to extract duration for
            
        Returns:
            Title duration in seconds
        """
        custom_print(FILE, f"Saving ElevenLabs transcription to {output_path}")
        document, title_duration = parse_elevenlabs_timing_data(
            original_text=original_text,
            timing_data=timing_data,
            audio_path=output_path,
            title=title
        )
        return title_duration

    def remove_pauses(self, audio_path: str, output_path: str,
                     min_silence_len: int = 200, silence_thresh: float = -40) -> Tuple[Optional[float], List[Tuple[float, float]]]:
        """
        Remove silence from an audio file and save the output with accurate timing tracking.
        
        Args:
            audio_path: Path to the input audio file
            output_path: Path to save the processed audio
            min_silence_len: Minimum length of silence to detect in ms
            silence_thresh: Silence threshold in dB
            
        Returns:
            Tuple: (Duration of processed audio in seconds or None if failed, 
                   List of (start_time, end_time) tuples for kept audio segments in original timeline)
        """
        return self.audio_processor.remove_silence(
            audio_path=audio_path,
            output_path=output_path,
            min_silence_len=min_silence_len,
            silence_thresh=silence_thresh,
            return_timing_segments=True
        )

    def adjust_elevenlabs_timing(self, elevenlabs_response: Union[Dict, object],
                               timing_segments: List[Tuple[float, float]]) -> Union[Dict, object]:
        """
        Adjust ElevenLabs response timing data based on audio processing segments.
        Maps original timestamps to new compressed timeline after silence removal.
        
        Args:
            elevenlabs_response: Original ElevenLabs response with timing data
            timing_segments: List of (start_time, end_time) tuples for kept audio segments in original timeline
            
        Returns:
            Modified ElevenLabs response with adjusted timing
        """
        if not timing_segments:
            return elevenlabs_response
        
        custom_print(FILE, f"Adjusting ElevenLabs timing for {len(timing_segments)} segments")
        
        # Handle direct object with alignment attribute
        if hasattr(elevenlabs_response, 'alignment'):
            characters = list(elevenlabs_response.alignment.characters)
            char_starts = list(elevenlabs_response.alignment.character_start_times_seconds)
            char_ends = list(elevenlabs_response.alignment.character_end_times_seconds)
        # Handle dictionary format
        elif isinstance(elevenlabs_response, dict) and 'alignment' in elevenlabs_response:
            alignment = elevenlabs_response.get('alignment', {})
            characters = list(alignment.get('characters', []))
            char_starts = list(alignment.get('character_start_times_seconds', []))
            char_ends = list(alignment.get('character_end_times_seconds', []))
        else:
            return elevenlabs_response
        
        custom_print(FILE, f"Original timing - Characters: {len(characters)}, Time range: {char_starts[0] if char_starts else 0:.3f}s - {char_ends[-1] if char_ends else 0:.3f}s")
        custom_print(FILE, f"Timing segments: {timing_segments}")
        
        # Create precise mapping function that accounts for segment gaps
        def map_timestamp_to_compressed_timeline(original_time: float) -> Optional[float]:
            """
            Map an original timestamp to the new compressed timeline with precise accuracy.
            Returns None if the timestamp falls in removed silence.
            """
            compressed_time = 0.0
            
            # Handle edge case: time before first segment
            if not timing_segments or original_time < timing_segments[0][0]:
                return None
            
            for i, (seg_start, seg_end) in enumerate(timing_segments):
                if seg_start <= original_time <= seg_end:
                    # Timestamp is within this segment
                    offset_in_segment = original_time - seg_start
                    result_time = compressed_time + offset_in_segment
                    return result_time
                elif original_time < seg_start:
                    # Timestamp is in a gap between segments (removed silence)
                    # Map it to the start of the current segment in compressed time
                    return compressed_time
                else:
                    # Timestamp is after this segment, add segment duration and continue
                    segment_duration = seg_end - seg_start
                    compressed_time += segment_duration
                    
                    # Add the 50ms gap that was inserted between segments (except for last segment)
                    if i < len(timing_segments) - 1:
                        compressed_time += 0.05  # 50ms = 0.05s
            
            # Timestamp is after all segments (in trailing silence)
            # Map to the end of the compressed audio
            return compressed_time
        
        # Process characters and adjust timing
        new_characters = []
        new_char_starts = []
        new_char_ends = []
        
        for i, (char, start_time, end_time) in enumerate(zip(characters, char_starts, char_ends)):
            # Map start and end times
            new_start = map_timestamp_to_compressed_timeline(start_time)
            new_end = map_timestamp_to_compressed_timeline(end_time)
            
            # Handle the case where character spans across silence removal
            if new_start is not None and new_end is None:
                # Character starts in audio but ends in silence
                # Set end time to a small offset from start
                new_end = new_start + 0.01
            elif new_start is None and new_end is not None:
                # Character starts in silence but ends in audio (rare case)
                # Set start time to same as end
                new_start = max(0, new_end - 0.01)
              # Keep all characters, even if they fall in removed silence
            if new_start is not None and new_end is not None:
                # Ensure end time is not before start time
                if new_end < new_start:
                    new_end = new_start + 0.01  # Minimum 10ms duration
            else:
                # Character falls in removed silence - assign it to nearest valid time
                if new_start is None and new_end is None:
                    # Both times are in silence, find the closest valid segment
                    closest_time = None
                    min_distance = float('inf')
                    
                    for seg_start, seg_end in timing_segments:
                        # Check distance to start of segment
                        dist_to_start = abs(start_time - seg_start)
                        if dist_to_start < min_distance:
                            min_distance = dist_to_start
                            closest_time = map_timestamp_to_compressed_timeline(seg_start)
                        
                        # Check distance to end of segment  
                        dist_to_end = abs(start_time - seg_end)
                        if dist_to_end < min_distance:
                            min_distance = dist_to_end
                            closest_time = map_timestamp_to_compressed_timeline(seg_end)
                    
                    if closest_time is not None:
                        new_start = closest_time
                        new_end = closest_time + 0.01
                    else:
                        # Fallback to start of audio
                        new_start = 0.0
                        new_end = 0.01
                elif new_start is None:
                    new_start = max(0, new_end - 0.01)
                elif new_end is None:
                    new_end = new_start + 0.01
            
            new_characters.append(char)
            new_char_starts.append(new_start)
            new_char_ends.append(new_end)
        
        custom_print(FILE, f"Adjusted timing - Characters: {len(new_characters)}, Time range: {new_char_starts[0] if new_char_starts else 0:.3f}s - {new_char_ends[-1] if new_char_ends else 0:.3f}s")
        custom_print(FILE, f"Removed {len(characters) - len(new_characters)} characters from silence")
        
        # Create a new response with adjusted timing
        if hasattr(elevenlabs_response, 'alignment'):
            # For object format, create a dictionary representation
            adjusted_response = {
                'alignment': {
                    'characters': new_characters,
                    'character_start_times_seconds': new_char_starts,
                    'character_end_times_seconds': new_char_ends
                }
            }
            return adjusted_response
        elif isinstance(elevenlabs_response, dict):
            # For dictionary format, create a copy with new timing
            adjusted_response = dict(elevenlabs_response)
            adjusted_response['alignment'] = {
                'characters': new_characters,
                'character_start_times_seconds': new_char_starts,
                'character_end_times_seconds': new_char_ends
            }
            return adjusted_response
        
        return elevenlabs_response
    
    def process_audio_silence(self, audio_path: str, output_path: str, timing_data: Union[Dict, Any],
                             min_silence_len: int = 200, silence_thresh: float = -40) -> Tuple[Optional[float], Union[Dict, Any]]:
        """
        Remove silence from audio and adjust timing data accordingly.
        
        Args:
            audio_path: Path to the input audio file
            output_path: Path to save the processed audio
            timing_data: Timing data from convert_text
            min_silence_len: Minimum length of silence to detect in ms
            silence_thresh: Silence threshold in dB
            
        Returns:
            Tuple of (duration in seconds or None if failed, adjusted timing data)
        """
        duration, timing_segments = self.remove_pauses(
            audio_path,
            output_path,
            min_silence_len,
            silence_thresh
        )
        
        if timing_segments:
            timing_data = self.adjust_elevenlabs_timing(timing_data, timing_segments)
        
        return timing_data