#!/bin/bash

# Installation script for Vosk+Coqui TTS dependencies
# This script installs the required Python packages and downloads a Vosk model

echo "Installing Python dependencies for Vosk+Coqui TTS mode..."

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is not installed. Please install Python 3.8+ first."
    exit 1
fi

# Check if pip is installed
if ! command -v pip3 &> /dev/null; then
    echo "Error: pip3 is not installed. Please install pip first."
    exit 1
fi

# Install Python packages
echo "Installing Python packages..."
pip3 install vosk TTS scipy soundfile numpy

# Create models directory
mkdir -p models

# Download Vosk model if it doesn't exist
if [ ! -d "models/vosk-model-en-us-0.22" ]; then
    echo "Downloading Vosk English model..."
    cd models
    wget https://alphacephei.com/vosk/models/vosk-model-en-us-0.22.zip
    unzip vosk-model-en-us-0.22.zip
    rm vosk-model-en-us-0.22.zip
    cd ..
    echo "Vosk model downloaded and extracted to models/vosk-model-en-us-0.22"
else
    echo "Vosk model already exists at models/vosk-model-en-us-0.22"
fi

echo ""
echo "Installation complete!"
echo ""
echo "To use Vosk+Coqui mode, set the following in your .env file:"
echo "VOICE_PROCESSING_MODE=vosk_coqui"
echo "VOSK_MODEL_PATH=./models/vosk-model-en-us-0.22"
echo "COQUI_TTS_MODEL=tts_models/en/ljspeech/tacotron2-DDC"
echo "OPENAI_CHAT_API_KEY=your_openai_api_key"
echo ""
echo "Note: The first time you use Coqui TTS, it will download the TTS model automatically."