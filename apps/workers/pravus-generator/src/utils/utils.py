import platform
import subprocess
import traceback

try:
    import torch
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False

def custom_print(file: str, message: str, error: bool = False) -> None:
    """Custom print function to handle file logging."""
    if not error:
        print(f"[{file}]: {message}")
    else:
        print(traceback.format_exc())
        # red text for errors
        print(f"\033[91m{file}: {message}\033[0m")
        # add to error log in error.txt, create or update the file
        with open('error.txt', 'a', encoding='utf-8') as f:
            f.write(f"{file}: {message}\n")
            f.write(traceback.format_exc())


def detect_nvidia_gpu() -> bool:
    """
    Detect if NVIDIA GPU is available with CUDA support.
    
    Returns:
        bool: True if NVIDIA GPU with CUDA is available, False otherwise
    """
    if not TORCH_AVAILABLE:
        return False
    
    try:
        return torch.cuda.is_available()
    except Exception:
        return False


def detect_apple_silicon() -> bool:
    """
    Detect if running on Apple Silicon (M1/M2/M3) for hardware acceleration.
    
    Returns:
        bool: True if Apple Silicon is detected, False otherwise
    """
    try:
        if platform.system() != 'Darwin':
            return False
        
        result = subprocess.run(['uname', '-m'], capture_output=True, text=True)
        if result.returncode == 0:
            return result.stdout.strip() == 'arm64'
        
        return False
    except Exception:
        return False


def get_hardware_info() -> dict:
    """
    Get information about the current hardware for logging purposes.
    
    Returns:
        dict: Dictionary containing hardware information
    """
    nvidia_gpu = detect_nvidia_gpu()
    apple_silicon = detect_apple_silicon()
    
    info = {
        'platform': platform.system(),
        'machine': platform.machine(),
        'nvidia_gpu': nvidia_gpu,
        'apple_silicon': apple_silicon,
        'hardware_acceleration_available': nvidia_gpu or apple_silicon,
        'gpu_name': None
    }
    
    if nvidia_gpu and TORCH_AVAILABLE:
        try:
            info['gpu_name'] = torch.cuda.get_device_name(0)
            info['gpu_count'] = torch.cuda.device_count()
        except Exception:
            pass
    
    return info


def get_ffmpeg_encoder_params(use_hardware_acceleration: bool = None, encoder_type: str = 'h264') -> dict:
    """
    Get appropriate ffmpeg encoder parameters based on hardware capabilities.
    Automatically detects NVIDIA GPU or Apple Silicon and uses appropriate hardware encoders.
    
    Args:
        use_hardware_acceleration: Override auto-detection. If None, auto-detects.
        encoder_type: Type of encoder to use ('h264', 'hevc', 'prores')
    
    Returns:
        dict: Dictionary with encoder parameters for ffmpeg
    """
    nvidia_gpu = detect_nvidia_gpu()
    apple_silicon = detect_apple_silicon()
    
    if use_hardware_acceleration is None:
        use_hardware_acceleration = nvidia_gpu or apple_silicon
    
    # Get NVENC preset from environment (p1=fastest, p7=best quality)
    import os
    nvenc_preset = os.getenv('NVENC_PRESET', 'p1')
    
    if use_hardware_acceleration:
        if nvidia_gpu:
            if encoder_type == 'hevc':
                return {
                    'vcodec': 'hevc_nvenc',
                    'preset': nvenc_preset,
                    'cq': 23,
                    'rc': 'vbr',
                }
            elif encoder_type == 'prores':
                return {
                    'vcodec': 'prores_ks',
                    'profile:v': '4444',
                }
            else:  # h264
                return {
                    'vcodec': 'h264_nvenc',
                    'preset': nvenc_preset,
                    'cq': 23,
                    'rc': 'vbr',
                }
        elif apple_silicon:
            if encoder_type == 'hevc':
                return {
                    'vcodec': 'hevc_videotoolbox',
                    'q:v': 50,
                    'tag:v': 'hvc1',
                }
            elif encoder_type == 'prores':
                return {
                    'vcodec': 'prores_ks',
                    'profile:v': '4444',
                    'vendor': 'apl0',
                }
            else:  # h264
                return {
                    'vcodec': 'h264_videotoolbox',
                    'q:v': 50,
                }
    
    if encoder_type == 'hevc':
        return {
            'vcodec': 'libx265',
            'preset': 'medium',
            'crf': 23,
        }
    elif encoder_type == 'prores':
        return {
            'vcodec': 'prores_ks',
            'profile:v': '4444',
        }
    else:  # h264
        return {
            'vcodec': 'libx264',
            'preset': 'medium',
            'crf': 23,
        }




