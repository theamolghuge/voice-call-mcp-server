import { WebSocket } from "ws";
import twilio from "twilio";
import { CallType, VoiceProcessingMode } from "../types.js";
import { VOICE_PROCESSING_MODE } from "../config/constants.js";
import { OpenAIContextService } from "./openai/context.service.js";
import { OpenAICallHandler } from "../handlers/openai.handler.js";
import { VoskCoquiCallHandler } from "../handlers/vosk-coqui.handler.js";

/**
 * Manages multiple concurrent call sessions
 */
export class SessionManagerService {
  private readonly activeSessions: Map<
    string,
    OpenAICallHandler | VoskCoquiCallHandler
  >;
  private readonly twilioClient: twilio.Twilio;
  private readonly contextService: OpenAIContextService;

  /**
   * Create a new session manager
   * @param twilioConfig Configuration for the Twilio client
   */
  constructor(twilioClient: twilio.Twilio) {
    this.activeSessions = new Map();
    this.twilioClient = twilioClient;
    this.contextService = new OpenAIContextService();
  }

  /**
   * Creates a new call session and adds it to the active sessions
   * @param ws The WebSocket connection
   * @param callType The type of call
   */
  public createSession(ws: WebSocket, callType: CallType): void {
    let handler: OpenAICallHandler | VoskCoquiCallHandler;

    // Choose handler based on voice processing mode
    if (VOICE_PROCESSING_MODE === VoiceProcessingMode.VOSK_COQUI) {
      console.log("Creating session with Vosk+Coqui handler");
      handler = new VoskCoquiCallHandler(
        ws,
        callType,
        this.twilioClient,
        this.contextService
      );
    } else {
      console.log("Creating session with OpenAI Realtime handler");
      handler = new OpenAICallHandler(
        ws,
        callType,
        this.twilioClient,
        this.contextService
      );
    }

    this.registerSessionCleanup(ws);
    this.addSession(ws, handler);
  }

  /**
   * Register cleanup for a session
   * @param ws The WebSocket connection
   */
  private registerSessionCleanup(ws: WebSocket): void {
    ws.on("close", () => {
      this.removeSession(ws);
    });
  }

  /**
   * Add a session to active sessions
   * @param ws The WebSocket connection
   * @param handler The OpenAI call handler
   */
  private addSession(
    ws: WebSocket,
    handler: OpenAICallHandler | VoskCoquiCallHandler
  ): void {
    this.activeSessions.set(this.getSessionKey(ws), handler);
  }

  /**
   * Removes a session from active sessions
   * @param ws The WebSocket connection
   */
  private removeSession(ws: WebSocket): void {
    const sessionKey = this.getSessionKey(ws);
    if (this.activeSessions.has(sessionKey)) {
      this.activeSessions.delete(sessionKey);
    }
  }

  /**
   * Generates a unique key for a session based on the WebSocket object
   * @param ws The WebSocket connection
   * @returns A unique key for the session
   */
  private getSessionKey(ws: WebSocket): string {
    return ws.url || ws.toString();
  }

  /**
   * Get the Twilio client
   * @returns The Twilio client
   */
  public getTwilioClient(): twilio.Twilio {
    return this.twilioClient;
  }

  /**
   * Get the context service
   * @returns The context service
   */
  public getContextService(): OpenAIContextService {
    return this.contextService;
  }
}
