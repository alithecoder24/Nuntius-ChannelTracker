# Pravus Video Generation Interface

Welcome to Pravus! This is a user-friendly application that helps you create videos with AI-generated voices and effects. This guide will walk you through everything you need to get started, even if you're not familiar with technical software.

## What You'll Need Before Starting

Before you can use Pravus, you need to install two programs on your computer:

### 1. Python 3.11

Python is the programming language that powers Pravus.

**For Windows:**

1. Go to [python.org/downloads](https://python.org/downloads/)
2. Look for Python 3.11 (get the latest 3.11.x version - avoid 3.12 or 3.13 as they may cause issues)
3. Click "Download Python 3.11.x"
4. Run the downloaded file
5. **IMPORTANT:** Check the box that says "Add Python to PATH" during installation
6. Click "Install Now"

**For Mac:**

1. Go to [python.org/downloads](https://python.org/downloads/)
2. Download Python 3.11.x for macOS
3. Run the downloaded .pkg file and follow the installation steps

### 2. FFmpeg

FFmpeg is a powerful tool for processing video and audio files.

**For Windows:**

1. Open Command Prompt or PowerShell as Administrator:
   - Press Windows key + X
   - Select "Windows PowerShell (Admin)" or "Command Prompt (Admin)"
2. Install FFmpeg using winget:
   ```
   winget install FFmpeg
   ```
3. Wait for the installation to complete
4. Restart your computer to ensure FFmpeg is properly added to your system PATH

**Alternative method if winget is not available:**

1. Go to [ffmpeg.org/download.html](https://ffmpeg.org/download.html)
2. Click on "Windows" and then "Windows builds by BtbN"
3. Download the latest release (look for "ffmpeg-master-latest-win64-gpl.zip")
4. Extract the zip file to a folder like `C:\ffmpeg`
5. Add FFmpeg to your system PATH:
   - Press Windows key + R, type `sysdm.cpl` and press Enter
   - Click "Environment Variables"
   - Under "System Variables", find "Path" and click "Edit"
   - Click "New" and add `C:\ffmpeg\bin` (or wherever you extracted FFmpeg)
   - Click OK on all windows

**For Mac:**

1. Install Homebrew first (if you don't have it):
   - Open Terminal (found in Applications > Utilities)
   - Copy and paste: `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`
   - Press Enter and follow the prompts
2. Install FFmpeg:
   - In Terminal, type: `brew install ffmpeg`
   - Press Enter and wait for installation to complete

## How to Install and Run Pravus

### Step 1: Download Pravus

1. Download the Pravus project as a ZIP file
2. Extract (unzip) it to a location you can easily find, like your Desktop
3. You should now have a folder called "Pravus" with all the project files

### Step 2: Set Up Pravus

**For Windows:**

1. Open File Explorer and navigate to your Pravus folder
2. Hold Shift and right-click in an empty area of the folder
3. Select "Open PowerShell window here" or "Open Command Prompt here"
4. Type the following command and press Enter:
   ```
   pip install -r requirements.txt
   ```
5. Wait for all the required software to download and install

**For Mac:**

1. Open Terminal (Applications > Utilities > Terminal)
2. Type `cd ` (with a space after cd)
3. Drag your Pravus folder from Finder into the Terminal window
4. Press Enter - this will navigate to your Pravus folder
5. If there's a file called `start.command`, you need to make it executable:
   ```
   chmod +x start.command
   ```
6. Double click the start.command file. Which will install everything and open the .env file.

### Step 3: Configure Your Settings

1. Look for a file called `.env` in your Pravus folder
2. Open it with a text editor (like Notepad on Windows or TextEdit on Mac)
3. Add your ElevenLabs API key and other settings as needed
4. Save the file

### Step 4: Start Pravus

**For Windows:**

1. In your Pravus folder, look for a file called `main.py`
2. Double-click it, or run it from the command prompt with:
   ```
   python main.py
   ```

**For Mac:**

1. If you have a `start.command` file, simply double-click it

### Step 5: Use the Application

1. A web browser window should open automatically
2. If not, open your web browser and go to: `http://localhost:5000`
3. You can now use the Pravus interface to create your videos!

## Troubleshooting

**If you get errors about Python not being found:**

- Make sure you checked "Add Python to PATH" during Python installation
- Try restarting your computer after installing Python

**If you get errors about FFmpeg:**

- Make sure FFmpeg is properly installed and added to your system PATH
- Try restarting your computer after installation
