# OpenRouter Integration Plan

## Overview

Integrate OpenRouter APIs to provide flexibility in choosing between different AI models (Claude, GPT-4, Llama, Gemini, etc.) instead of being locked into OpenAI's chat API for the Vosk+Coqui mode.

## Architecture Changes

### 1. Configuration Updates

#### New Environment Variables

```env
# Chat API Provider Selection
CHAT_API_PROVIDER=openrouter  # Options: "openai" or "openrouter"

# OpenRouter Configuration
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_MODEL=anthropic/claude-3-sonnet-20240229
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1

# OpenAI Configuration (fallback/alternative)
OPENAI_CHAT_API_KEY=your_openai_api_key
OPENAI_CHAT_MODEL=gpt-4o-mini
```

#### Model Options Examples

- `anthropic/claude-3-sonnet-20240229`
- `anthropic/claude-3-haiku-20240307`
- `openai/gpt-4o`
- `openai/gpt-4o-mini`
- `meta-llama/llama-3.1-70b-instruct`
- `google/gemini-pro-1.5`
- `mistralai/mistral-7b-instruct`

### 2. Service Architecture

#### New OpenRouter Service

```typescript
// src/services/openrouter/chat.service.ts
export class OpenRouterChatService {
  - API key management
  - Model selection
  - Request/response handling
  - Streaming support
  - Error handling
  - Rate limiting awareness
}
```

#### Abstract Chat Service Interface

```typescript
// src/services/chat/chat.interface.ts
export interface ChatService {
  initializeSession(systemPrompt: string): void;
  generateResponse(userMessage: string): Promise<string>;
  generateStreamingResponse(
    userMessage: string,
    onChunk: (chunk: string) => void
  ): Promise<void>;
  addUserMessage(message: string): void;
  addAssistantMessage(message: string): void;
  getConversationHistory(): ConversationMessage[];
  clearHistory(): void;
}
```

#### Chat Service Factory

```typescript
// src/services/chat/chat.factory.ts
export class ChatServiceFactory {
  static createChatService(provider: string): ChatService {
    switch (provider) {
      case "openrouter":
        return new OpenRouterChatService(config);
      case "openai":
        return new OpenAIChatService(config);
      default:
        throw new Error(`Unsupported chat provider: ${provider}`);
    }
  }
}
```

### 3. Implementation Details

#### OpenRouter API Integration

- **Base URL**: `https://openrouter.ai/api/v1`
- **Authentication**: Bearer token in Authorization header
- **Model Selection**: Specified in request body
- **Streaming**: Support for Server-Sent Events
- **Error Handling**: OpenRouter-specific error codes

#### Request Format

```json
{
  "model": "anthropic/claude-3-sonnet-20240229",
  "messages": [
    { "role": "system", "content": "System prompt" },
    { "role": "user", "content": "User message" }
  ],
  "temperature": 0.6,
  "max_tokens": 150,
  "stream": false
}
```

### 4. Configuration Validation

#### Environment Variable Validation

```typescript
// In src/start-all.ts
const CHAT_PROVIDER_VARS = {
  openrouter: ["OPENROUTER_API_KEY", "OPENROUTER_MODEL"],
  openai: ["OPENAI_CHAT_API_KEY"],
};

function validateChatProviderVars(provider: string): boolean {
  const requiredVars = CHAT_PROVIDER_VARS[provider];
  // Validate required variables exist
}
```

### 5. Updated Components

#### Vosk+Coqui Handler Updates

```typescript
// src/handlers/vosk-coqui.handler.ts
constructor() {
  // Use ChatServiceFactory to create appropriate service
  this.chatService = ChatServiceFactory.createChatService(CHAT_API_PROVIDER);
}
```

#### Constants Updates

```typescript
// src/config/constants.ts
export const CHAT_API_PROVIDER = process.env.CHAT_API_PROVIDER || "openai";
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
export const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "anthropic/claude-3-sonnet-20240229";
export const OPENROUTER_BASE_URL =
  process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
```

### 6. Benefits of OpenRouter Integration

#### Model Flexibility

- **Anthropic Models**: Claude 3 Sonnet, Haiku for different performance/cost trade-offs
- **OpenAI Models**: GPT-4o, GPT-4o-mini for familiar performance
- **Open Source Models**: Llama, Mistral for cost-effective solutions
- **Google Models**: Gemini Pro for Google's latest capabilities

#### Cost Optimization

- Choose models based on cost per token
- Switch between models for different use cases
- Access to competitive pricing through OpenRouter

#### Performance Tuning

- Select models based on response speed requirements
- Choose models optimized for specific tasks
- A/B test different models easily

### 7. Migration Strategy

#### Backward Compatibility

- Keep existing OpenAI chat service as fallback
- Default to OpenAI if OpenRouter not configured
- Gradual migration path for existing users

#### Configuration Migration

```env
# Old configuration (still supported)
OPENAI_CHAT_API_KEY=your_key

# New configuration (recommended)
CHAT_API_PROVIDER=openrouter
OPENROUTER_API_KEY=your_key
OPENROUTER_MODEL=anthropic/claude-3-sonnet-20240229
```

### 8. Error Handling & Fallbacks

#### Graceful Degradation

- Fallback to OpenAI if OpenRouter fails
- Model fallback (e.g., Claude Sonnet → Haiku if quota exceeded)
- Clear error messages for configuration issues

#### Rate Limiting

- Respect OpenRouter rate limits
- Implement exponential backoff
- Queue management for high-volume scenarios

### 9. Documentation Updates

#### README.md Updates

- Document new environment variables
- Provide model selection guide
- Include OpenRouter setup instructions
- Add troubleshooting section

#### Configuration Examples

- Multiple configuration examples for different models
- Performance/cost comparison guide
- Model recommendation matrix

### 10. Testing Strategy

#### Unit Tests

- OpenRouter service functionality
- Chat service factory
- Configuration validation

#### Integration Tests

- End-to-end call flow with different models
- Fallback scenarios
- Error handling

## Implementation Priority

1. **Phase 1**: Create OpenRouter service and interface
2. **Phase 2**: Implement chat service factory
3. **Phase 3**: Update configuration and validation
4. **Phase 4**: Update handlers and integrate
5. **Phase 5**: Documentation and testing
6. **Phase 6**: Migration guide and examples

## Next Steps

1. Switch to Code mode to implement the OpenRouter integration
2. Start with creating the chat service interface
3. Implement OpenRouter service
4. Update configuration system
5. Test with different models
6. Update documentation

This integration will provide users with much more flexibility in choosing AI models while maintaining the existing functionality and providing a clear migration path.
