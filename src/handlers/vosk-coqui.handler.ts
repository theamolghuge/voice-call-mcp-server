import { WebSocket } from "ws";
import twilio from "twilio";
import dotenv from "dotenv";
import {
  CallState,
  CallType,
  VoskConfig,
  CoquiConfig,
  OpenAIChatConfig,
} from "../types.js";
import {
  VOSK_MODEL_PATH,
  VOSK_SAMPLE_RATE,
  COQUI_TTS_MODEL,
  COQUI_TTS_SPEAKER,
  COQUI_SAMPLE_RATE,
  CHAT_API_PROVIDER,
  OPENAI_CHAT_MODEL,
  OPENAI_CHAT_TEMPERATURE,
  OPENROUTER_API_KEY,
  OPENROUTER_MODEL,
  OPENROUTER_BASE_URL,
  OPENROUTER_TEMPERATURE,
} from "../config/constants.js";
import { OpenAIContextService } from "../services/openai/context.service.js";
import { TwilioWsService } from "../services/twilio/ws.service.js";
import { VoskCoquiTwilioEventService } from "../services/twilio/vosk-coqui-event.service.js";
import { TwilioCallService } from "../services/twilio/call.service.js";
import { VoskSTTService } from "../services/vosk/stt.service.js";
import { CoquiTTSService } from "../services/coqui/tts.service.js";
import { ChatService } from "../services/chat/chat.interface.js";
import { ChatServiceFactory } from "../services/chat/chat.factory.js";
import { checkForGoodbye } from "../utils/call-utils.js";

dotenv.config();

/**
 * Handles voice calls using Vosk STT + Coqui TTS + OpenAI Chat
 */
export class VoskCoquiCallHandler {
  private readonly twilioStream: TwilioWsService;
  private readonly twilioEventProcessor: VoskCoquiTwilioEventService;
  private readonly twilioCallService: TwilioCallService;
  private readonly voskSTT: VoskSTTService;
  private readonly coquiTTS: CoquiTTSService;
  private readonly chatService: ChatService;
  private readonly callState: CallState;
  private isProcessingResponse = false;

  constructor(
    ws: WebSocket,
    callType: CallType,
    twilioClient: twilio.Twilio,
    contextService: OpenAIContextService
  ) {
    this.callState = new CallState(callType);

    // Initialize Twilio services
    this.twilioStream = new TwilioWsService(ws, this.callState);
    this.twilioCallService = new TwilioCallService(twilioClient);

    // Initialize Vosk STT service
    const voskConfig: VoskConfig = {
      modelPath: VOSK_MODEL_PATH,
      sampleRate: VOSK_SAMPLE_RATE,
    };
    this.voskSTT = new VoskSTTService(voskConfig);

    // Initialize Coqui TTS service
    const coquiConfig: CoquiConfig = {
      model: COQUI_TTS_MODEL,
      speaker: COQUI_TTS_SPEAKER,
      sampleRate: COQUI_SAMPLE_RATE,
    };
    this.coquiTTS = new CoquiTTSService(coquiConfig);

    // Initialize Chat service based on provider
    let chatConfig;
    if (CHAT_API_PROVIDER === "openrouter") {
      chatConfig = {
        apiKey: OPENROUTER_API_KEY,
        model: OPENROUTER_MODEL,
        temperature: OPENROUTER_TEMPERATURE,
        baseUrl: OPENROUTER_BASE_URL,
      };
    } else {
      chatConfig = {
        apiKey:
          process.env.OPENAI_CHAT_API_KEY || process.env.OPENAI_API_KEY || "",
        model: OPENAI_CHAT_MODEL,
        temperature: OPENAI_CHAT_TEMPERATURE,
      };
    }

    this.chatService = ChatServiceFactory.createChatService(
      CHAT_API_PROVIDER,
      chatConfig
    );

    // Initialize Twilio event processor
    this.twilioEventProcessor = new VoskCoquiTwilioEventService(
      this.callState,
      this.twilioCallService,
      contextService,
      (payload: string) => this.processIncomingAudio(payload),
      this
    );

    this.setupEventHandlers();
    this.initializeServices();
  }

  /**
   * Initialize the session with context (called from Twilio event processor)
   * @param callContext The context for the call
   */
  public initializeSession(callContext: string): void {
    this.chatService.initializeSession(callContext);
  }

  /**
   * Initialize all services
   */
  private async initializeServices(): Promise<void> {
    try {
      // Initialize Vosk STT
      await this.voskSTT.initialize((transcription) => {
        this.handleTranscription(transcription);
      });

      // Initialize Coqui TTS
      await this.coquiTTS.initialize((audioData) => {
        this.handleGeneratedAudio(audioData);
      });

      console.log("Vosk+Coqui services initialized successfully");
    } catch (error) {
      console.error("Error initializing Vosk+Coqui services:", error);
    }
  }

  /**
   * Process incoming audio from Twilio
   * @param audioPayload Base64 encoded audio data
   */
  private processIncomingAudio(audioPayload: string): void {
    if (this.voskSTT.isReady()) {
      this.voskSTT.processAudio(audioPayload);
    }
  }

  /**
   * Handle transcription from Vosk STT
   * @param transcription The transcribed text
   */
  private async handleTranscription(transcription: string): Promise<void> {
    if (!transcription.trim() || this.isProcessingResponse) {
      return;
    }

    console.log("User said:", transcription);

    // Add to conversation history
    this.callState.conversationHistory.push({
      role: "user",
      content: transcription,
    });

    // Check for goodbye phrases
    if (checkForGoodbye(transcription)) {
      await this.handleGoodbye();
      return;
    }

    // Generate AI response
    await this.generateAIResponse(transcription);
  }

  /**
   * Generate AI response using OpenAI Chat
   * @param userMessage The user's message
   */
  private async generateAIResponse(userMessage: string): Promise<void> {
    if (this.isProcessingResponse) {
      return;
    }

    this.isProcessingResponse = true;

    try {
      // Generate response using Chat service
      const response = await this.chatService.generateResponse(userMessage);

      if (response.trim()) {
        console.log("AI response:", response);

        // Add to conversation history
        this.callState.conversationHistory.push({
          role: "assistant",
          content: response,
        });

        // Generate speech using Coqui TTS
        this.coquiTTS.generateSpeech(response);
      }
    } catch (error) {
      console.error("Error generating AI response:", error);
    } finally {
      this.isProcessingResponse = false;
    }
  }

  /**
   * Handle generated audio from Coqui TTS
   * @param audioData Base64 encoded audio data
   */
  private handleGeneratedAudio(audioData: string): void {
    // Send audio to Twilio
    this.twilioStream.sendAudio(audioData);
  }

  /**
   * Handle goodbye and end call
   */
  private async handleGoodbye(): Promise<void> {
    try {
      // Generate a goodbye response
      const goodbyeResponse =
        "Thank you for calling. Have a great day! Goodbye.";

      // Add to conversation history
      this.callState.conversationHistory.push({
        role: "assistant",
        content: goodbyeResponse,
      });

      // Generate goodbye speech
      this.coquiTTS.generateSpeech(goodbyeResponse);

      // End call after a delay
      setTimeout(() => {
        this.endCall();
      }, 3000);
    } catch (error) {
      console.error("Error handling goodbye:", error);
      this.endCall();
    }
  }

  /**
   * End the call
   */
  private endCall(): void {
    if (this.callState.callSid) {
      this.twilioCallService.endCall(this.callState.callSid);
    }

    setTimeout(() => {
      this.closeServices();
    }, 2000);
  }

  /**
   * Close all services
   */
  private closeServices(): void {
    this.twilioStream.close();
    this.voskSTT.close();
    this.coquiTTS.close();
  }

  /**
   * Set up event handlers for Twilio WebSocket
   */
  private setupEventHandlers(): void {
    this.twilioStream.setupEventHandlers(
      async (message) =>
        await this.twilioEventProcessor.processMessage(message),
      async () => {
        this.closeServices();
      }
    );
  }

  /**
   * Get the current call state
   */
  public getCallState(): CallState {
    return this.callState;
  }
}
