# Nuntius

A monorepo containing the Nuntius suite of tools.

## Structure

```
apps/
├── web/                    # Next.js web app (Vercel)
│   ├── src/
│   └── package.json
│
└── workers/                # Local workers (run on your PC)
    └── imessage-generator/ # iMessage video generator
```

## Apps

### Web (`apps/web`)
The main web dashboard hosted on Vercel. Includes:
- **Channel Tracker**: Track YouTube channels by niche, monitor growth
- **Video Tools**: UI for video generation (iMessage Generator, etc.)

### Workers (`apps/workers`)
Local workers that run on your PC for CPU-intensive tasks:
- **iMessage Generator**: Generate fake iMessage conversation videos using FFmpeg

## Development

### Web App
```bash
cd apps/web
npm install
npm run dev
```

### Workers
See individual worker READMEs for setup instructions.

## Deployment

The web app deploys to Vercel automatically. Workers run locally on your machine.

## Architecture

```
┌─────────────────────────────┐
│  Vercel (Web UI)            │
│  - Submit jobs              │
│  - View status              │
│  - Download results         │
└─────────────────────────────┘
            │
            ▼
┌─────────────────────────────┐
│  Supabase                   │
│  - Jobs queue               │
│  - File storage             │
└─────────────────────────────┘
            │
            ▼
┌─────────────────────────────┐
│  Your PC (Workers)          │
│  - Poll for jobs            │
│  - Process with FFmpeg      │
│  - Upload results           │
└─────────────────────────────┘
```





