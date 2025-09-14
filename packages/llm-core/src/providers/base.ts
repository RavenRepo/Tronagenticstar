/**
 * Base LLM Provider Abstraction
 *
 * This module defines the core interfaces and types for LLM providers in Constella.
 * All LLM integrations (OpenAI, Anthropic, local models) must implement these interfaces.
 */

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
  metadata?: Record<string, any>;
}

export interface LLMCompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  stream?: boolean;
  stop?: string[];
  presencePenalty?: number;
  frequencyPenalty?: number;
}

export interface LLMCompletionResponse {
  content: string;
  finishReason: "stop" | "length" | "content_filter" | "tool_calls" | "error";
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  metadata?: Record<string, any>;
}

export interface LLMEmbeddingResponse {
  embedding: number[];
  model: string;
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
}

export interface LLMProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  organization?: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

export interface LLMProviderMetrics {
  totalRequests: number;
  totalTokens: number;
  averageResponseTime: number;
  errorRate: number;
  lastError?: string;
}

/**
 * Abstract base class for all LLM providers
 */
export abstract class BaseLLMProvider {
  protected config: LLMProviderConfig;
  protected metrics: LLMProviderMetrics;

  constructor(config: LLMProviderConfig) {
    this.config = config;
    this.metrics = {
      totalRequests: 0,
      totalTokens: 0,
      averageResponseTime: 0,
      errorRate: 0,
    };
  }

  /**
   * Generate a completion from messages
   */
  abstract completion(
    messages: LLMMessage[],
    options?: LLMCompletionOptions,
  ): Promise<LLMCompletionResponse>;

  /**
   * Generate embeddings for text
   */
  abstract embedding(
    text: string,
    model?: string,
  ): Promise<LLMEmbeddingResponse>;

  /**
   * Check if the provider is healthy and responding
   */
  abstract healthCheck(): Promise<boolean>;

  /**
   * Get provider-specific model list
   */
  abstract getAvailableModels(): Promise<string[]>;

  /**
   * Get provider name
   */
  abstract getProviderName(): string;

  /**
   * Get current metrics
   */
  getMetrics(): LLMProviderMetrics {
    return { ...this.metrics };
  }

  /**
   * Update metrics after a request
   */
  protected updateMetrics(
    responseTime: number,
    tokens: number,
    error?: string,
  ): void {
    this.metrics.totalRequests++;
    this.metrics.totalTokens += tokens;

    // Calculate running average
    this.metrics.averageResponseTime =
      (this.metrics.averageResponseTime * (this.metrics.totalRequests - 1) +
        responseTime) /
      this.metrics.totalRequests;

    if (error) {
      this.metrics.errorRate =
        (this.metrics.errorRate * (this.metrics.totalRequests - 1) + 1) /
        this.metrics.totalRequests;
      this.metrics.lastError = error;
    } else {
      this.metrics.errorRate =
        (this.metrics.errorRate * (this.metrics.totalRequests - 1)) /
        this.metrics.totalRequests;
    }
  }

  /**
   * Retry logic for failed requests
   */
  protected async retryRequest<T>(
    requestFn: () => Promise<T>,
    maxAttempts: number = this.config.retryAttempts || 3,
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === maxAttempts) {
          break;
        }

        // Exponential backoff
        const delay =
          (this.config.retryDelay || 1000) * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }
}

/**
 * LLM Provider Factory interface
 */
export interface LLMProviderFactory {
  createProvider(type: string, config: LLMProviderConfig): BaseLLMProvider;
  getSupportedProviders(): string[];
}

/**
 * Standard error types for LLM operations
 */
export class LLMError extends Error {
  constructor(
    message: string,
    public code: string,
    public provider: string,
    public originalError?: Error,
  ) {
    super(message);
    this.name = "LLMError";
  }
}

export class LLMRateLimitError extends LLMError {
  constructor(provider: string, retryAfter?: number) {
    super(`Rate limit exceeded for ${provider}`, "RATE_LIMIT", provider);
    this.retryAfter = retryAfter;
  }

  retryAfter?: number;
}

export class LLMAuthenticationError extends LLMError {
  constructor(provider: string) {
    super(`Authentication failed for ${provider}`, "AUTH_ERROR", provider);
  }
}

export class LLMModelNotFoundError extends LLMError {
  constructor(provider: string, model: string) {
    super(
      `Model ${model} not found for ${provider}`,
      "MODEL_NOT_FOUND",
      provider,
    );
  }
}

/**
 * Utility functions for LLM operations
 */
export class LLMUtils {
  /**
   * Estimate token count for text (rough approximation)
   */
  static estimateTokenCount(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Truncate messages to fit within token limit
   */
  static truncateMessages(
    messages: LLMMessage[],
    maxTokens: number,
    reserveTokens: number = 100,
  ): LLMMessage[] {
    const targetTokens = maxTokens - reserveTokens;
    let currentTokens = 0;
    const result: LLMMessage[] = [];

    // Always include system message if present
    if (messages[0]?.role === "system") {
      result.push(messages[0]);
      currentTokens += this.estimateTokenCount(messages[0].content);
    }

    // Add messages from the end, working backwards
    for (
      let i = messages.length - 1;
      i >= (messages[0]?.role === "system" ? 1 : 0);
      i--
    ) {
      const messageTokens = this.estimateTokenCount(messages[i].content);

      if (currentTokens + messageTokens > targetTokens) {
        break;
      }

      result.unshift(messages[i]);
      currentTokens += messageTokens;
    }

    return result;
  }

  /**
   * Validate LLM messages array
   */
  static validateMessages(messages: LLMMessage[]): void {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error("Messages array must be non-empty");
    }

    for (const message of messages) {
      if (
        !message.role ||
        !["system", "user", "assistant"].includes(message.role)
      ) {
        throw new Error(`Invalid message role: ${message.role}`);
      }

      if (typeof message.content !== "string") {
        throw new Error("Message content must be a string");
      }
    }
  }
}
