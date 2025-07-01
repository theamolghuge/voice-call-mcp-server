import axios, { AxiosInstance } from "axios";
import { ChatService, ChatServiceConfig } from "../chat/chat.interface.js";
import { ConversationMessage } from "../../types.js";

/**
 * Service for handling OpenRouter Chat API
 */
export class OpenRouterChatService implements ChatService {
  private readonly config: ChatServiceConfig;
  private readonly httpClient: AxiosInstance;
  private conversationHistory: ConversationMessage[] = [];
  private systemPrompt = "";

  /**
   * Create a new OpenRouter Chat service
   * @param config Configuration for OpenRouter Chat API
   */
  constructor(config: ChatServiceConfig) {
    this.config = {
      baseUrl: config.baseUrl || "https://openrouter.ai/api/v1",
      ...config,
    };

    this.httpClient = axios.create({
      baseURL: this.config.baseUrl,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/lukaskai/voice-call-mcp-server",
        "X-Title": "Voice Call MCP Server",
      },
      timeout: 30000,
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

      // Prepare request payload
      const payload = {
        model: this.config.model,
        messages: this.conversationHistory.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens || 150,
        stream: false,
      };

      // Make request to OpenRouter
      const response = await this.httpClient.post("/chat/completions", payload);

      const aiResponse = response.data.choices[0]?.message?.content || "";

      // Add assistant response to history
      if (aiResponse) {
        this.addAssistantMessage(aiResponse);
      }

      return aiResponse;
    } catch (error) {
      console.error("Error generating OpenRouter response:", error);

      // Provide more specific error messages
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          throw new Error("OpenRouter API key is invalid or missing");
        } else if (error.response?.status === 429) {
          throw new Error(
            "OpenRouter rate limit exceeded. Please try again later"
          );
        } else if (error.response?.status === 402) {
          throw new Error("OpenRouter account has insufficient credits");
        } else if (error.response?.data?.error) {
          throw new Error(
            `OpenRouter API error: ${
              error.response.data.error.message || error.response.data.error
            }`
          );
        }
      }

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

      // Prepare request payload
      const payload = {
        model: this.config.model,
        messages: this.conversationHistory.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens || 150,
        stream: true,
      };

      // Make streaming request to OpenRouter
      const response = await this.httpClient.post(
        "/chat/completions",
        payload,
        {
          responseType: "stream",
        }
      );

      let fullResponse = "";

      // Process streaming response
      response.data.on("data", (chunk: Buffer) => {
        const lines = chunk.toString().split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();

            if (data === "[DONE]") {
              break;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices[0]?.delta?.content || "";

              if (content) {
                fullResponse += content;
                onChunk(content);
              }
            } catch (parseError) {
              // Ignore parsing errors for malformed chunks
            }
          }
        }
      });

      // Wait for stream to complete
      await new Promise((resolve, reject) => {
        response.data.on("end", resolve);
        response.data.on("error", reject);
      });

      // Add complete assistant response to history
      if (fullResponse) {
        this.addAssistantMessage(fullResponse);
      }
    } catch (error) {
      console.error("Error generating OpenRouter streaming response:", error);
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

  /**
   * Get available models from OpenRouter
   */
  public async getAvailableModels(): Promise<any[]> {
    try {
      const response = await this.httpClient.get("/models");
      return response.data.data || [];
    } catch (error) {
      console.error("Error fetching OpenRouter models:", error);
      return [];
    }
  }

  /**
   * Get model information
   */
  public async getModelInfo(modelId: string): Promise<any> {
    try {
      const models = await this.getAvailableModels();
      return models.find((model) => model.id === modelId);
    } catch (error) {
      console.error("Error fetching model info:", error);
      return null;
    }
  }
}
