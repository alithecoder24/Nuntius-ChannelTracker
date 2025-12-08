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
from datetime import datetime
from dotenv import load_dotenv

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

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

POLL_INTERVAL = 10  # seconds
SCRIPTS_PATH = 'scripts'

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
        people = []
        for i, p in enumerate(people_data):
            people.append(Person(
                voice=p.get('voice'),
                name=p.get('name'),
                image=None  # No profile images from web UI yet
            ))
        
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
            
            # TODO: Upload to cloud storage (S3/Supabase Storage) and get URL
            # For now, just mark as completed with local path
            output_url = f"file://{os.path.abspath(video_path)}"
            
            print(f"Video generated: {video_path}")
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

