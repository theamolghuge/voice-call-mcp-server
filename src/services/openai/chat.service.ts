import OpenAI from "openai";
import { ChatService, ChatServiceConfig } from "../chat/chat.interface.js";
import { ConversationMessage } from "../../types.js";
import {
  OPENAI_CHAT_MODEL,
  OPENAI_CHAT_TEMPERATURE,
} from "../../config/constants.js";

/**
 * Service for handling OpenAI Chat API (used with Vosk+Coqui mode)
 */
export class OpenAIChatService implements ChatService {
  private readonly openai: OpenAI;
  private readonly config: ChatServiceConfig;
  private conversationHistory: ConversationMessage[] = [];
  private systemPrompt = "";

  /**
   * Create a new OpenAI Chat service
   * @param config Configuration for OpenAI Chat API
   */
  constructor(config: ChatServiceConfig) {
    this.config = {
      ...config,
      model: config.model || OPENAI_CHAT_MODEL,
      temperature: config.temperature || OPENAI_CHAT_TEMPERATURE,
      maxTokens: config.maxTokens || 150,
    };

    this.openai = new OpenAI({
      apiKey: this.config.apiKey,
    });
  }

  /**
   * Initialize the chat session with system prompt
   * @param systemPrompt The system prompt for the conversation
   */
  public initializeSession(systemPrompt: string): void {
    this.systemPrompt = systemPrompt;
    this.conversationHistory = [
      {
        role: "system",
        content: systemPrompt,
      },
    ];
  }

  /**
   * Add a user message to the conversation
   * @param message The user's message
   */
  public addUserMessage(message: string): void {
    this.conversationHistory.push({
      role: "user",
      content: message,
    });
  }

  /**
   * Add an assistant message to the conversation
   * @param message The assistant's message
   */
  public addAssistantMessage(message: string): void {
    this.conversationHistory.push({
      role: "assistant",
      content: message,
    });
  }

  /**
   * Generate a response from the AI
   * @param userMessage The user's input message
   * @returns The AI's response
   */
  public async generateResponse(userMessage: string): Promise<string> {
    try {
      // Add user message to history
      this.addUserMessage(userMessage);

      // Create chat completion
      const completion = await this.openai.chat.completions.create({
        model: this.config.model,
        messages: this.conversationHistory.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        temperature: this.config.temperature,
        max_tokens: 150, // Keep responses concise for voice calls
        stream: false,
      });

      const response = completion.choices[0]?.message?.content || "";

      // Add assistant response to history
      if (response) {
        this.addAssistantMessage(response);
      }

      return response;
    } catch (error) {
      console.error("Error generating OpenAI Chat response:", error);
      throw error;
    }
  }

  /**
   * Generate a streaming response from the AI
   * @param userMessage The user's input message
   * @param onChunk Callback for each response chunk
   */
  public async generateStreamingResponse(
    userMessage: string,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    try {
      // Add user message to history
      this.addUserMessage(userMessage);

      // Create streaming chat completion
      const stream = await this.openai.chat.completions.create({
        model: this.config.model,
        messages: this.conversationHistory.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        temperature: this.config.temperature,
        max_tokens: 150,
        stream: true,
      });

      let fullResponse = "";

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          fullResponse += content;
          onChunk(content);
        }
      }

      // Add complete assistant response to history
      if (fullResponse) {
        this.addAssistantMessage(fullResponse);
      }
    } catch (error) {
      console.error("Error generating OpenAI Chat streaming response:", error);
      throw error;
    }
  }

  /**
   * Get the current conversation history
   */
  public getConversationHistory(): ConversationMessage[] {
    return [...this.conversationHistory];
  }

  /**
   * Clear the conversation history (keeping system prompt)
   */
  public clearHistory(): void {
    this.conversationHistory = [
      {
        role: "system",
        content: this.systemPrompt,
      },
    ];
  }

  /**
   * Update the system prompt
   * @param systemPrompt The new system prompt
   */
  public updateSystemPrompt(systemPrompt: string): void {
    this.systemPrompt = systemPrompt;
    this.conversationHistory[0] = {
      role: "system",
      content: systemPrompt,
    };
  }
}
