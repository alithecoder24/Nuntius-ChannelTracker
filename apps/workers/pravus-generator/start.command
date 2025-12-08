#!/bin/bash

# Move to script's directory
cd "$(dirname "$0")"

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv

    # First-time setup steps
    echo "Running first-time setup..."

    # Install dependencies after creating venv
    source venv/bin/activate
    echo "Installing dependencies..."
    pip install torch torchvision
    pip install "git+https://github.com/francozanardi/pycaps.git#egg=pycaps[all]"
    
    # Install remaining dependencies
    pip install -r requirements.txt
    playwright install chromium

    # Setup .env if not already there
    if [ ! -f ".env" ] && [ -f ".env.template" ]; then
        echo "Creating .env from .env.template..."
        cp .env.template .env
        open -a TextEdit .env
        rm -f .env.template
    fi

    # Clean up unnecessary files
    echo "Cleaning up setup files..."
    rm -f .gitignore package.json package-lock.json requirements.txt
else
    # If not first run, just activate and install
    source venv/bin/activate
fi

# Export Flask app entry point
export FLASK_APP=main.py  # Change if your app's entry point is different

# Start the Flask app in the background
echo "Starting Flask server..."
python3 -m flask run &

# Open the browser after short delay

sleep 2
open http://localhost:5000

# keep mac busy, apple I hate you.
read -p "Press Enter to exit this window..."