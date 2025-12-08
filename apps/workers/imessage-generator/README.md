# iMessage Generator Worker

This worker runs on your local PC and processes video generation jobs.

## Setup

1. Copy your existing iMessageChatGenerator code into this folder
2. Install dependencies: `pip install -r requirements.txt`
3. Configure environment variables (see `.env.template`)
4. Run the worker: `python app.py`

## How it works

1. The worker polls Supabase for new jobs every 10 seconds
2. When a job is found, it downloads the script and runs FFmpeg
3. The finished video is uploaded to cloud storage
4. The job status is updated to "done" with a download URL

## Files to add

- `app.py` - Your existing Flask app (will be modified to poll for jobs)
- `video.py` - Video generation logic
- `audio.py` - Audio processing
- `job_poller.py` - NEW: Polls Supabase for pending jobs
- `requirements.txt` - Python dependencies

