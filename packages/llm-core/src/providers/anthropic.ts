/**
 * Anthropic Claude Provider Implementation
 *
 * This module provides integration with Anthropic's Claude AI API.
 * Implements the BaseLLMProvider interface for consistent usage across Constella.
 */

import {
  BaseLLMProvider,
  LLMMessage,
  LLMCompletionOptions,
  LLMCompletionResponse,
  LLMEmbeddingResponse,
  LLMProviderConfig,
  LLMError,
  LLMRateLimitError,
  LLMAuthenticationError,
  LLMModelNotFoundError,
  LLMUtils,
} from "./base.js";

interface AnthropicConfig extends LLMProviderConfig {
  version?: string;
}

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  max_tokens: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  system?: string;
  stream?: boolean;
}

interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  model: string;
  stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | null;
  stop_sequence?: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class AnthropicProvider extends BaseLLMProvider {
  private baseUrl: string;
  private apiKey: string;
  private version: string;

  constructor(config: AnthropicConfig) {
    super(config);

    this.apiKey = config.apiKey || "";
    this.version = config.version || "2023-06-01";
    this.baseUrl = "https://api.anthropic.com";

    if (!this.apiKey) {
      throw new LLMError(
        "Anthropic API key is required",
        "MISSING_API_KEY",
        "anthropic",
      );
    }
  }

  getProviderName(): string {
    return "anthropic";
  }

  async completion(
    messages: LLMMessage[],
    options: LLMCompletionOptions = {},
  ): Promise<LLMCompletionResponse> {
    const startTime = Date.now();

    try {
      // Validate input
      LLMUtils.validateMessages(messages);

      // Convert to Anthropic format
      const { anthropicMessages, system } = this.convertMessages(messages);

      // Prepare request
      const model = options.model || "claude-3-haiku-20240307";
      const requestBody: AnthropicRequest = {
        model,
        messages: anthropicMessages,
        max_tokens: options.maxTokens || 1000,
        temperature: options.temperature,
        top_p: options.topP,
        top_k: options.topK as number,
        stop_sequences: options.stop,
        stream: false,
      };

      // Add system message if present
      if (system) {
        requestBody.system = system;
      }

      // Remove undefined values
      Object.keys(requestBody).forEach((key) =>
        requestBody[key as keyof typeof requestBody] === undefined &&
        delete requestBody[key as keyof typeof requestBody],
      );

      const response = await this.retryRequest(async () => {
        return await this.makeRequest<AnthropicResponse>(
          "/v1/messages",
          "POST",
          requestBody,
        );
      });

      const responseTime = Date.now() - startTime;
      const totalTokens = response.usage.input_tokens + response.usage.output_tokens;
      this.updateMetrics(responseTime, totalTokens);

      const content = response.content
        .filter((item) => item.type === "text")
        .map((item) => item.text)
        .join("");

      return {
        content,
        finishReason: this.mapFinishReason(response.stop_reason),
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens,
        },
        model: response.model,
        metadata: {
          id: response.id,
          stopSequence: response.stop_sequence,
        },
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.updateMetrics(responseTime, 0, errorMessage);
      throw this.handleError(error);
    }
  }

  async embedding(
    text: string,
    model?: string,
  ): Promise<LLMEmbeddingResponse> {
    // Anthropic doesn't provide embedding endpoints directly
    // This would need to be implemented via a third-party service or different approach
    throw new LLMError(
      "Anthropic does not provide native embedding endpoints",
      "NOT_SUPPORTED",
      "anthropic",
    );
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Simple test message to check API connectivity
      const testMessages: AnthropicMessage[] = [
        { role: "user", content: "Hello" },
      ];

      const requestBody: AnthropicRequest = {
        model: "claude-3-haiku-20240307",
        messages: testMessages,
        max_tokens: 10,
      };

      const response = await this.makeRequest<AnthropicResponse>(
        "/v1/messages",
        "POST",
        requestBody,
      );

      return response.type === "message";
    } catch (error) {
      return false;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    // Anthropic doesn't provide a models endpoint, so we return known models
    return [
      "claude-3-opus-20240229",
      "claude-3-sonnet-20240229",
      "claude-3-haiku-20240307",
      "claude-2.1",
      "claude-2.0",
      "claude-instant-1.2",
    ];
  }

  private convertMessages(messages: LLMMessage[]): {
    anthropicMessages: AnthropicMessage[];
    system?: string;
  } {
    const anthropicMessages: AnthropicMessage[] = [];
    let system: string | undefined;

    for (const message of messages) {
      if (message.role === "system") {
        // Anthropic uses a separate system parameter
        system = message.content;
      } else if (message.role === "user" || message.role === "assistant") {
        anthropicMessages.push({
          role: message.role,
          content: message.content,
        });
      }
    }

    return { anthropicMessages, system };
  }

  private async makeRequest<T>(
    endpoint: string,
    method: "GET" | "POST" = "GET",
    body?: any,
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "Constella/1.0.0",
      "x-api-key": this.apiKey,
      "anthropic-version": this.version,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.config.timeout || 60000); // Anthropic can be slower

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : null,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `HTTP ${response.status}: ${errorData.error?.message || response.statusText}`,
        );
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private mapFinishReason(
    reason: string | null,
  ): LLMCompletionResponse["finishReason"] {
    switch (reason) {
      case "end_turn":
        return "stop";
      case "max_tokens":
        return "length";
      case "stop_sequence":
        return "stop";
      default:
        return "stop";
    }
  }

  private handleError(error: any): LLMError {
    if (error instanceof LLMError) {
      return error;
    }

    const message = error?.message || String(error);

    // Check for specific Anthropic error patterns
    if (message.includes("401") || message.includes("authentication")) {
      return new LLMAuthenticationError("anthropic");
    }

    if (message.includes("429") || message.includes("rate limit")) {
      const retryAfter = this.extractRetryAfter(message);
      return new LLMRateLimitError("anthropic", retryAfter);
    }

    if (message.includes("404") || message.includes("model not found")) {
      return new LLMModelNotFoundError("anthropic", "unknown");
    }

    return new LLMError(
      `Anthropic API error: ${message}`,
      "API_ERROR",
      "anthropic",
      error instanceof Error ? error : undefined,
    );
  }

  private extractRetryAfter(message: string): number | undefined {
    const match = message.match(/retry after (\d+)/i);
    return match ? parseInt(match[1]) : undefined;
  }
}

/**
 * Factory function for creating Anthropic provider instances
 */
export function createAnthropicProvider(config: AnthropicConfig): AnthropicProvider {
  return new AnthropicProvider(config);
}

/**
 * Default Anthropic models configuration
 */
export const ANTHROPIC_MODELS = {
  // Claude 3 models (latest)
  CLAUDE_3_OPUS: "claude-3-opus-20240229",
  CLAUDE_3_SONNET: "claude-3-sonnet-20240229",
  CLAUDE_3_HAIKU: "claude-3-haiku-20240307",

  // Claude 2 models
  CLAUDE_2_1: "claude-2.1",
  CLAUDE_2_0: "claude-2.0",

  // Claude Instant
  CLAUDE_INSTANT_1_2: "claude-instant-1.2",
} as const;

/**
 * Model capabilities and pricing information
 */
export const ANTHROPIC_MODEL_INFO = {
  [ANTHROPIC_MODELS.CLAUDE_3_OPUS]: {
    contextWindow: 200000,
    outputTokens: 4096,
    costPer1KTokens: { input: 0.015, output: 0.075 },
  },
  [ANTHROPIC_MODELS.CLAUDE_3_SONNET]: {
    contextWindow: 200000,
    outputTokens: 4096,
    costPer1KTokens: { input: 0.003, output: 0.015 },
  },
  [ANTHROPIC_MODELS.CLAUDE_3_HAIKU]: {
    contextWindow: 200000,
    outputTokens: 4096,
    costPer1KTokens: { input: 0.00025, output: 0.00125 },
  },
  [ANTHROPIC_MODELS.CLAUDE_2_1]: {
    contextWindow: 200000,
    outputTokens: 4096,
    costPer1KTokens: { input: 0.008, output: 0.024 },
  },
  [ANTHROPIC_MODELS.CLAUDE_2_0]: {
    contextWindow: 100000,
    outputTokens: 4096,
    costPer1KTokens: { input: 0.008, output: 0.024 },
  },
  [ANTHROPIC_MODELS.CLAUDE_INSTANT_1_2]: {
    contextWindow: 100000,
    outputTokens: 4096,
    costPer1KTokens: { input: 0.0008, output: 0.0024 },
  },
} as const;
