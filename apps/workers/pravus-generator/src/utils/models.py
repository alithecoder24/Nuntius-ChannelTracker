from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any, Union, Protocol
from datetime import datetime
from src.utils.utils import custom_print

FILE = "models"


@dataclass
class Video:
    """Represents a video with all its associated components and metadata."""
    title: str
    content: str
    title_duration: Optional[float] = None
    content_duration: Optional[float] = None
    audio_path: Optional[str] = None
    video_path: Optional[str] = None
    introcard_path: Optional[str] = None
    final_video_path: Optional[str] = None
    
    def is_ready_for_processing(self) -> bool:
        """Check if this video has the necessary components for processing."""
        return self.audio_path is not None and self.title is not None
    
    def has_complete_audio(self) -> bool:
        """Check if this video has complete audio processing."""
        return (self.audio_path is not None and 
                self.title_duration is not None and 
                self.content_duration is not None)
    
    def has_complete_video(self) -> bool:
        """Check if this video has been fully processed with a final video."""
        return self.final_video_path is not None and self.audio_path is not None


@dataclass
class Profile:
    """Represents a channel profile with all its configuration and styling options."""
    channel_name: str
    badge_style: str
    voice: str
    background_video: str
    selected_badges: List[str]
    music: str
    highlight_color: str = "#ffffff"  # Default yellow highlight
    animations_enabled: bool = True  # Default animations enabled
    font: str = "Montserrat"
    video_length: int = 0 # at 0 means no limit,
    voice_model: str = "default"  # Default voice model
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Profile':
        """Create a Profile instance from a dictionary."""
        return cls(
            channel_name=data.get('channel_name', 'unknown'),
            badge_style=data.get('badge_style', ''),
            voice=data.get('voice', ''),
            background_video=data.get('background_video', ''),
            selected_badges=data.get('selected_badges', []),
            music=data.get('music', ''),
            highlight_color=data.get('highlight_color', '#ffffff'),
            animations_enabled=data.get('animations_enabled', True),
            font=data.get('font', 'Montserrat'),
            video_length=data.get('video_length', 0),
            voice_model=data.get('voice_model', 'default')  
        )

@dataclass
class CharacterTiming:
    """Represents timing information for a single character"""
    character: str
    start_time: float
    end_time: float


@dataclass  
class WordTiming:
    """Represents timing information for a word"""
    word: str
    start_time: float
    end_time: float
    characters: List[CharacterTiming]


@dataclass
class Generation:
    """Represents a full generation process with results and timing information."""
    videos: List[Video]
    status: str
    error: Optional[str] = None
    start_time: float = field(default_factory=lambda: datetime.now().timestamp())
    end_time: Optional[float] = None
    profile: Optional[Profile] = None
    
    def complete(self, success: bool = True):
        """Mark the generation as complete."""
        self.end_time = datetime.now().timestamp()
        self.status = "completed" if success else "failed"
    
    def add_error(self, error_msg: str):
        """Add an error message to this generation."""
        self.error = error_msg
        self.status = "failed"


class BaseProcessor(Protocol):
    """Base protocol for all processor classes."""
    def process(self, *args, **kwargs) -> Any:
        """Process the inputs and return a result."""
        ...


class TaskStatusUpdater:
    """Helper class for updating task status."""
    def __init__(self, task_id: Optional[str] = None):
        self.task_id = task_id
    
    def update(self, status: Optional[str] = None, stage: Optional[str] = None, 
               message: Optional[str] = None, progress: Optional[float] = None):
        """Update the task status."""
        if not self.task_id:
            return
            
        try:
            from src.utils.workflow import update_task_status
            update_task_status(self.task_id, status=status, stage=stage, 
                               message=message, progress=progress)
        except ImportError:
            custom_print(FILE, f"Status update: {message}")
        except Exception as e:
            custom_print(FILE, f"Error updating task status: {e}")

    @classmethod
    def create_from_context(cls, context: Any) -> 'TaskStatusUpdater':
        """Create a TaskStatusUpdater from a context object that might have a task_id."""
        task_id = getattr(context, 'task_id', None)
        return cls(task_id)

