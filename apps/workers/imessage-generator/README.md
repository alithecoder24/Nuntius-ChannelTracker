# iMessage Generator Worker

This worker runs locally on your PC and processes video generation jobs from the Nuntius web UI.

## Prerequisites

- Python 3.11+ (**must be added to PATH**)
- FFmpeg (`winget install "FFmpeg (Essentials Build)"`)
- ElevenLabs API key (for text-to-speech)

## Setup

### 1. Install Python dependencies

```bash
cd apps/workers/imessage-generator
pip install -r requirements.txt
```

### 2. Configure environment

Copy the `.env.template` to `.env`:

```bash
cp .env.template .env
```

Fill in the values:

```env
SECRET_KEY=your-flask-secret-key
ELEVENLABS_API_KEY=your-elevenlabs-api-key
DEBUG=false
SUPABASE_URL=your-supabase-url
SUPABASE_KEY=your-supabase-anon-key
```

### 3. Run the worker

**Windows:**
```bash
python app.py
```

Or double-click `launch.bat`

**Mac:**
```bash
python3 app.py
```

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  Nuntius Web UI (Vercel)                                     │
│  User submits script → Job saved to Supabase                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  This Worker (Your PC)                                       │
│  1. Polls Supabase for pending jobs every 10 seconds        │
│  2. Downloads script and settings                           │
│  3. Generates video using FFmpeg + ElevenLabs TTS           │
│  4. Uploads finished video to cloud storage                 │
│  5. Updates job status to "completed"                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  User downloads video from Web UI                            │
└─────────────────────────────────────────────────────────────┘
```

## Script Syntax

The script format supports these features:

| Syntax | Description |
|--------|-------------|
| `A: Hello` | Person A sends message (receiver/gray bubble) |
| `x-A: Hello` | Person A as sender (blue bubble) |
| `undelivered-A: Msg` | Undelivered message (green + error) |
| `[!image.png!]` | Insert an image |
| `##secret##` | Blur/censor text |
| `|b|sound|` | Play sound before message |
| `|a|sound|` | Play sound after message |
| `|ab|sound|` | Play sound during message |
| `-$-` | New image segment separator |
| `-chat-` | New chat segment |
| `contact_name: Name` | Set contact name in header |
| `group_name: Name` | Set group chat name |
| `text: Some text` | Display floating text (no bubble) |

## Available Sounds

Located in `resources/sounds/`:
- `send`, `receive` - iMessage sounds
- `notification`, `bell` - Alert sounds
- `airpod`, `airpod-left`, `airpod-right` - AirPod connection sounds
- `cinematic-boom-long`, `cinematic-boom-short` - Dramatic effects
- `dead-silence-0.1` to `dead-silence-8` - Silence of varying lengths
- And more...

## Output

Generated videos are saved to the `generated/` folder and uploaded to cloud storage.
