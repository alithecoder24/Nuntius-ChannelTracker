"""
Job Poller for iMessage Generator

This script polls Supabase for pending video jobs and processes them.
Run this on your PC to enable video generation from the web UI.

Usage:
    python job_poller.py
"""

import os
import sys
import time
import json
import traceback
import uuid
from datetime import datetime
from dotenv import load_dotenv

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import boto3
from botocore.config import Config
from supabase import create_client, Client
from video import VideoGenerator, Data
from utils import Person

load_dotenv()

# Supabase configuration
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Missing SUPABASE_URL or SUPABASE_KEY in .env file")
    print("Please copy .env.template to .env and fill in your credentials")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Cloudflare R2 configuration
R2_ACCOUNT_ID = os.getenv('R2_ACCOUNT_ID')
R2_ACCESS_KEY_ID = os.getenv('R2_ACCESS_KEY_ID')
R2_SECRET_ACCESS_KEY = os.getenv('R2_SECRET_ACCESS_KEY')
R2_BUCKET_NAME = os.getenv('R2_BUCKET_NAME', 'nuntius-videos')

# Initialize R2 client (S3-compatible)
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
    print("  R2 Storage: Enabled")
else:
    print("  R2 Storage: Disabled (missing credentials)")

POLL_INTERVAL = 10  # seconds
SCRIPTS_PATH = 'scripts'

def upload_to_r2(file_path: str, job_id: str) -> str:
    """Upload a file to Cloudflare R2 and return the public URL"""
    if not r2_client:
        print("  R2 not configured, skipping upload")
        return None
    
    try:
        # Generate a unique filename
        file_ext = os.path.splitext(file_path)[1]
        remote_filename = f"{job_id}{file_ext}"
        
        print(f"  Uploading to R2: {remote_filename}...")
        
        # Upload the file
        with open(file_path, 'rb') as f:
            r2_client.upload_fileobj(
                f,
                R2_BUCKET_NAME,
                remote_filename,
                ExtraArgs={
                    'ContentType': 'video/mp4',
                    'ContentDisposition': f'attachment; filename="{os.path.basename(file_path)}"'
                }
            )
        
        # Generate a presigned URL (valid for 24 hours)
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

def get_pending_jobs():
    """Fetch pending jobs from Supabase"""
    try:
        response = supabase.table('video_jobs') \
            .select('*') \
            .eq('status', 'pending') \
            .eq('tool_type', 'imessage-generator') \
            .order('created_at', desc=False) \
            .limit(1) \
            .execute()
        return response.data
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
        
        if status == 'processing' and not update_data.get('started_at'):
            update_data['started_at'] = datetime.utcnow().isoformat()
        
        if status == 'completed':
            update_data['completed_at'] = datetime.utcnow().isoformat()
            if output_url:
                update_data['output_url'] = output_url
        
        if status == 'failed' and error_message:
            update_data['error_message'] = error_message
            update_data['completed_at'] = datetime.utcnow().isoformat()
        
        supabase.table('video_jobs').update(update_data).eq('id', job_id).execute()
        print(f"  Updated job {job_id[:8]}... to {status} ({progress}%)")
    except Exception as e:
        print(f"Error updating job status: {e}")

def process_job(job: dict):
    """Process a single video generation job"""
    job_id = job['id']
    input_data = job['input_data']
    
    print(f"\n{'='*50}")
    print(f"Processing job: {input_data.get('project_name', 'Unnamed')}")
    print(f"Job ID: {job_id}")
    print(f"{'='*50}")
    
    try:
        # Update status to processing
        update_job_status(job_id, 'processing', 5)
        
        # Extract job data
        project_name = input_data.get('project_name', 'Untitled')
        script = input_data.get('script', '')
        dark_mode = input_data.get('dark_mode', False)
        language = input_data.get('language', 'en')
        people_data = input_data.get('people', [])
        
        # Create timestamp for unique folder
        time_stamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        job_folder = f'{SCRIPTS_PATH}/{project_name}---{time_stamp}'
        os.makedirs(job_folder, exist_ok=True)
        
        # Create Person objects from job data
        # The script uses A:, B:, C:, etc. so we need to map person IDs to names
        people = []
        for i, p in enumerate(people_data):
            # Use the person ID (a, b, c...) as the name for script matching
            # The voice and display name come from the job data
            person_id = p.get('id', chr(97 + i))  # 'a', 'b', 'c', etc.
            people.append(Person(
                voice=p.get('voice'),
                name=person_id,  # Use 'a', 'b', 'c' to match script format A:, B:, C:
                image=None  # No profile images from web UI yet
            ))
            print(f"  Person {person_id.upper()}: voice={p.get('voice')}")
        
        # Pad to 10 people (required by the generator)
        while len(people) < 10:
            people.append(Person(voice=None, name=None, image=None))
        
        update_job_status(job_id, 'processing', 10)
        
        # Create Data object
        data = Data(
            name=project_name,
            script=script,
            dark_mode=dark_mode,
            images=[],
            status='pending',
            id=f'{project_name}---{time_stamp}',
            language=language,
            people=people
        )
        
        # Save job data to JSON
        with open(f'{job_folder}/{project_name}.json', 'w') as f:
            json.dump(data.to_json, f)
        
        update_job_status(job_id, 'processing', 20)
        
        # Create video generator with progress callback
        generator = VideoGenerator(data=data, script_path=SCRIPTS_PATH)
        
        # Override status update to also update Supabase
        original_update = generator.update_data_status
        def update_with_progress():
            original_update()
            # Parse progress from status
            status = generator.data.status
            if 'video:' in status.lower():
                # Estimate progress based on status
                progress = 50 + (hash(status) % 40)  # 50-90%
                update_job_status(job_id, 'processing', progress)
        generator.update_data_status = update_with_progress
        
        print("Starting video generation...")
        update_job_status(job_id, 'processing', 30)
        
        # Generate the video
        generator.generate_video()
        
        if generator.stop:
            update_job_status(job_id, 'failed', error_message='Generation was stopped')
            return
        
        # Find the output video
        output_dir = f'generated/{time_stamp}'
        video_files = []
        if os.path.exists(output_dir):
            video_files = [f for f in os.listdir(output_dir) if f.endswith(('.mp4', '.mov'))]
        
        if video_files:
            video_path = os.path.join(output_dir, video_files[0])
            print(f"Video generated: {video_path}")
            
            update_job_status(job_id, 'processing', 95)
            
            # Upload to R2 cloud storage
            output_url = upload_to_r2(video_path, job_id)
            
            if output_url:
                print(f"  Download URL ready!")
                update_job_status(job_id, 'completed', 100, output_url=output_url)
            else:
                # Fallback to local path if R2 upload fails
                output_url = f"file://{os.path.abspath(video_path)}"
                print(f"  Using local path (R2 upload failed)")
                update_job_status(job_id, 'completed', 100, output_url=output_url)
        else:
            update_job_status(job_id, 'failed', error_message='No output video found')
        
    except Exception as e:
        error_msg = str(e)
        print(f"Error processing job: {error_msg}")
        traceback.print_exc()
        update_job_status(job_id, 'failed', error_message=error_msg[:500])

def main():
    """Main polling loop"""
    print("\n" + "="*60)
    print("  iMessage Generator - Job Poller")
    print("="*60)
    print(f"  Supabase URL: {SUPABASE_URL[:30]}...")
    print(f"  Poll interval: {POLL_INTERVAL} seconds")
    print("="*60)
    print("\nWaiting for jobs from the web UI...")
    print("(Press Ctrl+C to stop)\n")
    
    while True:
        try:
            jobs = get_pending_jobs()
            
            if jobs:
                for job in jobs:
                    process_job(job)
            else:
                # Show a dot to indicate we're alive
                print(".", end="", flush=True)
            
            time.sleep(POLL_INTERVAL)
            
        except KeyboardInterrupt:
            print("\n\nStopping job poller...")
            break
        except Exception as e:
            print(f"\nError in main loop: {e}")
            traceback.print_exc()
            time.sleep(POLL_INTERVAL)

if __name__ == '__main__':
    main()

