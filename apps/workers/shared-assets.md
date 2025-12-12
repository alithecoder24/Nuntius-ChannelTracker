# Shared Assets Configuration

Both the iMessage Generator and Pravus (Reddit) Generator use shared assets stored locally on your PC.

## Recommended Folder Structure

```
C:/Nuntius/assets/
├── VideoClipMix/          # Background videos (ClipMix folders)
│   ├── Mix_1/
│   │   ├── config.json    # {"name": "Cookim", "emoji": "🥐"}
│   │   └── *.mp4          # Video files
│   ├── Mix_2/
│   └── ...
├── Music/                 # Background music files
│   ├── Gymnopedie no1 -8db.mp3
│   └── ...
└── Profiles/              # Pravus channel profiles (optional)
    ├── Profile_1/
    │   ├── config.json
    │   └── pfp.png
    └── ...
```

## Setup

1. Create the folder `C:/Nuntius/assets/`
2. Copy your existing `VideoClipMix` folder there
3. Copy your `Music` folder there
4. Update both workers' `.env` files with:
   ```
   SHARED_ASSETS_PATH=C:/Nuntius/assets
   ```

## How It Works

- **VideoClipMix**: Background videos used by both tools
- **Music**: Background music for Pravus videos
- **Profiles**: Saved channel configurations for Pravus

Both workers will read from this shared location, so you only need to manage one set of assets.





