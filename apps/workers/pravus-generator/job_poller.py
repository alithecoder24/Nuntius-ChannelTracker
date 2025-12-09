"""
Pravus (Reddit) Video Generator - Job Poller
Polls Supabase for pending video generation jobs and processes them.
"""

import os
import sys
import time
import json
import traceback
import shutil
import uuid
from datetime import datetime
from typing import Dict, Any, Optional

from dotenv import load_dotenv
load_dotenv()

# Add current directory to path for imports
sys.path.insert(0, os.path.dirname(__file__))

# Supabase setup
from supabase import create_client, Client

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Missing SUPABASE_URL or SUPABASE_KEY in .env")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# R2 setup
import boto3
from botocore.config import Config

R2_ACCOUNT_ID = os.getenv('R2_ACCOUNT_ID')
R2_ACCESS_KEY_ID = os.getenv('R2_ACCESS_KEY_ID')
R2_SECRET_ACCESS_KEY = os.getenv('R2_SECRET_ACCESS_KEY')
R2_BUCKET_NAME = os.getenv('R2_BUCKET_NAME', 'nuntius-videos')

r2_client = None
if R2_ACCOUNT_ID and R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY:
    r2_client = boto3.client(
        's3',
        endpoint_url=f'https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com',
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        config=Config(signature_version='s3v4'),
        region_name='auto'
    )
    print(f"R2 configured: bucket={R2_BUCKET_NAME}")
else:
    print("WARNING: R2 not configured, videos will only be saved locally")

# Shared ClipMix folder (both iMessage and Pravus use this)
VIDEO_CLIP_MIX_DIR = os.getenv('CLIP_MIX_PATH', 'C:/Nuntius-Clip-Mix')
# Music folder (Pravus only)
MUSIC_DIR = os.getenv('MUSIC_PATH', 'C:/Nuntius/assets/Music')

# Local paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(BASE_DIR, 'output')
ASSETS_DIR = os.path.join(BASE_DIR, 'Assets')
PROFILE_DIR = os.path.join(ASSETS_DIR, 'Profiles')
POLL_INTERVAL = 5  # seconds

# Ensure directories exist
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(ASSETS_DIR, exist_ok=True)
os.makedirs(PROFILE_DIR, exist_ok=True)

# ============================================
# MOCK TASK MANAGER (replaces Flask task_manager)
# ============================================

class TaskStatus:
    """Task status constants"""
    INITIALIZING = "initializing"
    PROCESSING = "processing"
    COMPLETE = "complete"
    ERROR = "error"
    CANCELLED = "cancelled"


class MockTaskManager:
    """
    Mock task manager that mimics the Flask app's task_manager.
    Stores task state in memory and syncs status to Supabase.
    """
    
    def __init__(self):
        self.tasks: Dict[str, Dict[str, Any]] = {}
    
    def create_task(self, task_id: str, initial_data: Dict[str, Any] = None) -> Dict[str, Any]:
        """Create a new task"""
        task = {
            "id": task_id,
            "status": TaskStatus.INITIALIZING,
            "message": "Initializing...",
            "stage": "Initializing",
            "progress": 0,
            "output_folder": None,
            "start_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            **(initial_data or {})
        }
        self.tasks[task_id] = task
        return task
    
    def get_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Get task by ID"""
        return self.tasks.get(task_id)
    
    def update_task(self, task_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Update task data"""
        if task_id in self.tasks:
            self.tasks[task_id].update(updates)
            return self.tasks[task_id]
        return None
    
    def cancel_task(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Cancel a task"""
        if task_id in self.tasks:
            self.tasks[task_id]["status"] = TaskStatus.CANCELLED
            return self.tasks[task_id]
        return None
    
    def delete_task(self, task_id: str) -> bool:
        """Delete a task"""
        if task_id in self.tasks:
            del self.tasks[task_id]
            return True
        return False


# Global task manager instance
task_manager = MockTaskManager()

# ============================================
# HEARTBEAT FUNCTION
# ============================================

def send_heartbeat(status: str = 'online'):
    """Send heartbeat to Supabase to indicate worker is alive"""
    try:
        supabase.table('worker_heartbeats').upsert({
            'worker_type': 'pravus-generator',
            'status': status,
            'last_heartbeat': datetime.utcnow().isoformat()
        }, on_conflict='worker_type').execute()
    except Exception as e:
        print(f"Error sending heartbeat: {e}")

# ============================================
# R2 UPLOAD FUNCTION
# ============================================

def upload_to_r2(file_path: str, job_id: str) -> str:
    """Upload a file to Cloudflare R2 and return a presigned URL (valid 24h)"""
    if not r2_client:
        print("  R2 not configured, skipping upload")
        return None
    
    try:
        file_ext = os.path.splitext(file_path)[1]
        remote_filename = f"pravus/{job_id}/output{file_ext}"
        
        print(f"  Uploading to R2: {remote_filename}...")
        
        # Upload the file
        with open(file_path, 'rb') as f:
            r2_client.upload_fileobj(
                f,
                R2_BUCKET_NAME,
                remote_filename,
                ExtraArgs={'ContentType': 'video/mp4'}
            )
        
        # Generate a presigned URL (valid for 24 hours) - same as iMessage bot
        url = r2_client.generate_presigned_url(
            'get_object',
            Params={
                'Bucket': R2_BUCKET_NAME,
                'Key': remote_filename
            },
            ExpiresIn=86400  # 24 hours
        )
        
        print(f"  Upload complete! URL valid for 24h")
        return url
        
    except Exception as e:
        print(f"  Error uploading to R2: {e}")
        traceback.print_exc()
        return None

# ============================================
# JOB MANAGEMENT FUNCTIONS
# ============================================

def get_pending_jobs():
    """Fetch pending jobs for pravus-generator"""
    try:
        result = supabase.table('video_jobs').select('*').eq(
            'status', 'pending'
        ).eq(
            'tool_type', 'pravus-generator'
        ).order(
            'created_at', desc=False
        ).limit(1).execute()
        
        return result.data if result.data else []
    except Exception as e:
        print(f"Error fetching jobs: {e}")
        return []

def update_job_status(job_id: str, status: str, progress: int = 0, error_message: str = None, output_url: str = None):
    """Update job status in Supabase"""
    try:
        update_data = {
            'status': status,
            'progress': progress,
        }
        
        if status == 'processing':
            update_data['started_at'] = datetime.utcnow().isoformat()
        
        if status == 'completed':
            update_data['completed_at'] = datetime.utcnow().isoformat()
            if output_url:
                update_data['output_url'] = output_url
        
        if status == 'failed' and error_message:
            update_data['error_message'] = error_message
            update_data['completed_at'] = datetime.utcnow().isoformat()
        
        supabase.table('video_jobs').update(update_data).eq('id', job_id).execute()
        print(f"  Job {job_id[:8]}... status: {status} ({progress}%)")
    except Exception as e:
        print(f"Error updating job: {e}")

# ============================================
# PROFILE CREATION
# ============================================

def create_temp_profile(job_id: str, input_data: Dict[str, Any]) -> str:
    """
    Create a temporary profile folder with config.json for the workflow.
    Returns the profile ID (folder name).
    """
    profile_id = f"job_{job_id[:8]}"
    profile_path = os.path.join(PROFILE_DIR, profile_id)
    os.makedirs(profile_path, exist_ok=True)
    
    # Create config.json
    config = {
        'channel_name': input_data.get('channel_name', 'Channel'),
        'badge_style': input_data.get('badge_style', 'blue'),
        'voice': input_data.get('voice', ''),
        'voice_model': input_data.get('voice_model', 'eleven_turbo_v2_5'),
        'background_video': input_data.get('background_video', ''),
        'selected_badges': input_data.get('selected_badges', []),
        'music': input_data.get('music', 'none'),
        'highlight_color': input_data.get('highlight_color', '#ffffff'),
        'animations_enabled': input_data.get('animations_enabled', True),
        'font': input_data.get('font', 'montserrat'),
        'video_length': input_data.get('video_length', 0)
    }
    
    config_path = os.path.join(profile_path, 'config.json')
    with open(config_path, 'w') as f:
        json.dump(config, f, indent=2)
    
    # Save profile picture if provided
    profile_pic = input_data.get('profile_pic')
    if profile_pic and profile_pic.startswith('data:'):
        import base64
        try:
            header, data = profile_pic.split(',', 1)
            pfp_path = os.path.join(profile_path, 'pfp.png')
            with open(pfp_path, 'wb') as f:
                f.write(base64.b64decode(data))
            print(f"  Saved profile picture to {pfp_path}")
        except Exception as e:
            print(f"  Warning: Could not save profile picture: {e}")
    
    print(f"  Created temp profile: {profile_id}")
    return profile_id

def cleanup_temp_profile(profile_id: str):
    """Remove temporary profile folder"""
    try:
        profile_path = os.path.join(PROFILE_DIR, profile_id)
        if os.path.exists(profile_path):
            shutil.rmtree(profile_path)
            print(f"  Cleaned up temp profile: {profile_id}")
    except Exception as e:
        print(f"  Warning: Could not clean up profile: {e}")

# ============================================
# VIDEO PROCESSING
# ============================================

def process_job(job: dict):
    """Process a single video generation job"""
    job_id = job['id']
    input_data = job['input_data']
    
    print(f"\n{'='*50}")
    print(f"Processing job: {job_id[:8]}...")
    print(f"Channel: {input_data.get('channel_name', 'Unknown')}")
    print(f"Scripts: {len(input_data.get('scripts', []))} file(s)")
    print(f"{'='*50}")
    
    send_heartbeat('busy')
    update_job_status(job_id, 'processing', 5)
    
    # Create temp profile
    profile_id = None
    job_output_dir = None
    
    try:
        # Create output directory for this job
        job_output_dir = os.path.join(OUTPUT_DIR, job_id)
        os.makedirs(job_output_dir, exist_ok=True)
        
        # Create temp profile from input_data
        profile_id = create_temp_profile(job_id, input_data)
        
        update_job_status(job_id, 'processing', 10)
        
        # Extract settings
        channel_name = input_data.get('channel_name', 'Channel')
        voice_id = input_data.get('voice', '')
        voice_model = input_data.get('voice_model', 'eleven_turbo_v2_5')
        background_video = input_data.get('background_video', '')
        scripts = input_data.get('scripts', [])
        script_names = input_data.get('script_names', [])
        
        # Save scripts to temp files
        temp_script_files = []
        uploaded_files_info = []
        
        for i, script_content in enumerate(scripts):
            script_name = script_names[i] if i < len(script_names) else f"script_{i+1}.txt"
            script_path = os.path.join(job_output_dir, script_name)
            with open(script_path, 'w', encoding='utf-8') as f:
                f.write(script_content)
            temp_script_files.append(script_path)
            uploaded_files_info.append({
                'temp_path': script_path,
                'original_filename': script_name
            })
        
        print(f"  Saved {len(temp_script_files)} script file(s)")
        update_job_status(job_id, 'processing', 20)
        
        # Initialize task in mock task manager
        task_manager.create_task(job_id, {
            "output_folder": job_output_dir,
            "status": TaskStatus.PROCESSING
        })
        
        # Import and run workflow
        from src.utils.workflow import WorkflowManager
        
        workflow_manager = WorkflowManager(
            task_id=job_id,
            base_dir=BASE_DIR
        )
        
        update_job_status(job_id, 'processing', 30)
        
        # Process the task
        print(f"  Starting workflow processing...")
        result = workflow_manager.process_complete_task(
            profile_id=profile_id,
            voice_name=voice_id,
            background_id=background_video,
            channel_name=channel_name,
            uploaded_files=temp_script_files,
            uploaded_files_info=uploaded_files_info
        )
        
        update_job_status(job_id, 'processing', 90)
        
        # Find output video
        if result and result.get('success'):
            output_folder = result.get('output_folder', job_output_dir)
            video_dir = os.path.join(output_folder, 'videos')
            
            video_files = []
            if os.path.exists(video_dir):
                video_files = [f for f in os.listdir(video_dir) if f.endswith(('.mp4', '.mov'))]
            
            if video_files:
                video_path = os.path.join(video_dir, video_files[0])
                print(f"  Video generated: {video_path}")
                
                update_job_status(job_id, 'processing', 95)
                
                # Upload to R2
                output_url = upload_to_r2(video_path, job_id)
                
                if output_url:
                    update_job_status(job_id, 'completed', 100, output_url=output_url)
                    print(f"  ✓ Job completed successfully!")
                else:
                    # Keep local, provide local path
                    local_url = f"file://{os.path.abspath(video_path)}"
                    update_job_status(job_id, 'completed', 100, output_url=local_url)
                    print(f"  ✓ Job completed (local only): {local_url}")
            else:
                error_msg = 'No output video found in videos folder'
                print(f"  ✗ {error_msg}")
                update_job_status(job_id, 'failed', error_message=error_msg)
        else:
            errors = result.get('errors', []) if result else ['No result returned']
            error_msg = '; '.join(errors) if errors else 'Workflow failed'
            print(f"  ✗ Workflow failed: {error_msg}")
            update_job_status(job_id, 'failed', error_message=error_msg[:500])
            
    except Exception as e:
        error_msg = str(e)
        print(f"  ✗ Error processing job: {error_msg}")
        traceback.print_exc()
        update_job_status(job_id, 'failed', error_message=error_msg[:500])
    
    finally:
        send_heartbeat('online')
        
        # Cleanup temp profile
        if profile_id:
            cleanup_temp_profile(profile_id)
        
        # Optionally cleanup job output directory
        # (keeping it for now in case of debugging)

# ============================================
# MAIN LOOP
# ============================================

def main():
    """Main polling loop"""
    print("\n" + "="*60)
    print("  Pravus (Reddit) Video Generator - Job Poller")
    print("="*60)
    print(f"  Supabase URL: {SUPABASE_URL[:30]}...")
    print(f"  Clip Mix Path: {VIDEO_CLIP_MIX_DIR}")
    print(f"  Music Path: {MUSIC_DIR}")
    print(f"  Poll interval: {POLL_INTERVAL} seconds")
    print("="*60)
    print("\nWaiting for jobs from the web UI...")
    print("(Press Ctrl+C to stop)\n")
    
    # Send initial heartbeat
    send_heartbeat('online')
    
    last_heartbeat = time.time()
    
    try:
        while True:
            # Send heartbeat every 15 seconds
            if time.time() - last_heartbeat > 15:
                send_heartbeat('online')
                last_heartbeat = time.time()
            
            # Check for pending jobs
            jobs = get_pending_jobs()
            
            if jobs:
                for job in jobs:
                    process_job(job)
            
            time.sleep(POLL_INTERVAL)
            
    except KeyboardInterrupt:
        print("\n\nShutting down...")
        send_heartbeat('offline')
        print("Worker stopped.")

if __name__ == '__main__':
    # Make mock task_manager available globally for workflow imports
    import builtins
    builtins.task_manager = task_manager
    
    main()
