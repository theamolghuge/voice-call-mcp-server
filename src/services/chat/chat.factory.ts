import { ChatService, ChatServiceConfig } from "./chat.interface.js";
import { OpenAIChatService } from "../openai/chat.service.js";
import { OpenRouterChatService } from "../openrouter/chat.service.js";

/**
 * Factory for creating chat services
 */
export class ChatServiceFactory {
  /**
   * Create a chat service based on the provider
   * @param provider The chat service provider ('openai' or 'openrouter')
   * @param config Configuration for the chat service
   * @returns The appropriate chat service instance
   */
  public static createChatService(
    provider: string,
    config: ChatServiceConfig
  ): ChatService {
    switch (provider.toLowerCase()) {
      case "openrouter":
        return new OpenRouterChatService(config);
      case "openai":
        return new OpenAIChatService(config);
      default:
        throw new Error(
          `Unsupported chat provider: ${provider}. Supported providers: 'openai', 'openrouter'`
        );
    }
  }

  /**
   * Get available chat providers
   * @returns Array of supported provider names
   */
  public static getAvailableProviders(): string[] {
    return ["openai", "openrouter"];
  }

  /**
   * Validate if a provider is supported
   * @param provider The provider name to validate
   * @returns True if the provider is supported
   */
  public static isProviderSupported(provider: string): boolean {
    return this.getAvailableProviders().includes(provider.toLowerCase());
  }
}
