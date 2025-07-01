import { spawn, ChildProcess } from "child_process";
import { CoquiConfig } from "../../types.js";
import {
  COQUI_TTS_MODEL,
  COQUI_TTS_SPEAKER,
  COQUI_SAMPLE_RATE,
} from "../../config/constants.js";

/**
 * Service for handling Coqui Text-to-Speech
 */
export class CoquiTTSService {
  private readonly config: CoquiConfig;
  private coquiProcess: ChildProcess | null = null;
  private onAudioGenerated: ((audioData: string) => void) | null = null;
  private isInitialized = false;

  /**
   * Create a new Coqui TTS service
   * @param config Configuration for Coqui TTS
   */
  constructor(config?: Partial<CoquiConfig>) {
    this.config = {
      model: config?.model || COQUI_TTS_MODEL,
      speaker: config?.speaker || COQUI_TTS_SPEAKER,
      sampleRate: config?.sampleRate || COQUI_SAMPLE_RATE,
    };
  }

  /**
   * Initialize the Coqui TTS service
   * @param onAudioGenerated Callback for generated audio
   */
  public async initialize(
    onAudioGenerated: (audioData: string) => void
  ): Promise<void> {
    this.onAudioGenerated = onAudioGenerated;

    try {
      // Start Coqui TTS process
      this.coquiProcess = spawn(
        "python3",
        [
          "-c",
          `
import json
import sys
import base64
import io
import numpy as np
from TTS.api import TTS
import soundfile as sf
from scipy import signal

# Initialize TTS model
tts = TTS("${this.config.model}")

# Process text from stdin
while True:
    try:
        line = sys.stdin.readline()
        if not line:
            break
        
        data = json.loads(line.strip())
        text = data.get('text', '')
        
        if text:
            # Generate speech
            ${
              this.config.speaker
                ? `wav = tts.tts(text=text, speaker="${this.config.speaker}")`
                : `wav = tts.tts(text=text)`
            }
            
            # Convert to numpy array if needed
            if not isinstance(wav, np.ndarray):
                wav = np.array(wav)
            
            # Resample to target sample rate if needed
            if hasattr(tts, 'synthesizer') and hasattr(tts.synthesizer, 'output_sample_rate'):
                original_sr = tts.synthesizer.output_sample_rate
            else:
                original_sr = 22050  # Default TTS sample rate
            
            if original_sr != ${this.config.sampleRate}:
                # Resample to target sample rate
                num_samples = int(len(wav) * ${
                  this.config.sampleRate
                } / original_sr)
                wav = signal.resample(wav, num_samples)
            
            # Convert to int16 and then to bytes
            wav_int16 = (wav * 32767).astype(np.int16)
            
            # Convert to G.711 μ-law format for Twilio
            # First normalize to [-1, 1] range
            wav_normalized = wav_int16.astype(np.float32) / 32767.0
            
            # Apply μ-law encoding
            mu = 255.0
            wav_mulaw = np.sign(wav_normalized) * np.log(1 + mu * np.abs(wav_normalized)) / np.log(1 + mu)
            wav_mulaw_int = (wav_mulaw * 127).astype(np.int8) + 128
            
            # Convert to base64
            audio_base64 = base64.b64encode(wav_mulaw_int.tobytes()).decode('utf-8')
            
            # Output result
            result = {
                'type': 'audio',
                'data': audio_base64,
                'sample_rate': ${this.config.sampleRate}
            }
            print(json.dumps(result))
            sys.stdout.flush()
            
    except Exception as e:
        error_result = {
            'type': 'error',
            'message': str(e)
        }
        print(json.dumps(error_result), file=sys.stderr)
        sys.stderr.flush()
`,
        ],
        {
          stdio: ["pipe", "pipe", "pipe"],
        }
      );

      this.setupEventHandlers();
      this.isInitialized = true;
    } catch (error) {
      console.error("Failed to initialize Coqui TTS service:", error);
      throw error;
    }
  }

  /**
   * Set up event handlers for the Coqui process
   */
  private setupEventHandlers(): void {
    if (!this.coquiProcess) return;

    this.coquiProcess.stdout?.on("data", (data) => {
      try {
        const lines = data.toString().trim().split("\n");
        for (const line of lines) {
          if (line.trim()) {
            const result = JSON.parse(line);
            if (
              result.type === "audio" &&
              result.data &&
              this.onAudioGenerated
            ) {
              this.onAudioGenerated(result.data);
            }
          }
        }
      } catch (error) {
        console.error("Error parsing Coqui TTS output:", error);
      }
    });

    this.coquiProcess.stderr?.on("data", (data) => {
      console.error("Coqui TTS error:", data.toString());
    });

    this.coquiProcess.on("close", (code) => {
      console.log(`Coqui TTS process closed with code ${code}`);
      this.isInitialized = false;
    });

    this.coquiProcess.on("error", (error) => {
      console.error("Coqui TTS process error:", error);
      this.isInitialized = false;
    });
  }

  /**
   * Generate speech from text
   * @param text The text to convert to speech
   */
  public generateSpeech(text: string): void {
    if (!this.isInitialized || !this.coquiProcess || !this.coquiProcess.stdin) {
      console.error("Coqui TTS service not initialized");
      return;
    }

    try {
      const request = { text };
      this.coquiProcess.stdin.write(JSON.stringify(request) + "\n");
    } catch (error) {
      console.error("Error generating speech with Coqui TTS:", error);
    }
  }

  /**
   * Close the Coqui TTS service
   */
  public close(): void {
    if (this.coquiProcess) {
      this.coquiProcess.kill();
      this.coquiProcess = null;
    }
    this.isInitialized = false;
    this.onAudioGenerated = null;
  }

  /**
   * Check if the service is initialized
   */
  public isReady(): boolean {
    return this.isInitialized;
  }
}
