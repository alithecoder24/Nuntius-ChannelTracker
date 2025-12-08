# Move to script's directory
Set-Location $PSScriptRoot

# Create virtual environment if it doesn't exist
if (-Not (Test-Path "venv")) {
    Write-Host "Creating virtual environment..." -ForegroundColor Green
    python -m venv venv

    # First-time setup steps
    Write-Host "Running first-time setup..." -ForegroundColor Green

    # Activate virtual environment
    & ".\venv\Scripts\Activate.ps1"
    
    Write-Host "Installing dependencies..." -ForegroundColor Green
    
    # Detect CUDA and install appropriate PyTorch version
    Write-Host "Detecting system configuration for PyTorch..." -ForegroundColor Cyan
    $nvidiaExists = Get-Command nvidia-smi -ErrorAction SilentlyContinue
    
    if ($nvidiaExists) {
        Write-Host "NVIDIA GPU detected. Installing PyTorch with CUDA support..." -ForegroundColor Yellow
        pip install torch torchvision --index-url https://download.pytorch.org/whl/cu126
    } else {
        Write-Host "No NVIDIA GPU detected. Installing CPU-only PyTorch..." -ForegroundColor Yellow
        pip install torch torchvision
    }

    pip install "git+https://github.com/francozanardi/pycaps.git#egg=pycaps[all]"
    playwright install chromium
    
    # Install remaining dependencies
    Write-Host "Installing remaining dependencies..." -ForegroundColor Yellow
    pip install -r requirements.txt

    # Setup .env if not already there
    if (-Not (Test-Path ".env") -And (Test-Path ".env.template")) {
        Write-Host "Creating .env from .env.template..." -ForegroundColor Green
        Copy-Item .env.template .env
        notepad .env
        Remove-Item .env.template -ErrorAction SilentlyContinue
    }

    # Clean up unnecessary files
    Write-Host "Cleaning up setup files..." -ForegroundColor Green
    Remove-Item .gitignore, package.json, package-lock.json, requirements.txt -ErrorAction SilentlyContinue
} else {
    # If not first run, just activate
    & ".\venv\Scripts\Activate.ps1"
}

# Set Flask app entry point
$env:FLASK_APP = "main.py"

# Start the Flask app in the background
Write-Host "Starting Flask server..." -ForegroundColor Green
Start-Process python -ArgumentList "-m", "flask", "run"

# Open the browser after short delay
Start-Sleep -Seconds 2
Start-Process "http://localhost:5000"

Write-Host "`nFlask server is running. Press Enter to stop and exit..." -ForegroundColor Cyan
Read-Host
