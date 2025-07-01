import { VoiceProcessingMode } from "../types.js";

export const LOG_EVENT_TYPES = [
  "error",
  "session.created",
  "response.audio.delta",
  "response.audio_transcript.done",
  "conversation.item.input_audio_transcription.completed",
];

export const DYNAMIC_API_SECRET =
  Math.random().toString(36).substring(2, 15) +
  Math.random().toString(36).substring(2, 15);
export const SHOW_TIMING_MATH = false;
export const VOICE = "sage";
export const RECORD_CALLS = process.env.RECORD === "true";
export const GOODBYE_PHRASES = [
  "bye",
  "goodbye",
  "have a nice day",
  "see you",
  "take care",
];

// Voice processing configuration
export const VOICE_PROCESSING_MODE =
  (process.env.VOICE_PROCESSING_MODE as VoiceProcessingMode) ||
  VoiceProcessingMode.OPENAI;

// Vosk configuration
export const VOSK_MODEL_PATH =
  process.env.VOSK_MODEL_PATH || "./models/vosk-model-en-us-0.22";
export const VOSK_SAMPLE_RATE = 8000; // Twilio uses 8kHz

// Coqui TTS configuration
export const COQUI_TTS_MODEL =
  process.env.COQUI_TTS_MODEL || "tts_models/en/ljspeech/tacotron2-DDC";
export const COQUI_TTS_SPEAKER = process.env.COQUI_TTS_SPEAKER || "";
export const COQUI_SAMPLE_RATE = 8000; // Twilio uses 8kHz

// Chat API configuration (for Vosk+Coqui mode)
export const CHAT_API_PROVIDER = process.env.CHAT_API_PROVIDER || "openai";

// OpenAI Chat API configuration
export const OPENAI_CHAT_MODEL = "gpt-4o-mini";
export const OPENAI_CHAT_TEMPERATURE = 0.6;

// OpenRouter API configuration
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
export const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "anthropic/claude-3-sonnet-20240229";
export const OPENROUTER_BASE_URL =
  process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
export const OPENROUTER_TEMPERATURE = 0.6;
