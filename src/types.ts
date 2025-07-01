// state.ts - Shared state variables
export enum CallType {
  OUTBOUND = "OUTBOUND",
}

export enum VoiceProcessingMode {
  OPENAI = "openai",
  VOSK_COQUI = "vosk_coqui",
}

export interface ConversationMessage {
  role: "system" | "user" | "assistant";
  content: string;
  name?: string;
}

export class CallState {
  // Call identification
  streamSid = "";
  callSid = "";

  // Call type and direction
  callType: CallType = CallType.OUTBOUND;

  // Phone numbers
  fromNumber = "";
  toNumber = "";

  // Call context and conversation
  callContext = "";
  initialMessage = "";
  conversationHistory: ConversationMessage[] = [];

  // Speech state
  speaking = false;

  // Timing and processing state
  llmStart = 0;
  firstByte = true;
  sendFirstSentenceInputTime: number | null = null;

  // Media processing state
  latestMediaTimestamp = 0;
  responseStartTimestampTwilio: number | null = null;
  lastAssistantItemId: string | null = null;
  markQueue: string[] = [];
  hasSeenMedia = false;

  constructor(callType: CallType = CallType.OUTBOUND) {
    this.callType = callType;
  }
}

/**
 * Configuration for the OpenAI WebSocket connection
 */
export interface OpenAIConfig {
  apiKey: string;
  websocketUrl: string;
  voice: string;
  temperature: number;
}

/**
 * Configuration for Vosk STT
 */
export interface VoskConfig {
  modelPath: string;
  sampleRate: number;
}

/**
 * Configuration for Coqui TTS
 */
export interface CoquiConfig {
  model: string;
  speaker?: string;
  sampleRate: number;
}

/**
 * Configuration for OpenAI Chat API (used with Vosk+Coqui)
 */
export interface OpenAIChatConfig {
  apiKey: string;
  model: string;
  temperature: number;
}

/**
 * Configuration for Twilio client
 */
export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  recordCalls: boolean;
}
