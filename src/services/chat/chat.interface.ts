import { ConversationMessage } from "../../types.js";

/**
 * Abstract interface for chat services
 */
export interface ChatService {
  /**
   * Initialize the chat session with system prompt
   * @param systemPrompt The system prompt for the conversation
   */
  initializeSession(systemPrompt: string): void;

  /**
   * Generate a response from the AI
   * @param userMessage The user's input message
   * @returns The AI's response
   */
  generateResponse(userMessage: string): Promise<string>;

  /**
   * Generate a streaming response from the AI
   * @param userMessage The user's input message
   * @param onChunk Callback for each response chunk
   */
  generateStreamingResponse(
    userMessage: string,
    onChunk: (chunk: string) => void
  ): Promise<void>;

  /**
   * Add a user message to the conversation
   * @param message The user's message
   */
  addUserMessage(message: string): void;

  /**
   * Add an assistant message to the conversation
   * @param message The assistant's message
   */
  addAssistantMessage(message: string): void;

  /**
   * Get the current conversation history
   */
  getConversationHistory(): ConversationMessage[];

  /**
   * Clear the conversation history (keeping system prompt)
   */
  clearHistory(): void;

  /**
   * Update the system prompt
   * @param systemPrompt The new system prompt
   */
  updateSystemPrompt(systemPrompt: string): void;
}

/**
 * Configuration for chat services
 */
export interface ChatServiceConfig {
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens?: number;
  baseUrl?: string;
}
