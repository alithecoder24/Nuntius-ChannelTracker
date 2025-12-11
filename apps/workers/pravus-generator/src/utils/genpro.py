import os
import requests
import time
import random
from typing import Dict, List, Optional, Tuple, Union, Any
from dotenv import load_dotenv
from pydub import AudioSegment

from src.utils.utils import custom_print
from src.utils.speech_to_text import transcribe
from src.utils.audio_process import AudioProcessor


FILE = "genpro"


class GenProTTS:
    """
    Class for converting text to speech using GenPro API.
    GenPro wraps ElevenLabs (Labs) and MiniMax/Max voices through a unified API.
    
    API Documentation: https://genaipro.vn/api/v1
    Authentication: JWT Bearer token
    """
    
    def __init__(self, api_key: Optional[str] = None):
        """Initialize the GenPro TTS provider."""
        if not api_key:
            load_dotenv()
            api_key = os.getenv('GENPRO_API_KEY')
        
        if not api_key:
            raise ValueError("API key not found. Please provide an API key or set GENPRO_API_KEY in .env file.")
        
        self.api_key = api_key
        self.base_url = "https://genaipro.vn/api/v1"
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        self.audio_processor = AudioProcessor()
        self.voice_list = []
        self._voices_cached = False
        self.model_list = []
        self._models_cached = False
    
    def _fetch_labs_voices(self, page_size: int = 100) -> List[Dict]:
        """
        Fetch ElevenLabs voices from GenPro Labs API.
        
        Args:
            page_size: Number of voices per page (max 100)
            
        Returns:
            List of voice dictionaries
        """
        all_voices = []
        page = 0
        
        try:
            while True:
                response = requests.get(
                    f"{self.base_url}/labs/voices",
                    headers=self.headers,
                    params={
                        "page": page,
                        "page_size": page_size
                    },
                    timeout=30
                )
                response.raise_for_status()
                result = response.json()
                
                voices = result.get('voices', [])
                all_voices.extend(voices)
                
                total = result.get('total', 0)
                custom_print(FILE, f"Fetched {len(voices)} Labs voices (page {page}, total: {len(all_voices)}/{total})")
                
                # Check if there are more pages
                if len(all_voices) >= total or len(voices) == 0:
                    break
                
                page += 1
            
            custom_print(FILE, f"Completed fetching {len(all_voices)} Labs voices from GenPro API")
            return all_voices
            
        except Exception as e:
            custom_print(FILE, f"Error fetching Labs voices: {e}", error=True)
            return all_voices
    
    def _fetch_max_voices(self, page_size: int = 100) -> List[Dict]:
        """
        Fetch Max/MiniMax voices from GenPro Max API.
        
        Args:
            page_size: Number of voices per page (max 100)
            
        Returns:
            List of voice dictionaries
        """
        all_voices = []
        page = 1  # Max API uses 1-based pagination
        
        try:
            while True:
                response = requests.get(
                    f"{self.base_url}/max/voices",
                    headers=self.headers,
                    params={
                        "page": page,
                        "page_size": page_size
                    },
                    timeout=30
                )
                response.raise_for_status()
                result = response.json()
                
                voices = result.get('voice_list', [])
                all_voices.extend(voices)
                
                has_more = result.get('has_more', False)
                custom_print(FILE, f"Fetched {len(voices)} Max voices (page {page}, total: {len(all_voices)})")
                
                if not has_more or len(voices) == 0:
                    break
                
                page += 1
            
            custom_print(FILE, f"Completed fetching {len(all_voices)} Max voices from GenPro API")
            return all_voices
            
        except Exception as e:
            custom_print(FILE, f"Error fetching Max voices: {e}", error=True)
            return all_voices
    
    def get_available_voices(self, force_refresh: bool = False) -> List[Dict]:
        """
        Returns list of available voices from GenPro Labs API (ElevenLabs).
        Uses cached voices unless force_refresh is True.
        
        Args:
            force_refresh: If True, fetch voices from API even if cached
        
        Returns:
            List of dictionaries containing voice information
        """
        if not self._voices_cached or force_refresh:
            custom_print(FILE, "Fetching voices from GenPro Labs API...")
            
            labs_voices = self._fetch_labs_voices()
            
            self.voice_list = []
            
            # Add Labs (ElevenLabs) voices
            for voice in labs_voices:
                labels = voice.get('labels', {})
                description_parts = []
                if labels.get('gender'):
                    description_parts.append(labels['gender'])
                if labels.get('accent'):
                    description_parts.append(labels['accent'])
                if labels.get('description'):
                    description_parts.append(labels['description'])
                
                self.voice_list.append({
                    'voice_id': voice['voice_id'],
                    'voice_name': voice['name'],
                    'type': 'labs',
                    'category': voice.get('category', 'unknown'),
                    'description': ', '.join(description_parts) if description_parts else ''
                })
            
            # Sort by name
            self.voice_list.sort(key=lambda v: v.get('voice_name', '').lower())
            self._voices_cached = True
            custom_print(FILE, f"Retrieved {len(labs_voices)} Labs voices from GenPro")
        else:
            custom_print(FILE, f"Using cached GenPro voices ({len(self.voice_list)} voices)")
        
        return [{
            "voice_id": f"genpro-labs/{voice['voice_id']}",
            "name": f"genpro-labs/{voice['voice_name']}",
        } for voice in self.voice_list]
    
    def get_available_models(self, force_refresh: bool = False) -> List[Dict]:
        """
        Returns list of available TTS models for GenPro Labs (ElevenLabs).
        
        Available models: eleven_multilingual_v2, eleven_turbo_v2_5, eleven_flash_v2_5, eleven_v3
        
        Args:
            force_refresh: If True, refresh the models list
        
        Returns:
            List of dictionaries containing model information
        """
        if not self._models_cached or force_refresh:
            custom_print(FILE, "Loading GenPro Labs models...")
            
            # Labs (ElevenLabs) models - from API documentation
            self.model_list = [
                {"model_id": "eleven_multilingual_v2", "name": "Multilingual v2"},
                {"model_id": "eleven_turbo_v2_5", "name": "Turbo v2.5"},
                {"model_id": "eleven_flash_v2_5", "name": "Flash v2.5"},
                {"model_id": "eleven_v3", "name": "v3"},
            ]
            
            self._models_cached = True
            custom_print(FILE, f"Loaded {len(self.model_list)} GenPro Labs models")
        else:
            custom_print(FILE, f"Using cached GenPro models ({len(self.model_list)} models)")
        
        return [{
            "model_id": model['model_id'],
            "name": f"genpro-labs/{model['name']}",
        } for model in self.model_list]
    
    def convert_text(self, text: str, voice_id: str, output_filename: str,
                     model: str = "eleven_turbo_v2_5",
                     speed: float = 1.15, stability: float = 0.5,
                     similarity: float = 0.75, style: float = 0.0,
                     max_wait_time: int = 7200) -> str:
        """
        Convert text to speech using GenPro Labs API (ElevenLabs).
        
        Args:
            text: Text to convert to speech
            voice_id: Voice ID with prefix (e.g., "genpro-labs/{voice_id}")
            output_filename: Path to save the output audio file
            model: TTS model to use (eleven_multilingual_v2, eleven_turbo_v2_5, etc.)
            speed: Speech speed (0.7-1.2)
            stability: Voice stability (0.0-1.0)
            similarity: Voice similarity (0.0-1.0)
            style: Voice style (0.0-1.0)
            max_wait_time: Maximum time to wait for task completion in seconds
            
        Returns:
            Path to the generated audio file
        """
        clean_voice_id = voice_id
        
        # Parse voice ID prefix
        if "/" in voice_id:
            parts = voice_id.split("/")
            if len(parts) == 2:
                prefix = parts[0]
                clean_voice_id = parts[1]
                if prefix != "genpro-labs":
                    custom_print(FILE, f"Warning: Expected 'genpro-labs/' prefix, got '{prefix}'. Using voice ID as-is.")
        
        custom_print(FILE, f"Using GenPro Labs voice ID: {clean_voice_id} (Model: {model})")
        
        return self._convert_labs(text, clean_voice_id, output_filename, model, 
                                  speed, stability, similarity, style, max_wait_time)
    
    def _convert_labs(self, text: str, voice_id: str, output_filename: str,
                      model: str, speed: float, stability: float,
                      similarity: float, style: float, max_wait_time: int) -> str:
        """
        Convert text using GenPro Labs (ElevenLabs) API.
        
        This is an async task-based API that requires polling for completion.
        """
        url = f"{self.base_url}/labs/task"
        
        payload = {
            "input": text,
            "voice_id": voice_id,
            "model_id": model,
            "speed": min(max(speed, 0.7), 1.2),  # Clamp to valid range
            "stability": stability,
            "similarity": similarity,
            "style": style,
            "use_speaker_boost": True
        }
        
        return self._make_task_request(url, payload, "labs", output_filename, max_wait_time)
    
    def _convert_max(self, text: str, voice_id: str, output_filename: str,
                     model: str, speed: float, max_wait_time: int) -> str:
        """
        Convert text using GenPro Max (MiniMax) API.
        
        This is an async task-based API that requires polling for completion.
        """
        url = f"{self.base_url}/max/tasks"
        
        payload = {
            "text": text,
            "voice_id": voice_id,
            "model_id": model,
            "speed": min(max(speed, 0.5), 2.0),  # Clamp to valid range
            "pitch": 0,
            "volume": 1.0,
            "language": "Auto",
            "is_clone": False
        }
        
        return self._make_task_request(url, payload, "max", output_filename, max_wait_time)
    
    def _make_task_request(self, url: str, payload: Dict, task_type: str,
                           output_filename: str, max_wait_time: int) -> str:
        """
        Make a TTS task request with retry logic and polling.
        
        Args:
            url: API endpoint URL
            payload: Request payload
            task_type: Type of task ('labs' or 'max')
            output_filename: Output file path
            max_wait_time: Max wait time in seconds
            
        Returns:
            Path to generated audio file
        """
        max_retries = 5
        retry_delay = 3
        
        for attempt in range(max_retries):
            try:
                custom_print(FILE, f"Creating {task_type.upper()} TTS task (attempt {attempt + 1}/{max_retries})...")
                response = requests.post(url, headers=self.headers, json=payload, timeout=60)
                
                if response.status_code == 429:
                    if attempt < max_retries - 1:
                        base_wait = retry_delay * (2 ** attempt)
                        jitter = random.uniform(1, 2.5)
                        wait_time = base_wait * jitter
                        custom_print(FILE, f"Rate limit hit (429), retrying in {wait_time:.1f}s...")
                        time.sleep(wait_time)
                        continue
                    else:
                        raise RuntimeError(f"Rate limit exceeded after {max_retries} attempts")
                
                response.raise_for_status()
                result = response.json()
                
                # Labs returns task_id, Max returns id
                task_id = result.get('task_id') or result.get('id')
                if not task_id:
                    raise RuntimeError(f"No task_id in response: {result}")
                
                custom_print(FILE, f"Created {task_type.upper()} TTS task: {task_id}")
                
                # Poll for task completion
                task_result = self._poll_task(task_id, task_type, max_wait_time)
                
                if task_result.get('status') == 'completed':
                    # Labs uses 'result', Max also uses 'result'
                    audio_url = task_result.get('result')
                    
                    if audio_url:
                        self._download_file(audio_url, output_filename)
                        custom_print(FILE, f"Saved audio to: {output_filename}")
                        return output_filename
                    else:
                        raise RuntimeError("No audio URL in task result")
                else:
                    error_msg = task_result.get('error', 'Unknown error')
                    raise RuntimeError(f"TTS task failed: {error_msg}")
                    
            except requests.exceptions.HTTPError as e:
                if e.response.status_code != 429:
                    custom_print(FILE, f"HTTP error: {e}", error=True)
                    raise RuntimeError(f"Failed to convert text: {str(e)}")
            except Exception as e:
                if attempt < max_retries - 1:
                    custom_print(FILE, f"Error: {e}, retrying...", error=True)
                    time.sleep(retry_delay)
                else:
                    custom_print(FILE, f"Error during TTS request: {e}", error=True)
                    raise RuntimeError(f"Failed to convert text: {str(e)}")
        
        raise RuntimeError("Failed to convert text after all retries")
    
    def _poll_task(self, task_id: str, task_type: str, max_wait_time: int = 7200) -> Dict:
        """
        Poll task status until completion or timeout.
        
        Args:
            task_id: Task ID to poll
            task_type: Type of task ('labs' or 'max')
            max_wait_time: Maximum time to wait in seconds
            
        Returns:
            Task result dictionary
        """
        start_time = time.time()
        poll_interval = 2  # Start with 2 seconds
        max_poll_interval = 10
        
        # Different endpoints for Labs vs Max
        if task_type == "labs":
            status_url = f"{self.base_url}/labs/task/{task_id}"
        else:
            status_url = f"{self.base_url}/max/tasks/{task_id}"
        
        while time.time() - start_time < max_wait_time:
            try:
                response = requests.get(status_url, headers=self.headers, timeout=30)
                response.raise_for_status()
                task_data = response.json()
                
                status = task_data.get('status')
                progress = task_data.get('process_percentage', 0)
                
                custom_print(FILE, f"Task {task_id} status: {status} ({progress}%)")
                
                if status == 'completed':
                    return task_data
                elif status in ['error', 'failed']:
                    return task_data
                
                # Exponential backoff with cap
                time.sleep(poll_interval)
                poll_interval = min(poll_interval * 1.5, max_poll_interval)
                
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
                os.makedirs(output_dir, exist_ok=True)
            
            response = requests.get(url, timeout=120)
            response.raise_for_status()
            
            with open(output_path, 'wb') as f:
                f.write(response.content)
            
            custom_print(FILE, f"Downloaded file to: {output_path}")
            
        except Exception as e:
            raise RuntimeError(f"Failed to download file: {str(e)}")
    
    def get_user_info(self) -> Dict:
        """
        Get current user information including balance and credits.
        
        Returns:
            Dictionary with user info, balance, and credits
        """
        try:
            response = requests.get(
                f"{self.base_url}/me",
                headers=self.headers,
                timeout=10
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            custom_print(FILE, f"Error getting user info: {e}", error=True)
            raise RuntimeError(f"Failed to get user info: {str(e)}")
    
    def process_audio_silence(self, audio_path: str, output_path: str, timing_data: Union[Dict, Any],
                             min_silence_len: int = 200, silence_thresh: float = -40) -> Union[Dict, Any]:
        """
        Remove silence from audio. GenPro doesn't return timing data, so just process audio.
        
        Args:
            audio_path: Path to the input audio file
            output_path: Path to save the processed audio
            timing_data: Timing data (not used for GenPro, just passed through)
            min_silence_len: Minimum length of silence to detect in ms
            silence_thresh: Silence threshold in dB
            
        Returns:
            Original timing_data unchanged (GenPro doesn't use timing segments)
        """
        self.audio_processor.remove_silence(
            audio_path=audio_path,
            output_path=output_path,
            min_silence_len=min_silence_len,
            silence_thresh=silence_thresh,
            return_timing_segments=False
        )
        
        return timing_data
    
    def save_transcription(self, text: str, output_path: str, title: str = None) -> float:
        """
        Saves transcription to an output file using local speech-to-text.
        
        GenPro Labs API provides subtitles, but we use local transcription for consistency
        with other providers.
        
        Args:
            text: Original text that was sent to TTS
            output_path: Path to save the transcription (audio file path, JSON will be created alongside)
            title: Optional title text to extract duration for
            
        Returns:
            Title duration in seconds
        """
        document, title_duration = transcribe(audio_path=output_path, original_text=text, title=title)
        return title_duration

