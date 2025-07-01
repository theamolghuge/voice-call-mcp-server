import { spawn, ChildProcess } from "child_process";
import { VoskConfig } from "../../types.js";
import { VOSK_MODEL_PATH, VOSK_SAMPLE_RATE } from "../../config/constants.js";

/**
 * Service for handling Vosk Speech-to-Text
 */
export class VoskSTTService {
  private readonly config: VoskConfig;
  private voskProcess: ChildProcess | null = null;
  private onTranscription: ((text: string) => void) | null = null;
  private isInitialized = false;

  /**
   * Create a new Vosk STT service
   * @param config Configuration for Vosk
   */
  constructor(config?: Partial<VoskConfig>) {
    this.config = {
      modelPath: config?.modelPath || VOSK_MODEL_PATH,
      sampleRate: config?.sampleRate || VOSK_SAMPLE_RATE,
    };
  }

  /**
   * Initialize the Vosk STT service
   * @param onTranscription Callback for transcription results
   */
  public async initialize(
    onTranscription: (text: string) => void
  ): Promise<void> {
    this.onTranscription = onTranscription;

    try {
      // Start Vosk process
      this.voskProcess = spawn(
        "python3",
        [
          "-c",
          `
import json
import sys
import vosk
import wave
import struct

# Initialize Vosk model
model = vosk.Model("${this.config.modelPath}")
rec = vosk.KaldiRecognizer(model, ${this.config.sampleRate})

# Process audio from stdin
while True:
    try:
        # Read audio data length (4 bytes)
        length_data = sys.stdin.buffer.read(4)
        if len(length_data) != 4:
            break
        
        # Unpack length
        length = struct.unpack('<I', length_data)[0]
        
        # Read audio data
        audio_data = sys.stdin.buffer.read(length)
        if len(audio_data) != length:
            break
        
        # Process with Vosk
        if rec.AcceptWaveform(audio_data):
            result = json.loads(rec.Result())
            if result.get('text'):
                print(json.dumps({'type': 'final', 'text': result['text']}))
                sys.stdout.flush()
        else:
            result = json.loads(rec.PartialResult())
            if result.get('partial'):
                print(json.dumps({'type': 'partial', 'text': result['partial']}))
                sys.stdout.flush()
    except Exception as e:
        print(json.dumps({'type': 'error', 'message': str(e)}), file=sys.stderr)
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
      console.error("Failed to initialize Vosk STT service:", error);
      throw error;
    }
  }

  /**
   * Set up event handlers for the Vosk process
   */
  private setupEventHandlers(): void {
    if (!this.voskProcess) return;

    this.voskProcess.stdout?.on("data", (data) => {
      try {
        const lines = data.toString().trim().split("\n");
        for (const line of lines) {
          if (line.trim()) {
            const result = JSON.parse(line);
            if (
              result.type === "final" &&
              result.text &&
              this.onTranscription
            ) {
              this.onTranscription(result.text);
            }
          }
        }
      } catch (error) {
        console.error("Error parsing Vosk output:", error);
      }
    });

    this.voskProcess.stderr?.on("data", (data) => {
      console.error("Vosk STT error:", data.toString());
    });

    this.voskProcess.on("close", (code) => {
      console.log(`Vosk STT process closed with code ${code}`);
      this.isInitialized = false;
    });

    this.voskProcess.on("error", (error) => {
      console.error("Vosk STT process error:", error);
      this.isInitialized = false;
    });
  }

  /**
   * Process audio data for speech recognition
   * @param audioData Base64 encoded audio data from Twilio
   */
  public processAudio(audioData: string): void {
    if (!this.isInitialized || !this.voskProcess || !this.voskProcess.stdin) {
      return;
    }

    try {
      // Convert base64 to buffer
      const audioBuffer = Buffer.from(audioData, "base64");

      // Write length prefix (4 bytes, little endian)
      const lengthBuffer = Buffer.allocUnsafe(4);
      lengthBuffer.writeUInt32LE(audioBuffer.length, 0);

      // Send to Vosk process
      this.voskProcess.stdin.write(lengthBuffer);
      this.voskProcess.stdin.write(audioBuffer);
    } catch (error) {
      console.error("Error processing audio with Vosk:", error);
    }
  }

  /**
   * Close the Vosk STT service
   */
  public close(): void {
    if (this.voskProcess) {
      this.voskProcess.kill();
      this.voskProcess = null;
    }
    this.isInitialized = false;
    this.onTranscription = null;
  }

  /**
   * Check if the service is initialized
   */
  public isReady(): boolean {
    return this.isInitialized;
  }
}
