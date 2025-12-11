import json
import logging
import os
import shutil
import threading
import uuid
import os
import json
import logging
import threading
import shutil
from datetime import datetime

from flask import Flask, render_template, request, redirect, url_for, jsonify, send_from_directory

from src.forms import VideoGenerationForm
from src.utils.utils import custom_print
from src.utils.ai33 import AI33TTS
from src.utils.elevenlabs import ElevenlabsTTS
from src.utils.genpro import GenProTTS
from src.utils.models import Profile
from src.utils.profiles import (
    get_profiles, 
    get_profile_by_id, 
    create_profile, 
    update_profile, 
    delete_profile
)

FILE = "main"

# Define application paths
template_folder = "src/templates"
static_folder = "src/static"
badges_folder = "src/assets/Badges"
image_assets_folder = "src/assets/"

# Define paths for required directories
ASSETS_DIR = "Assets" # inputs
MUSIC_DIR = "Assets/Music" # music storage
PROFILE_DIR = "Assets/Profiles" # profile storage
VIDEO_CLIP_MIX_DIR = "Assets/VideoClipMix" # video clips to be combined
OUTPUT_DIR = "output" # new structured output directory

# Define required directories list
REQUIRED_DIRECTORIES = [
    ASSETS_DIR,
    PROFILE_DIR,
    VIDEO_CLIP_MIX_DIR,
    "Assets/Music",  # Add Music directory to required directories
    OUTPUT_DIR,
]

# Initialize Flask app
app = Flask(__name__, template_folder=template_folder, static_folder=static_folder)
log = logging.getLogger('werkzeug')
log.disabled = True
app.config['UPLOAD_FOLDER'] = PROFILE_DIR
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max upload
app.config['SECRET_KEY'] = os.urandom(24)  # Required for session
app.config['WTF_CSRF_ENABLED'] = False  # Disable CSRF protection
app.config['SESSION_TYPE'] = 'filesystem'  # Use filesystem for session storage
app.jinja_env.add_extension('jinja2.ext.do') # Enable the 'do' extension

elevenlabs = ElevenlabsTTS()
ai33 = AI33TTS()
genpro = None  # Initialize lazily to avoid errors if API key not set

# Try to initialize GenPro if API key is available
try:
    genpro = GenProTTS()
    custom_print(FILE, "GenPro TTS provider initialized successfully")
except ValueError as e:
    custom_print(FILE, f"GenPro TTS not available: {e}")

voices_cache = []
voices_cached = False
models_cache = []
models_cached = False


# Add custom Jinja2 filters for datetime handling
@app.template_filter('to_datetime')
def to_datetime(value):
    if not value:
        return datetime.now()
    try:
        return datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        return datetime.now()

@app.template_filter('format_duration')
def format_duration(delta):
    if not delta:
        return "0s"
    
    total_seconds = int(delta.total_seconds())
    hours, remainder = divmod(total_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    
    if hours > 0:
        return f"{hours}h {minutes}m"
    elif minutes > 0:
        return f"{minutes}m {seconds}s"
    else:
        return f"{seconds}s"

# Ensure all required directories exist
for directory in REQUIRED_DIRECTORIES:
    os.makedirs(directory, exist_ok=True)

# Required directories for the application
REQUIRED_DIRECTORIES = [
    ASSETS_DIR,
    PROFILE_DIR,
    VIDEO_CLIP_MIX_DIR,
    "Assets/Music",  # Add Music directory to required directories
    OUTPUT_DIR,
]

# Ensure all required directories exist
for directory in REQUIRED_DIRECTORIES:
    os.makedirs(directory, exist_ok=True)

# Allowed file extensions for text uploads
ALLOWED_TEXT_EXTENSIONS = {'txt', 'docx'}

# Import the TaskManager
from src.utils.task import TaskManager, TaskStatus

# Initialize the task manager
task_manager = TaskManager(output_dir=OUTPUT_DIR)

def allowed_text_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_TEXT_EXTENSIONS

def ensure_directories_exist():
    """Create all required directories if they don't exist."""
    base_path = os.path.dirname(os.path.abspath(__file__))
    for directory in REQUIRED_DIRECTORIES:
        dir_path = os.path.join(base_path, directory)
        if not os.path.exists(dir_path):
            os.makedirs(dir_path, exist_ok=True)
            custom_print(FILE, f"Created directory: {directory}")

# Ensure all required directories exist at application startup
ensure_directories_exist()

def get_background_videos():
    """Get all background video mixes from the VideoClipMix directory"""
    videos = []
    base_path = os.path.join(os.path.dirname(__file__), VIDEO_CLIP_MIX_DIR)
    
    if not os.path.exists(base_path):
        os.makedirs(base_path, exist_ok=True)
        return []
    
    # Get all folders in the base path
    for folder in os.listdir(base_path):
        folder_path = os.path.join(base_path, folder)
        if os.path.isdir(folder_path):
            # Check for config.json to get name and emoji
            config_path = os.path.join(folder_path, 'config.json')
            if os.path.exists(config_path):
                try:
                    with open(config_path, 'r') as f:
                        config_data = json.load(f)
                        
                    # Use name and emoji from config if available
                    name = config_data.get('name', f"Mix {folder.split('_')[1]}" if '_' in folder else folder)
                    emoji = config_data.get('emoji', '')
                    
                    videos.append({
                        "id": folder,
                        "name": name,
                        "emoji": emoji
                    })
                except (json.JSONDecodeError, IOError) as e:
                    # Fallback if config.json can't be read or parsed
                    mix_num = int(folder.split('_')[1]) if '_' in folder and folder.split('_')[1].isdigit() else 0
                    videos.append({
                        "id": folder,
                        "name": f"Mix {mix_num}" if mix_num > 0 else folder,
                        "emoji": ""
                    })
            else:
                # No config.json found, use default naming
                mix_num = int(folder.split('_')[1]) if '_' in folder and folder.split('_')[1].isdigit() else 0
                videos.append({
                    "id": folder,
                    "name": f"Mix {mix_num}" if mix_num > 0 else folder,
                    "emoji": ""
                })
    
    # Sort videos by their numerical number
    videos.sort(key=lambda v: int(v['id'].split('_')[1]) if '_' in v['id'] and v['id'].split('_')[1].isdigit() else 0)
    
    return videos

def get_badges():
    base_path = os.path.join(os.path.dirname(__file__), badges_folder)
    return [f for f in os.listdir(base_path) if f.endswith('.png')]

def get_music_files():
    """Get all music files from the Music directory"""
    music_files = []
    music_folder = "Assets/Music"
    base_path = os.path.join(os.path.dirname(__file__), music_folder)
    
    if not os.path.exists(base_path):
        os.makedirs(base_path, exist_ok=True)
        return []
    
    # Get all audio files from the directory (no subdirectories)
    for file in os.listdir(base_path):
        file_path = os.path.join(base_path, file)
        if os.path.isfile(file_path) and file.lower().endswith(('.mp3', '.wav', '.ogg', '.m4a')):
            # Add to the list with the filename as both ID and name
            music_files.append({
                "id": file,
                "name": os.path.splitext(file)[0]  # filename without extension
            })
    
    # Sort files alphabetically
    music_files.sort(key=lambda m: m['name'].lower())
    
    return music_files

@app.route("/", methods=["GET", "POST"])
def index():
    """Main index page with video generation form."""
    base_path = os.path.join(os.path.dirname(__file__), PROFILE_DIR)
    profiles = get_profiles(base_path)
    profile_choices = [(p['id'], p['channel_name']) for p in profiles]
    
    # Get all background videos
    background_videos = get_background_videos()
    video_choices = [(v['id'], f"{v.get('emoji', '')} {v['name']}") for v in background_videos]
    
    # Get available music files
    music_files = get_music_files()
    
    global voices_cache, voices_cached, models_cache, models_cached, genpro
    
    # Re-check GenPro initialization if it wasn't initialized at startup
    # This allows adding the API key without restarting the app
    if genpro is None:
        try:
            genpro = GenProTTS()
            custom_print(FILE, "GenPro TTS provider initialized successfully (late initialization)")
            # If GenPro was just initialized and cache exists, we should refresh
            if voices_cached or models_cached:
                custom_print(FILE, "GenPro was just initialized - refreshing cache...")
                voices_cached = False
                models_cached = False
        except ValueError as e:
            custom_print(FILE, f"GenPro TTS not available: {e}")
    
    try:
        if not voices_cached:
            custom_print(FILE, "Fetching voices for the first time...")
            elevenlabs_voices = elevenlabs.get_available_voices()
            ai33_voices = ai33.get_available_voices()
            genpro_voices = genpro.get_available_voices() if genpro else []
            voices_cache = elevenlabs_voices + ai33_voices + genpro_voices
            voices_cached = True
            custom_print(FILE, f"Cached {len(voices_cache)} total voices ({len(elevenlabs_voices)} ElevenLabs + {len(ai33_voices)} AI33 + {len(genpro_voices)} GenPro)")
        
        if not models_cached:
            custom_print(FILE, "Fetching models for the first time...")
            elevenlabs_models = elevenlabs.get_available_models()
            ai33_models = ai33.get_available_models()
            genpro_models = genpro.get_available_models() if genpro else []
            models_cache = elevenlabs_models + ai33_models + genpro_models
            models_cached = True
            custom_print(FILE, f"Cached {len(models_cache)} total models ({len(elevenlabs_models)} ElevenLabs + {len(ai33_models)} AI33 + {len(genpro_models)} GenPro)")
        
        voice_choices = [(voice['voice_id'], voice['name']) for voice in voices_cache]
        model_choices = [(model['model_id'], model['name']) for model in models_cache]
    except Exception as e:
        custom_print(FILE, f"Error fetching voices/models: {e}")
        voice_choices = [("default", "No voices found, error.")]
        model_choices = [("default", "No models found, error.")]
    
    all_tasks = task_manager.get_all_tasks()
    
    # Get queue statistics for display
    queue_stats = task_manager.get_queue_stats()

    # Clean task data for frontend by removing form_data_for_processing
    clean_tasks = {}
    for task_id, task_data in all_tasks.items():
        clean_task = task_data.copy()
        if "form_data_for_processing" in clean_task:
            del clean_task["form_data_for_processing"]
        clean_tasks[task_id] = clean_task

    badges = get_badges()
    
    form = VideoGenerationForm(
        voice_choices=voice_choices,
        voice_model_choices=model_choices,
        profile_choices=profile_choices,
        background_video_choices=video_choices
    )

    if request.method == "POST":
        # Logic from the previous submit_task_route
        if not request.files.getlist('text_files') or not request.form.get('profile'):
            # Re-render form with error

            if not request.files.getlist('text_files'):
                form.text_files.errors.append("No text files provided.")
                return render_template("index.html",
                                       profiles=profiles,
                                       background_videos=background_videos,
                                       badges=badges,
                                       music_files=music_files,
                                       form=form,
                                       tasks=clean_tasks,
                                       error_message="No text files provided.")
            elif not request.form.get('profile'):
                form.profile.errors.append("Profile not selected.")
                return render_template("index.html",
                                       profiles=profiles,
                                       background_videos=background_videos,
                                       badges=badges,
                                       music_files=music_files,
                                       form=form,
                                       tasks=clean_tasks,
                                       error_message="Profile not selected.")
        task_id = str(uuid.uuid4())
        selected_profile_id = request.form.get('profile')
        # profiles list already fetched above
        profile_name = "Unknown Profile"
        profile_config_loaded = {}
        for p_info in profiles:
            if p_info['id'] == selected_profile_id:
                profile_name = p_info['channel_name']
                config_path = os.path.join(os.path.dirname(__file__), PROFILE_DIR, selected_profile_id, 'config.json')
                if os.path.exists(config_path):
                    with open(config_path, 'r') as f_config:
                        profile_config_loaded = json.load(f_config)
                break
                
        # Create output folder immediately at the beginning
        from src.utils.workflow import WorkflowManager
        workflow_manager = WorkflowManager(base_dir=os.path.dirname(os.path.abspath(__file__)), task_id=task_id)
        custom_print(FILE, f"Creating output folder for task {task_id}")
        output_folder, audio_dir, image_dir, video_dir = workflow_manager.create_output_folder(
            profile=profile_name,
            channel_name=profile_name
        )
        custom_print(FILE, f"Created output folder at {output_folder} for task {task_id}")
        
        # Use the output folder for temp file storage
        uploaded_files_info = []
        for uploaded_file in request.files.getlist("text_files"):
            if uploaded_file and uploaded_file.filename and allowed_text_file(uploaded_file.filename):
                # Store uploaded files directly in the output folder
                temp_path = os.path.join(output_folder, uploaded_file.filename)
                uploaded_file.save(temp_path)
                uploaded_files_info.append({
                    "original_filename": uploaded_file.filename,
                    "temp_path": temp_path
                })

        # Create a task using TaskManager (after output folder is created)
        task_data = task_manager.create_task(
            profile_id=selected_profile_id,
            profile_name=profile_name,
            files=[info["original_filename"] for info in uploaded_files_info],
            form_data={
                "profile_id": selected_profile_id,
                "profile_config": profile_config_loaded,
                "voice": request.form.get('voice'),
                "background_video": request.form.get('background_video'),
                "uploaded_files_info": uploaded_files_info,
            },
            task_id=task_id,
            output_folder=output_folder
        )
          # Submit task to the managed queue instead of creating a raw thread
        success = task_manager.submit_task_for_execution(task_id, _actual_process_task_logic)
        if not success:
            task_manager.update_task(task_id, {
                "status": "error",
                "message": "Failed to submit task to queue"
            })
        else:
            # Check if task was queued
            task = task_manager.get_task(task_id)
            if task and task.get("status") == "queued":
                queue_stats = task_manager.get_queue_stats()
                custom_print(FILE, f"Task {task_id} added to queue. Current queue: {queue_stats['queued']} waiting, {queue_stats['processing']} processing")
        
        return redirect(url_for('index'))
    
    # This is the GET request part
    return render_template("index.html", 
                           profiles=profiles, 
                           background_videos=background_videos, 
                           badges=badges, 
                           music_files=music_files, 
                           form=form,
                           tasks=clean_tasks,
                           queue_stats=queue_stats)

@app.route("/profiles")
def list_profiles():
    base_path = os.path.join(os.path.dirname(__file__), PROFILE_DIR)
    profiles = get_profiles(base_path)
    return jsonify(profiles)

@app.route("/profiles/<profile_id>")
def get_profile(profile_id):
    base_path = os.path.join(os.path.dirname(__file__), PROFILE_DIR)
    profile = get_profile_by_id(base_path, profile_id)
    
    if profile:
        return jsonify(profile)
    return jsonify({"error": "Profile not found"}), 404

@app.route("/profiles", methods=["POST"])
def create_profile_route():
    base_path = os.path.join(os.path.dirname(__file__), PROFILE_DIR)
    
    # Gather profile data
    profile_data = {
        'channel_name': request.form.get('channel_name'),
        'selected_badges': request.form.getlist('badges'),
        'badge_style': request.form.get('badge_style', 'blue'),
        'voice': request.form.get('voice'),
        'font': request.form.get('font', 'montserrat'),
        'background_video': request.form.get('background_video'),
        'music': request.form.get('music', 'none'),
        'highlight_color': request.form.get('highlight_color', '#ffffff'),
        'animations_enabled': request.form.get('animations_enabled') == 'on',
        'video_length': request.form.get('video_length', 0),
        'voice_model': request.form.get('voice_model', 'default')
    }
    
    if not profile_data['channel_name']:
        return jsonify({"error": "Channel name is required"}), 400
    
    # Create profile
    profile_id, saved_data = create_profile(base_path, profile_data)
    
    # Save profile picture if provided
    if 'profile_pic' in request.files:
        file = request.files['profile_pic']
        if file.filename:
            profile_path = os.path.join(base_path, profile_id)
            file.save(os.path.join(profile_path, 'pfp.png'))
    
    return jsonify({"id": profile_id, **saved_data}), 201

@app.route("/profiles/<profile_id>", methods=["PUT"])
def update_profile_route(profile_id):
    base_path = os.path.join(os.path.dirname(__file__), PROFILE_DIR)
    
    # Gather updates
    updates = {}
    if request.form.get('channel_name'):
        updates['channel_name'] = request.form.get('channel_name')
    if request.form.getlist('badges'):
        updates['selected_badges'] = request.form.getlist('badges')
    if request.form.get('badge_style'):
        updates['badge_style'] = request.form.get('badge_style')
    if request.form.get('font'):
        updates['font'] = request.form.get('font')
    if request.form.get('voice'):
        updates['voice'] = request.form.get('voice')
    if request.form.get('background_video'):
        updates['background_video'] = request.form.get('background_video')
    if request.form.get('music'):
        updates['music'] = request.form.get('music')
    if request.form.get('highlight_color'):
        updates['highlight_color'] = request.form.get('highlight_color')
    if request.form.get('video_length'):
        updates['video_length'] = request.form.get('video_length')
    if request.form.get('voice_model'):
        updates['voice_model'] = request.form.get('voice_model')
    
    updates['animations_enabled'] = request.form.get('animations_enabled') == 'on'
    
    # Update profile picture if provided
    if 'profile_pic' in request.files:
        file = request.files['profile_pic']
        if file.filename:
            profile_path = os.path.join(base_path, profile_id)
            file.save(os.path.join(profile_path, 'pfp.png'))
    
    # Update profile
    result = update_profile(base_path, profile_id, updates)
    
    if result:
        return jsonify({"id": profile_id, **result})
    return jsonify({"error": "Profile not found"}), 404

@app.route("/profiles/<profile_id>", methods=["DELETE"])
def delete_profile_route(profile_id):
    base_path = os.path.join(os.path.dirname(__file__), PROFILE_DIR)
    
    if delete_profile(base_path, profile_id):
        return jsonify({"message": f"Profile {profile_id} deleted successfully"})
    return jsonify({"error": "Profile not found"}), 404

@app.route('/profiles/<profile_id>/pfp.png')
def get_profile_pic(profile_id):
    profile_path = os.path.join(os.path.dirname(__file__), PROFILE_DIR, profile_id)
    return send_from_directory(profile_path, "pfp.png")

# Add a new route to serve badge images
@app.route('/badges/<badge_name>')
def get_badge(badge_name):
    badges_dir = os.path.join(os.path.dirname(__file__), badges_folder)
    if 'verified' in badge_name:
        badges_dir = os.path.join(os.path.dirname(__file__), image_assets_folder)
    return send_from_directory(badges_dir, badge_name)

# Background video mix routes
@app.route("/background-videos")
def list_background_videos():
    videos = get_background_videos()
    return jsonify(videos)

@app.route("/background-videos/<video_id>")
def get_background_video(video_id):
    base_path = os.path.join(os.path.dirname(__file__), VIDEO_CLIP_MIX_DIR)
    video_path = os.path.join(base_path, video_id)
    config_path = os.path.join(video_path, 'config.json')
    
    if os.path.exists(config_path):
        with open(config_path, 'r') as f:
            video_data = json.load(f)
            video_data['id'] = video_id
            return jsonify(video_data)
    
    return jsonify({"error": "Background video mix not found"}), 404

@app.route("/background-videos", methods=["POST"])
def create_background_video():
    try:
        custom_print(FILE, "Starting background video mix creation...")
        data = request.form
        mix_name = data.get('mix_name')
        mix_emoji = data.get('mix_emoji')
        
        custom_print(FILE, f"Received form data: name='{mix_name}', emoji='{mix_emoji}'")
        
        if not mix_name:
            custom_print(FILE, "Error: Mix name is missing")
            return jsonify({"error": "Mix name is required"}), 400
        
        # Use a default emoji if none provided
        if not mix_emoji:
            custom_print(FILE, "Warning: Using default emoji as none was provided")
            mix_emoji = "📁"
        
        # Create a unique mix ID
        base_path = os.path.join(os.path.dirname(__file__), VIDEO_CLIP_MIX_DIR)
        custom_print(FILE, f"Base path for video clip mix: {base_path}")
        
        # Ensure the base directory exists
        custom_print(FILE, f"Creating base directory if it doesn't exist: {base_path}")
        os.makedirs(base_path, exist_ok=True)
        
        # Get existing mixes
        try:
            custom_print(FILE, f"Checking for existing mixes in: {base_path}")
            if os.path.exists(base_path):
                existing_mixes = [d for d in os.listdir(base_path) 
                                if os.path.isdir(os.path.join(base_path, d)) and d.startswith('Mix_')]
                custom_print(FILE, f"Found existing mixes: {existing_mixes}")
            else:
                custom_print(FILE, f"Base path doesn't exist even after attempting to create it: {base_path}")
                existing_mixes = []
        except Exception as e:
            # If there's any issue listing directories, assume no existing mixes
            custom_print(FILE, f"Error listing mixes: {str(e)}")
            existing_mixes = []
        
        next_id = 1
        if existing_mixes:
            # Extract numbers from existing mix folders
            mix_nums = []
            for m in existing_mixes:
                try:
                    parts = m.split('_')
                    custom_print(FILE, f"Processing mix folder: {m}, parts: {parts}")
                    if len(parts) > 1 and parts[1].isdigit():
                        mix_nums.append(int(parts[1]))
                except (IndexError, ValueError) as e:
                    custom_print(FILE, f"Error parsing mix folder name '{m}': {str(e)}")
                    continue
            
            custom_print(FILE, f"Extracted mix numbers: {mix_nums}")        
            if mix_nums:
                next_id = max(mix_nums) + 1
                custom_print(FILE, f"Next mix ID will be: {next_id}")
        else:
            custom_print(FILE, "No existing mixes found, using ID 1")
        
        mix_id = f"Mix_{next_id}"
        mix_path = os.path.join(base_path, mix_id)
        custom_print(FILE, f"Creating mix directory: {mix_path}")
        
        # Create mix directory
        os.makedirs(mix_path, exist_ok=True)
        
        # Create config file
        mix_data = {
            "name": mix_name,
            "emoji": mix_emoji
        }
        
        config_path = os.path.join(mix_path, 'config.json')
        custom_print(FILE, f"Writing config file to: {config_path}")
        with open(config_path, 'w') as f:
            json.dump(mix_data, f)
        
        custom_print(FILE, f"Successfully created background video mix: {mix_id}")
        return jsonify({"id": mix_id, **mix_data, "path": os.path.abspath(mix_path)}), 201
    
    except Exception as e:
        custom_print(FILE, f"Unhandled error creating background video mix: {str(e)}")
        import traceback
        custom_print(FILE, traceback.format_exc())
        return jsonify({"error": f"Failed to create background video mix: {str(e)}"}), 500

@app.route("/background-videos/<mix_id>", methods=["DELETE"])
def delete_background_video(mix_id):
    try:
        base_path = os.path.join(os.path.dirname(__file__), VIDEO_CLIP_MIX_DIR)
        mix_path = os.path.join(base_path, mix_id)
        
        if not os.path.exists(mix_path):
            return jsonify({"error": "Background video mix not found"}), 404
        
        # Delete the mix directory
        shutil.rmtree(mix_path)
        
        return jsonify({"message": f"Background video mix {mix_id} deleted successfully"})
    except Exception as e:
        custom_print(FILE, f"Error deleting background video mix: {str(e)}")
        return jsonify({"error": f"Failed to delete background video mix: {str(e)}"}), 500


@app.route("/task_status/<task_id>")
def task_status_route(task_id):
    """Get the status of a task by ID."""
    task_info = task_manager.get_task(task_id)
    if task_info:
        # Return a clean copy without form_data
        task_copy = task_info.copy()
        if "form_data_for_processing" in task_copy:
            del task_copy["form_data_for_processing"]
        return jsonify(task_copy)
    else:
        return jsonify({"status": "not_found", "message": "Task not found."}), 404


@app.route("/task_file_progress/<task_id>")
def task_file_progress_route(task_id):
    """Get the file-level progress of a task by ID."""
    file_progress = task_manager.get_file_progress(task_id)
    if file_progress:
        return jsonify({
            "task_id": task_id,
            "file_progress": file_progress
        })
    else:
        return jsonify({"task_id": task_id, "file_progress": {}}), 404


def _actual_process_task_logic(task_id):
    """
    Core video generation logic. Runs in a background thread.
    Updates task status with progress and final status.
    """
    task_details = task_manager.get_task(task_id)
    if not task_details:
        custom_print(FILE, f"Error: Task {task_id} disappeared before processing could start.")
        return

    task_form_data = task_details.get("form_data_for_processing")

    if not task_form_data:
        task_manager.update_task(task_id, {
            "status": TaskStatus.ERROR, 
            "message": "Internal error: Missing form data for processing."
        })
        custom_print(FILE, f"Error: Missing form data for task {task_id} in _actual_process_task_logic.")
        return

    # Ensure uploaded_files_info is available for cleanup in finally block
    uploaded_files_info_for_cleanup = task_form_data.get("uploaded_files_info", [])

    try:        
        task_manager.update_task(task_id, {
            "status": TaskStatus.PROCESSING, 
            "message": "Initializing video generation...", 
            "stage": "Initializing", 
            "progress": 5
        })

        profile_id_from_form = task_form_data["profile_id"]
        profile_config_from_form = task_form_data["profile_config"]
        selected_voice_id_from_form = task_form_data["voice"]
        selected_background_id_from_form = task_form_data["background_video"]

        # Create Profile model from config
        profile = Profile.from_dict(profile_config_from_form)

        # Use profile-specific voice and background video if available
        final_selected_voice_id = profile.voice or selected_voice_id_from_form
        final_selected_background_id = profile.background_video or selected_background_id_from_form
        
        selected_voice_name = ""
        try:
            # Use cached voices instead of fetching again
            for voice in voices_cache:
                if voice['voice_id'] == final_selected_voice_id:
                    selected_voice_name = voice['name']
                    break
            if not selected_voice_name and final_selected_voice_id:
                raise ValueError(f"Voice ID '{final_selected_voice_id}' not found in available voices.")
        except Exception as e:
            task_manager.update_task(task_id, {
                "status": TaskStatus.ERROR, 
                "message": f"Voice configuration error: {str(e)}",
                "stage": "Error", 
                "progress": 0
            })
            custom_print(FILE, f"Voice configuration error for task {task_id}: {str(e)}")
            return
        
        temp_file_paths_for_workflow = [info["temp_path"] for info in uploaded_files_info_for_cleanup]
        
        from src.utils.workflow import WorkflowManager
        
        channel_name_from_profile = profile.channel_name
        
        # base_dir should be the project root. Assuming main.py is in the project root.
        project_base_dir = os.path.abspath(os.path.dirname(__file__))
        
        # Update status before starting workflow
        task_manager.update_task(task_id, {
            "status": TaskStatus.PROCESSING, 
            "message": "Starting video workflow.", 
            "stage": "Processing", 
            "progress": 10
        })
        
        # Check for cancellation before starting intensive work
        task = task_manager.get_task(task_id)
        if task and task.get("status") == TaskStatus.CANCELLED:
            custom_print(FILE, f"Task {task_id} was cancelled before workflow start.")
            return
            
        # Create workflow manager instance and process task
        workflow_manager = WorkflowManager(task_id=task_id, base_dir=project_base_dir)
        result = workflow_manager.process_complete_task(
            profile_id=profile_id_from_form,
            voice_name=final_selected_voice_id,
            background_id=final_selected_background_id,
            channel_name=channel_name_from_profile,
            uploaded_files=temp_file_paths_for_workflow,
            uploaded_files_info=uploaded_files_info_for_cleanup
        )

        # Check for cancellation again after workflow returns
        task = task_manager.get_task(task_id)
        if task and task.get("status") == TaskStatus.CANCELLED:
            custom_print(FILE, f"Task {task_id} was cancelled during workflow.")
            return

        # Only mark as complete if not cancelled
        if result and result.get("output_folder"):
            task = task_manager.get_task(task_id)
            if task and task.get("status") != TaskStatus.CANCELLED:
                output_folder = result["output_folder"]
                task_manager.update_task(task_id, {
                    "status": TaskStatus.COMPLETE,
                    "message": "Video generation complete.",
                    "stage": "Completed", 
                    "progress": 100,
                    "output_folder": output_folder,
                    "end_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                })
                custom_print(FILE, f"Task {task_id} completed successfully.")
        else:
            error_message_from_workflow = result.get("error", "Workflow failed without specific error.") if result else "Workflow failed, no result object."
            task_manager.update_task(task_id, {
                "status": TaskStatus.ERROR, 
                "message": error_message_from_workflow, 
                "stage": "Error"
            })

    except Exception as e_outer:
        task = task_manager.get_task(task_id)
        if task and task.get("status") == TaskStatus.CANCELLED:
            custom_print(FILE, f"Task {task_id} processing caught exception but was already cancelled.")
            return 
            
        import traceback
        error_trace_outer = traceback.format_exc()
        custom_print(FILE, f"Critical error in _actual_process_task_logic for task {task_id}: {str(e_outer)}\\n{error_trace_outer}")
        
        task_manager.update_task(task_id, {
            "status": TaskStatus.ERROR,
            "message": f"Critical error during processing: {str(e_outer)}",
            "stage": "Error",
            "error_details": error_trace_outer
        })
    finally:
        # Cleanup temp files
        task = task_manager.get_task(task_id)
        task_status_final = task.get("status") if task else "unknown"
        custom_print(FILE, f"Task {task_id} entering finally block for cleanup. Status: {task_status_final}")
        
        for info in uploaded_files_info_for_cleanup:
            if os.path.exists(info["temp_path"]):
                try:
                    os.remove(info["temp_path"])
                    custom_print(FILE, f"Cleaned up temp file: {info['temp_path']} for task {task_id}")
                except Exception as e_clean_final:
                    custom_print(FILE, f"Error cleaning up temp file {info['temp_path']} for task {task_id}: {e_clean_final}")


@app.route("/task_action/<task_id>", methods=["POST"])
def task_action(task_id):
    """
    Unified endpoint to handle task actions (cancel or delete) based on the current task status.
    If the task is active, it will be cancelled.
    If the task is completed, it will be deleted from the history.
    """
    try:
        task = task_manager.get_task(task_id)
        if not task:
            return jsonify({
                "success": False, 
                "error": "Task not found"
            }), 404
        
        # Handle task based on its status
        if task.get('status') in ['initializing', 'processing']:
            # Cancel an active task
            updated_task = task_manager.cancel_task(task_id)
            if updated_task:
                return jsonify({
                    "success": True,
                    "action": "canceled",
                    "message": "Task cancellation request received"
                })
            else:
                return jsonify({
                    "success": False,
                    "error": "Failed to cancel task"
                }), 500
        else:
            # Delete task from history (but keep output files)
            if task_manager.delete_task(task_id):
                return jsonify({
                    "success": True,
                    "action": "deleted",
                    "message": f"Task {task_id} deleted from history"
                })
            else:
                return jsonify({
                    "success": False,
                    "error": "Failed to delete task"
                }), 500
                
    except Exception as e:
        import traceback
        custom_print(FILE, f"Error in task_action: {str(e)}")
        custom_print(FILE, traceback.format_exc())
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@app.route("/open_folder/<task_id>")
def open_folder(task_id):
    """Open the video directory inside the output folder for a specific completed task"""
    import subprocess
    import sys
    
    try:
        # Get the task information
        task = task_manager.get_task(task_id)
        if not task:
            return jsonify({"success": False, "error": "Task not found"}), 404
        
        # Check if task is completed and has an output folder
        if task.get("status") != "complete":
            return jsonify({"success": False, "error": "Task is not completed"}), 400
            
        output_folder = task.get("output_folder")
        if not output_folder or not os.path.exists(output_folder):
            return jsonify({"success": False, "error": "Output folder not found"}), 404
        
        # Look for the video directory inside the output folder
        video_folder = os.path.join(output_folder, "videos")
        
        # If video folder doesn't exist, fall back to the main output folder
        folder_to_open = video_folder if os.path.exists(video_folder) else output_folder
        
        # Open the directory using the appropriate command for the platform
        if os.name == 'nt':  # Windows
            subprocess.Popen(f'explorer "{folder_to_open}"')
        elif os.name == 'posix':  # macOS or Linux
            if 'darwin' in sys.platform:  # macOS
                subprocess.Popen(['open', folder_to_open])
            else:  # Linux
                subprocess.Popen(['xdg-open', folder_to_open])
                
        return jsonify({"success": True, "path": folder_to_open})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route("/queue_stats")
def queue_stats():
    """Get current queue statistics with detailed information."""
    stats = task_manager.get_queue_stats()
    
    # Add additional information about queue status
    queued_tasks = []
    processing_tasks = []
    
    for task_id, task in task_manager.get_all_tasks().items():
        task_status = task.get("status")
        if task_status == TaskStatus.QUEUED:
            queued_tasks.append({
                "id": task_id,
                "position": task.get("queue_position", 0),
                "profile": task.get("profile", "Unknown"),
                "message": task.get("message", "In queue")
            })
        elif task_status == TaskStatus.PROCESSING:
            processing_tasks.append({
                "id": task_id,
                "profile": task.get("profile", "Unknown"),
                "stage": task.get("stage", "Processing"),
                "progress": task.get("progress", 0),
                "message": task.get("message", "Processing")
            })
    
    # Sort queued tasks by position
    queued_tasks.sort(key=lambda x: x["position"])
    
    return jsonify({
        **stats,
        "queued_tasks": queued_tasks,
        "processing_tasks": processing_tasks
    })

@app.route("/refresh_voices", methods=["POST"])
def refresh_voices():
    """Manually refresh the voices and models cache."""
    global voices_cache, voices_cached, models_cache, models_cached, genpro
    
    try:
        # Re-check GenPro initialization
        if genpro is None:
            try:
                genpro = GenProTTS()
                custom_print(FILE, "GenPro TTS provider initialized successfully (manual refresh)")
            except ValueError as e:
                custom_print(FILE, f"GenPro TTS not available: {e}")
        
        # Force refresh all providers
        custom_print(FILE, "Manually refreshing voices and models cache...")
        elevenlabs_voices = elevenlabs.get_available_voices(force_refresh=True)
        ai33_voices = ai33.get_available_voices(force_refresh=True)
        genpro_voices = genpro.get_available_voices(force_refresh=True) if genpro else []
        voices_cache = elevenlabs_voices + ai33_voices + genpro_voices
        
        elevenlabs_models = elevenlabs.get_available_models(force_refresh=True)
        ai33_models = ai33.get_available_models(force_refresh=True)
        genpro_models = genpro.get_available_models(force_refresh=True) if genpro else []
        models_cache = elevenlabs_models + ai33_models + genpro_models
        
        voices_cached = True
        models_cached = True
        
        custom_print(FILE, f"Cache refreshed: {len(voices_cache)} voices, {len(models_cache)} models")
        
        return jsonify({
            "success": True,
            "message": "Voices and models cache refreshed successfully",
            "voices_count": len(voices_cache),
            "models_count": len(models_cache),
            "genpro_available": genpro is not None
        })
    except Exception as e:
        custom_print(FILE, f"Error refreshing cache: {e}", error=True)
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

if __name__ == "__main__":
    # Ensure all required directories exist before starting    custom_print(FILE, "Initializing Pravus...")
    
    # Ensure output directory exists
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR, exist_ok=True)
        custom_print(FILE, f"Created output directory: {OUTPUT_DIR}")
    
    # Show queue configuration
    queue_stats = task_manager.get_queue_stats()
    custom_print(FILE, f"Queue system ready: {queue_stats['max_concurrent']} max concurrent tasks")
    custom_print(FILE, f"Current queue: {queue_stats['processing']} processing, {queue_stats['queued']} queued")

    custom_print(FILE, "Starting Pravus Video Generator...")
    app.run(debug=True)