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
from datetime import datetime

from dotenv import load_dotenv
load_dotenv()

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
R2_PUBLIC_URL = os.getenv('R2_PUBLIC_URL')  # e.g., https://pub-xxx.r2.dev

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

# Shared assets path
SHARED_ASSETS_PATH = os.getenv('SHARED_ASSETS_PATH', 'C:/Nuntius/assets')
VIDEO_CLIP_MIX_DIR = os.path.join(SHARED_ASSETS_PATH, 'VideoClipMix')
MUSIC_DIR = os.path.join(SHARED_ASSETS_PATH, 'Music')

# Local paths
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), 'output')
POLL_INTERVAL = 5  # seconds

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
    """Upload a file to Cloudflare R2 and return the public URL"""
    if not r2_client:
        print("  R2 not configured, skipping upload")
        return None
    
    try:
        file_ext = os.path.splitext(file_path)[1]
        object_key = f"pravus/{job_id}/output{file_ext}"
        
        print(f"  Uploading to R2: {object_key}")
        r2_client.upload_file(
            file_path,
            R2_BUCKET_NAME,
            object_key,
            ExtraArgs={'ContentType': 'video/mp4'}
        )
        
        # Construct public URL
        if R2_PUBLIC_URL:
            public_url = f"{R2_PUBLIC_URL}/{object_key}"
        else:
            public_url = f"https://{R2_BUCKET_NAME}.{R2_ACCOUNT_ID}.r2.cloudflarestorage.com/{object_key}"
        
        print(f"  Upload complete: {public_url}")
        return public_url
        
    except Exception as e:
        print(f"  Error uploading to R2: {e}")
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
    
    try:
        # Create output directory for this job
        job_output_dir = os.path.join(OUTPUT_DIR, job_id)
        os.makedirs(job_output_dir, exist_ok=True)
        
        # Extract settings from input_data
        channel_name = input_data.get('channel_name', 'Channel')
        profile_pic = input_data.get('profile_pic')
        font = input_data.get('font', 'montserrat')
        voice_id = input_data.get('voice', '')
        voice_model = input_data.get('voice_model', 'eleven_turbo_v2_5')
        video_length = input_data.get('video_length', 179)
        music = input_data.get('music', 'none')
        background_video = input_data.get('background_video', '')
        selected_badges = input_data.get('selected_badges', [])
        highlight_color = input_data.get('highlight_color', '#ffff00')
        animations_enabled = input_data.get('animations_enabled', True)
        badge_style = input_data.get('badge_style', 'blue')
        scripts = input_data.get('scripts', [])
        script_names = input_data.get('script_names', [])
        
        update_job_status(job_id, 'processing', 10)
        
        # Import the workflow manager
        sys.path.insert(0, os.path.dirname(__file__))
        from src.utils.workflow import WorkflowManager
        from src.utils.models import Profile
        
        # Create a profile object
        profile = Profile(
            channel_name=channel_name,
            font=font,
            voice=voice_id,
            voice_model=voice_model,
            video_length=video_length,
            music=music,
            background_video=background_video,
            selected_badges=selected_badges,
            highlight_color=highlight_color,
            animations_enabled=animations_enabled,
            badge_style=badge_style
        )
        
        update_job_status(job_id, 'processing', 20)
        
        # Save scripts to temp files
        temp_script_files = []
        for i, (script_content, script_name) in enumerate(zip(scripts, script_names)):
            script_path = os.path.join(job_output_dir, script_name)
            with open(script_path, 'w', encoding='utf-8') as f:
                f.write(script_content)
            temp_script_files.append(script_path)
        
        update_job_status(job_id, 'processing', 30)
        
        # Save profile picture if provided
        profile_pic_path = None
        if profile_pic and profile_pic.startswith('data:'):
            import base64
            # Decode base64 image
            header, data = profile_pic.split(',', 1)
            profile_pic_path = os.path.join(job_output_dir, 'pfp.png')
            with open(profile_pic_path, 'wb') as f:
                f.write(base64.b64decode(data))
        
        update_job_status(job_id, 'processing', 40)
        
        # Create workflow manager and process
        workflow_manager = WorkflowManager(
            task_id=job_id,
            base_dir=os.path.dirname(__file__)
        )
        
        # Override paths to use shared assets
        workflow_manager.video_clip_mix_dir = VIDEO_CLIP_MIX_DIR
        workflow_manager.music_dir = MUSIC_DIR
        
        update_job_status(job_id, 'processing', 50)
        
        # Process the task
        result = workflow_manager.process_complete_task(
            profile_id=job_id,
            voice_name=voice_id,
            background_id=background_video,
            channel_name=channel_name,
            uploaded_files=temp_script_files,
            uploaded_files_info=[{'temp_path': f, 'original_filename': os.path.basename(f)} for f in temp_script_files]
        )
        
        update_job_status(job_id, 'processing', 90)
        
        # Find output video
        if result and result.get('output_folder'):
            output_folder = result['output_folder']
            video_folder = os.path.join(output_folder, 'videos')
            
            video_files = []
            if os.path.exists(video_folder):
                video_files = [f for f in os.listdir(video_folder) if f.endswith(('.mp4', '.mov'))]
            
            if video_files:
                video_path = os.path.join(video_folder, video_files[0])
                print(f"Video generated: {video_path}")
                
                update_job_status(job_id, 'processing', 95)
                
                # Upload to R2
                output_url = upload_to_r2(video_path, job_id)
                
                if output_url:
                    update_job_status(job_id, 'completed', 100, output_url=output_url)
                    
                    # Clean up local files
                    try:
                        shutil.rmtree(job_output_dir)
                        if os.path.exists(output_folder):
                            shutil.rmtree(output_folder)
                        print(f"  Cleaned up local files")
                    except Exception as e:
                        print(f"  Warning: Could not clean up local files: {e}")
                else:
                    # Keep local, provide local path
                    update_job_status(job_id, 'completed', 100, output_url=f"file://{os.path.abspath(video_path)}")
            else:
                update_job_status(job_id, 'failed', error_message='No output video found')
        else:
            error_msg = result.get('error', 'Workflow failed') if result else 'No result from workflow'
            update_job_status(job_id, 'failed', error_message=error_msg)
            
    except Exception as e:
        error_msg = str(e)
        print(f"Error processing job: {error_msg}")
        traceback.print_exc()
        update_job_status(job_id, 'failed', error_message=error_msg[:500])
    
    finally:
        send_heartbeat('online')

# ============================================
# MAIN LOOP
# ============================================

def main():
    """Main polling loop"""
    print("\n" + "="*60)
    print("  Pravus (Reddit) Video Generator - Job Poller")
    print("="*60)
    print(f"  Supabase URL: {SUPABASE_URL[:30]}...")
    print(f"  Shared Assets: {SHARED_ASSETS_PATH}")
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
    # Ensure output directory exists
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    main()

