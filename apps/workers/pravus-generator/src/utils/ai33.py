import os
import requests
import time
import random
import json
from typing import Dict, List, Optional, Tuple, Union, Any
from dotenv import load_dotenv
from pydub import AudioSegment, silence

from src.utils.utils import custom_print
from src.utils.speech_to_text import transcribe
from src.utils.audio_process import AudioProcessor


FILE = "ai33"


class AI33TTS:
    """Class for converting text to speech using AI33 Minimax API."""
    
    def __init__(self, api_key: Optional[str] = None):
        """Initialize the AI33 Minimax TTS."""
        if not api_key:
            load_dotenv()
            api_key = os.getenv('AI33_API_KEY')
        
        if not api_key:
            raise ValueError("API key not found. Please provide an API key or set AI33_API_KEY in .env file.")
        
        self.api_key = api_key
        self.base_url = "https://api.ai33.pro"
        self.headers = {
            "xi-api-key": self.api_key,
            "Content-Type": "application/json"
        }
        
        self.audio_processor = AudioProcessor()
        self.voice_list = []
        self._voices_cached = False
        self.model_list = []
        self._models_cached = False
    
    def _fetch_cloned_voices(self) -> List[Dict]:
        """Fetch cloned voices owned by the authenticated user."""
        try:
            response = requests.get(
                f"{self.base_url}/v1m/voice/clone",
                headers=self.headers,
                timeout=10
            )
            response.raise_for_status()
            result = response.json()
            
            if result.get('success'):
                return result.get('data', [])
            return []
            
        except Exception as e:
            custom_print(FILE, f"Error fetching cloned voices: {e}", error=True)
            return []
    
    def _fetch_elevenlabs_voices(self) -> List[Dict]:
        """Fetch ElevenLabs voices available through AI33 API."""
        all_voices = []
        next_page_token = None
        
        try:
            while True:
                url = f"{self.base_url}/v2/voices"
                params = {'page_size': 100}  # Maximum allowed page size
                
                if next_page_token:
                    params['page_token'] = next_page_token
                
                response = requests.get(
                    url,
                    headers=self.headers,
                    params=params,
                    timeout=10
                )
                response.raise_for_status()
                result = response.json()
                
                voices = result.get('voices', [])
                all_voices.extend(voices)
                
                custom_print(FILE, f"Fetched {len(voices)} ElevenLabs voices (total: {len(all_voices)})")
                
                # Check if there are more pages
                has_more = result.get('has_more', False)
                next_page_token = result.get('next_page_token')
                
                if not has_more or not next_page_token:
                    break
            
            custom_print(FILE, f"Completed fetching {len(all_voices)} ElevenLabs voices from API")
            
            # Load custom ElevenLabs voices from JSON file
            custom_voices = self._load_custom_elevenlabs_voices()
            if custom_voices:
                all_voices.extend(custom_voices)
                custom_print(FILE, f"Added {len(custom_voices)} custom ElevenLabs voices from JSON")
            
            custom_print(FILE, f"Total ElevenLabs voices: {len(all_voices)}")
            return all_voices
            
        except Exception as e:
            custom_print(FILE, f"Error fetching ElevenLabs voices: {e}", error=True)
            return all_voices  # Return what we got so far
    
    def _load_custom_elevenlabs_voices(self) -> List[Dict]:
        """Load custom ElevenLabs voices from JSON file."""
        custom_voices_file = "custom_ai33_elevenlabs_voices.json"
        
        if not os.path.exists(custom_voices_file):
            custom_print(FILE, f"Custom voices file '{custom_voices_file}' not found, skipping")
            return []
        
        try:
            custom_print(FILE, f"Loading custom ElevenLabs voices from '{custom_voices_file}'...")
            with open(custom_voices_file, 'r', encoding='utf-8') as f:
                custom_voices = json.load(f)
            
            if not isinstance(custom_voices, list):
                custom_print(FILE, f"Invalid format in '{custom_voices_file}': expected a list", error=True)
                return []
            
            # Transform custom voices to match API format
            transformed_voices = []
            for voice in custom_voices:
                if not isinstance(voice, dict) or 'voice_id' not in voice or 'name' not in voice:
                    custom_print(FILE, f"Skipping invalid voice entry: {voice}", error=True)
                    continue
                
                transformed_voices.append({
                    'voice_id': voice['voice_id'],
                    'name': voice['name']
                })
                custom_print(FILE, f"Loaded custom voice: {voice['name']} (ID: {voice['voice_id']})")
            
            return transformed_voices
            
        except json.JSONDecodeError as e:
            custom_print(FILE, f"Error parsing JSON from '{custom_voices_file}': {e}", error=True)
            return []
        except Exception as e:
            custom_print(FILE, f"Error loading custom voices from '{custom_voices_file}': {e}", error=True)
            return []

    def _fetch_models(self) -> List[Dict]:
        """Fetch available Minimax TTS models from AI33 API."""
        try:
            response = requests.get(
                f"{self.base_url}/v1m/common/config",
                headers=self.headers,
                timeout=10
            )
            response.raise_for_status()
            result = response.json()
            if response.status_code != 200:
                raise RuntimeError(f"Failed to fetch models: {result}")
            data = result.get('data', {})
            return data.get('t2a_model', [])
            
        except Exception as e:
            custom_print(FILE, f"Error fetching Minimax models: {e}", error=True)
            return []
    
    def _fetch_elevenlabs_models(self) -> List[Dict]:
        """Fetch available ElevenLabs models from AI33 API."""
        try:
            response = requests.get(
                f"{self.base_url}/v1/models",
                headers=self.headers,
                timeout=10
            )
            response.raise_for_status()
            result = response.json()
            
            return result if isinstance(result, list) else []
            
        except Exception as e:
            custom_print(FILE, f"Error fetching ElevenLabs models: {e}", error=True)
            return []
    
    def get_available_voices(self, force_refresh: bool = False) -> List[Dict]:
        """
        Returns list of cloned voices and ElevenLabs voices from AI33 API.
        Uses cached voices unless force_refresh is True.
        
        Args:
            force_refresh: If True, fetch voices from API even if cached
        
        Returns:
            List of dictionaries containing voice information
        """
        if not self._voices_cached or force_refresh:
            custom_print(FILE, "Fetching voices from AI33 API...")
            
            cloned_voices = self._fetch_cloned_voices()
            elevenlabs_voices = self._fetch_elevenlabs_voices()
            
            self.voice_list = []
            
            for voice in cloned_voices:
                self.voice_list.append({
                    'voice_id': voice['voice_id'],
                    'voice_name': voice['voice_name'],
                    'type': 'minimax'
                })
            
            for voice in elevenlabs_voices:
                self.voice_list.append({
                    'voice_id': voice['voice_id'],
                    'voice_name': voice['name'],
                    'type': 'elevenlabs'
                })
            
            self.voice_list.sort(key=lambda v: (v['type'] != 'minimax', v.get('voice_name', '').lower()))
            self._voices_cached = True
            custom_print(FILE, f"Retrieved {len(cloned_voices)} Minimax voices and {len(elevenlabs_voices)} ElevenLabs voices")
        else:
            custom_print(FILE, f"Using cached AI33 voices ({len(self.voice_list)} voices)")
        
        return [{
            "voice_id": f"ai33-{voice['type']}/{voice['voice_id']}",
            "name": f"ai33-{voice['type']}/{voice['voice_name']}",
        } for voice in self.voice_list]
    
    def get_available_models(self, force_refresh: bool = False) -> List[Dict]:
        """
        Returns list of available Minimax and ElevenLabs TTS models from AI33 API.
        Uses cached models unless force_refresh is True.
        
        Args:
            force_refresh: If True, fetch models from API even if cached
        
        Returns:
            List of dictionaries containing model information
        """
        if not self._models_cached or force_refresh:
            custom_print(FILE, "Fetching models from AI33 API...")
            
            minimax_models = self._fetch_models()
            elevenlabs_models = self._fetch_elevenlabs_models()
            
            self.model_list = []
            
            for model in minimax_models:
                self.model_list.append({
                    'model_id': model['value'],
                    'model_name': model['value'],
                    'type': 'minimax'
                })
            
            for model in elevenlabs_models:
                self.model_list.append({
                    'model_id': model.get('model_id', ''),
                    'model_name': model.get('name', model.get('model_id', '')),
                    'type': 'elevenlabs'
                })
            
            self.model_list.sort(key=lambda m: (m['type'] != 'minimax', m.get('model_name', '').lower()))
            self._models_cached = True
            custom_print(FILE, f"Retrieved {len(minimax_models)} Minimax models and {len(elevenlabs_models)} ElevenLabs models")
        else:
            custom_print(FILE, f"Using cached AI33 models ({len(self.model_list)} models)")
        
        return [{
            "model_id": model['model_id'],
            "name": f"ai33-{model['type']}/{model['model_name']}",
        } for model in self.model_list]
    
    def convert_text(self, text: str, voice_id: str, output_filename: str,
                      model: str = "speech-2.5-hd-preview",
                      vol: float = 1.0, pitch: int = 0, speed: float = 1.15,
                      language_boost: str = "Auto",
                      max_wait_time: int = 7200) -> str:
        """
        Convert text to speech using AI33 Minimax API.
        Automatically splits text longer than 5000 characters into chunks.
        
        Args:
            text: Text to convert to speech
            voice_id: Voice ID with prefix (e.g., "ai33-minimax/{voice_id}" or "ai33-elevenlabs/{voice_id}")
            output_filename: Path to save the output audio file
            model: TTS model (default: speech-2.5-hd-preview)
            vol: Volume (0.5 to 2.0, default: 1.0)
            pitch: Pitch (-12 to 12, default: 0)
            speed: Speed (0.01 to 10.0, default: 1.0)
            language_boost: Language boost (default: Auto)
            max_wait_time: Maximum time to wait for task completion in seconds
            
        Returns:
            Path to the generated audio file
        """
        if not self._voices_cached:
            self.get_available_voices()
        
        voice_type = None
        clean_voice_id = voice_id
        
        if "/" in voice_id:
            parts = voice_id.split("/")
            if len(parts) == 2:
                prefix = parts[0]
                clean_voice_id = parts[1]
                if prefix == "ai33-minimax":
                    voice_type = "minimax"
                elif prefix == "ai33-elevenlabs":
                    voice_type = "elevenlabs"
        
        if not voice_type:
            raise ValueError(f"Voice ID '{voice_id}' must include a valid prefix (ai33-minimax/ or ai33-elevenlabs/)")
        
        # Verify the voice exists in our cached list
        voice_exists = any(v['voice_id'] == clean_voice_id and v['type'] == voice_type for v in self.voice_list)
        if not voice_exists:
            raise ValueError(f"Voice ID '{clean_voice_id}' with type '{voice_type}' not found in available voices")
        
        custom_print(FILE, f"Using voice ID: {clean_voice_id} (Type: {voice_type})")
        
        # Check if text needs to be split
        if prefix == "ai33-minimax":
            max_chars = 5000
        else:
            max_chars = 5000 ** 5 # ElevenLabs can handle very long text
        if len(text) <= max_chars:
            return self._convert_single_text(
                text, clean_voice_id, voice_type, output_filename, model, 
                vol, pitch, speed, language_boost, max_wait_time
            )
        
        # Split text into chunks
        custom_print(FILE, f"Text is {len(text)} characters, splitting into chunks of {max_chars}...")
        chunks = self._split_text_into_chunks(text, max_chars)
        custom_print(FILE, f"Split into {len(chunks)} chunks")
        
        # Process each chunk
        audio_segments = []
        for i, chunk in enumerate(chunks):
            custom_print(FILE, f"Processing chunk {i+1}/{len(chunks)} ({len(chunk)} chars)...")
            
            # Create temporary filename for this chunk
            base_name = output_filename.rsplit('.', 1)[0]
            extension = output_filename.rsplit('.', 1)[1] if '.' in output_filename else 'mp3'
            chunk_filename = f"{base_name}_chunk_{i}.{extension}"
            
            # Convert chunk to audio
            self._convert_single_text(
                chunk, clean_voice_id, voice_type, chunk_filename, model,
                vol, pitch, speed, language_boost, max_wait_time
            )
            
            # Load audio segment
            audio_segments.append(AudioSegment.from_file(chunk_filename))
            custom_print(FILE, f"Chunk {i+1} completed: {audio_segments[-1].duration_seconds:.2f}s")
        
        # Combine all audio segments
        custom_print(FILE, "Combining all audio chunks...")
        combined_audio = sum(audio_segments)
        combined_audio.export(output_filename, format=output_filename.split(".")[-1])
        
        # Clean up temporary chunk files
        for i in range(len(chunks)):
            chunk_filename = f"{base_name}_chunk_{i}.{extension}"
            try:
                os.remove(chunk_filename)
            except:
                pass
        
        custom_print(FILE, f"Final audio saved to: {output_filename} ({combined_audio.duration_seconds:.2f}s)")
        return output_filename
    
    def _split_text_into_chunks(self, text: str, max_chars: int) -> List[str]:
        """
        Split text into chunks at sentence boundaries, respecting max character limit.
        
        Args:
            text: Text to split
            max_chars: Maximum characters per chunk
            
        Returns:
            List of text chunks
        """
        # Split by common sentence endings
        sentences = []
        current_sentence = ""
        
        for char in text:
            current_sentence += char
            if char in '.!?\n' and len(current_sentence.strip()) > 0:
                sentences.append(current_sentence.strip())
                current_sentence = ""
        
        if current_sentence.strip():
            sentences.append(current_sentence.strip())
        
        # Combine sentences into chunks
        chunks = []
        current_chunk = ""
        
        for sentence in sentences:
            # If a single sentence is longer than max_chars, split it
            if len(sentence) > max_chars:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                    current_chunk = ""
                
                # Split long sentence by words
                words = sentence.split()
                word_chunk = ""
                for word in words:
                    if len(word_chunk) + len(word) + 1 <= max_chars:
                        word_chunk += (word + " ")
                    else:
                        chunks.append(word_chunk.strip())
                        word_chunk = word + " "
                if word_chunk.strip():
                    chunks.append(word_chunk.strip())
            
            # If adding this sentence would exceed limit, start new chunk
            elif len(current_chunk) + len(sentence) + 1 > max_chars:
                if current_chunk:
                    chunks.append(current_chunk.strip())
                current_chunk = sentence + " "
            else:
                current_chunk += sentence + " "
        
        if current_chunk.strip():
            chunks.append(current_chunk.strip())
        
        return chunks
    
    def _convert_single_text(self, text: str, voice_id: str, voice_type: Optional[str], 
                            output_filename: str, model: str, vol: float, pitch: int, 
                            speed: float, language_boost: str, max_wait_time: int) -> str:
        """
        Convert a single text chunk to speech (internal method).
        
        Args:
            text: Text to convert
            voice_id: Voice ID to use
            voice_type: Type of voice ('minimax' or 'elevenlabs')
            output_filename: Output file path
            model: TTS model
            vol: Volume
            pitch: Pitch
            speed: Speed
            language_boost: Language boost setting
            max_wait_time: Max wait time in seconds
            
        Returns:
            Path to generated audio file
        """
        if voice_type == 'elevenlabs':
            url = f"{self.base_url}/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128"
            payload = {
                "text": text,
                "model_id": model,
                "with_transcript": False,
                "voice_settings": {
                    "stability": 0.5,
                    "similarity_boost": 0.75,
                    "style": 0,
                    "speed": speed,
                }
            }
            task_type = "ElevenLabs"
        else:
            url = f"{self.base_url}/v1m/task/text-to-speech"
            payload = {
                "text": text,
                "model": model,
                "voice_setting": {
                    "voice_id": voice_id,
                    "vol": vol,
                    "pitch": pitch,
                    "speed": speed
                },
                "language_boost": language_boost,
                "with_transcript": False
            }
            task_type = "Minimax"
        
        return self._make_tts_request_with_retry(url, payload, task_type, output_filename, max_wait_time)
    
    def _make_tts_request_with_retry(self, url: str, payload: Dict, task_type: str,
                                     output_filename: str, max_wait_time: int) -> str:
        """
        Make a TTS request with retry logic and task polling.
        
        Args:
            url: API endpoint URL
            payload: Request payload
            task_type: Type of task for logging ('Minimax' or 'ElevenLabs')
            output_filename: Output file path
            max_wait_time: Max wait time in seconds
            
        Returns:
            Path to generated audio file
        """
        max_retries = 5
        retry_delay = 3
        
        for attempt in range(max_retries):
            try:
                response = requests.post(url, headers=self.headers, json=payload, timeout=60)
                
                if response.status_code == 429:
                    if attempt < max_retries - 1:
                        base_wait = retry_delay * (2 ** attempt)
                        jitter = random.uniform(1, 2.5)
                        wait_time = base_wait * jitter
                        custom_print(FILE, f"Rate limit hit (429), retrying in {wait_time:.1f}s... (attempt {attempt + 1}/{max_retries})")
                        time.sleep(wait_time)
                        continue
                    else:
                        raise RuntimeError(f"Rate limit exceeded after {max_retries} attempts")
                
                response.raise_for_status()
                result = response.json()
                
                if not result.get('success'):
                    raise RuntimeError(f"Task creation failed: {result}")
                
                task_id = result['task_id']
                custom_print(FILE, f"Created {task_type} TTS task: {task_id}")
                
                task_result = self._poll_task(task_id, max_wait_time)
                
                if task_result['status'] == 'done':
                    metadata = task_result.get('metadata', {})
                    audio_url = metadata.get('audio_url')
                    
                    if audio_url:
                        self._download_file(audio_url, output_filename)
                        custom_print(FILE, f"Saved audio to: {output_filename}")
                        return output_filename
                    else:
                        raise RuntimeError("No audio URL in task result")
                else:
                    custom_print(FILE, f"TTS task ended with status: {task_result}", error=True)
                    error_msg = task_result.get('error_message', 'Unknown error')
                    raise RuntimeError(f"TTS task failed: {error_msg}")
                    
            except requests.exceptions.HTTPError as e:
                if e.response.status_code != 429:
                    custom_print(FILE, f"Failed to convert text: {e}", error=True)
                    raise RuntimeError(f"Failed to convert text: {str(e)}")
            except Exception as e:
                custom_print(FILE, f"Error during TTS request: {e}", error=True)
                raise RuntimeError(f"Failed to convert text: {str(e)}")
    
    def _poll_task(self, task_id: str, max_wait_time: int = 7200) -> Dict:
        """
        Poll task status until completion or timeout.
        
        Args:
            task_id: Task ID to poll
            max_wait_time: Maximum time to wait in seconds
            
        Returns:
            Task result dictionary
        """
        start_time = time.time()
        poll_interval = 5
        
        while time.time() - start_time < max_wait_time:
            try:
                response = requests.get(
                    f"{self.base_url}/v1/task/{task_id}",
                    headers=self.headers,
                    timeout=30
                )
                response.raise_for_status()
                task_data = response.json()
                
                status = task_data.get('status')
                custom_print(FILE, f"Task {task_id} status: {status}")
                
                if status in ['done', 'error']:
                    return task_data
                
                time.sleep(poll_interval)
                
            except Exception as e:
                custom_print(FILE, f"Error polling task: {e}", error=True)
                time.sleep(poll_interval)
        
        raise TimeoutError(f"Task {task_id} did not complete within {max_wait_time} seconds")
    
    def _download_file(self, url: str, output_path: str) -> None:
        """
        Download a file from URL to local path.
        
        Args:
            url: URL to download from
            output_path: Local path to save file
        """
        try:
            # Ensure the directory exists
            output_dir = os.path.dirname(output_path)
            if output_dir:
                custom_print(FILE, f"Creating missing directory: {output_dir}")
                os.makedirs(output_dir, exist_ok=True)
            
            response = requests.get(url, timeout=30)
            response.raise_for_status()
            
            with open(output_path, 'wb') as f:
                f.write(response.content)
            
            custom_print(FILE, f"Downloaded file to: {output_path}")
            
        except Exception as e:
            raise RuntimeError(f"Failed to download file: {str(e)}")
    
    def get_task_status(self, task_id: str) -> Dict:
        """
        Get the status of a specific task.
        
        Args:
            task_id: Task ID to check
            
        Returns:
            Task status dictionary
        """
        try:
            response = requests.get(
                f"{self.base_url}/v1/task/{task_id}",
                headers=self.headers,
                timeout=10
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            raise RuntimeError(f"Failed to get task status: {str(e)}")
    

    def process_audio_silence(self, audio_path: str, output_path: str, timing_data: Union[Dict, Any],
                             min_silence_len: int = 200, silence_thresh: float = -40) -> Union[Dict, Any]:
        """
        Remove silence from audio. AI33 doesn't need timing adjustment.
        
        Args:
            audio_path: Path to the input audio file
            output_path: Path to save the processed audio
            timing_data: Timing data (not used for AI33, just passed through)
            min_silence_len: Minimum length of silence to detect in ms
            silence_thresh: Silence threshold in dB
            
        Returns:
            Original timing_data unchanged (AI33 doesn't use timing segments)
        """
        self.audio_processor.remove_silence(
            audio_path=audio_path,
            output_path=output_path,
            min_silence_len=min_silence_len,
            silence_thresh=silence_thresh,
            return_timing_segments=False
        )
        
        return timing_data

    def save_transcription(self, text, output_path, title: str = None) -> float:
        """
        Saves transcription to an output file.
        
        Args:
            text: Original text that was sent to TTS
            output_path: Path to save the transcription
            title: Optional title text to extract duration for
            
        Returns:
            Title duration in seconds
        """
        document, title_duration = transcribe(audio_path=output_path, original_text=text, title=title)
        return title_duration
