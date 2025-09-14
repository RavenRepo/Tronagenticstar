/**
 * OpenRouter Provider Implementation
 *
 * This module provides integration with OpenRouter's API for access to multiple AI models.
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

interface OpenRouterConfig extends LLMProviderConfig {
  siteName?: string;
  siteUrl?: string;
}

interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenRouterRequest {
  model: string;
  messages: OpenRouterMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  repetition_penalty?: number;
  stop?: string[];
  stream?: boolean;
}

interface OpenRouterResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: "stop" | "length" | "content_filter" | "tool_calls" | null;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenRouterModelsResponse {
  data: Array<{
    id: string;
    object: string;
    created: number;
    owned_by: string;
    pricing: {
      prompt: string;
      completion: string;
    };
    context_length: number;
    architecture: {
      modality: string;
      tokenizer: string;
      instruct_type?: string;
    };
    top_provider: {
      max_completion_tokens?: number;
      is_moderated: boolean;
    };
    per_request_limits?: {
      prompt_tokens: string;
      completion_tokens: string;
    };
  }>;
}

export class OpenRouterProvider extends BaseLLMProvider {
  private baseUrl: string;
  private apiKey: string;
  private siteName: string;
  private siteUrl: string;

  constructor(config: OpenRouterConfig) {
    super(config);

    this.apiKey = config.apiKey || "";
    this.baseUrl = "https://openrouter.ai/api/v1";
    this.siteName = config.siteName || "Constella";
    this.siteUrl = config.siteUrl || "https://constella.ai";

    if (!this.apiKey) {
      throw new LLMError(
        "OpenRouter API key is required",
        "MISSING_API_KEY",
        "openrouter",
      );
    }
  }

  getProviderName(): string {
    return "openrouter";
  }

  async completion(
    messages: LLMMessage[],
    options: LLMCompletionOptions = {},
  ): Promise<LLMCompletionResponse> {
    const startTime = Date.now();

    try {
      // Validate input
      LLMUtils.validateMessages(messages);

      // Convert to OpenRouter format (same as OpenAI)
      const openRouterMessages: OpenRouterMessage[] = messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      // Prepare request
      const requestBody: OpenRouterRequest = {
        model: options.model || "anthropic/claude-3-haiku",
        messages: openRouterMessages,
        max_tokens: options.maxTokens || 1000,
        temperature: options.temperature || 0.7,
        top_p: options.topP,
        top_k: options.topK as number,
        frequency_penalty: options.frequencyPenalty,
        presence_penalty: options.presencePenalty,
        stop: options.stop,
        stream: false,
      };

      // Remove undefined values
      Object.keys(requestBody).forEach((key) =>
        requestBody[key as keyof typeof requestBody] === undefined &&
        delete requestBody[key as keyof typeof requestBody],
      );

      const response = await this.retryRequest(async () => {
        return await this.makeRequest<OpenRouterResponse>(
          "/chat/completions",
          "POST",
          requestBody,
        );
      });

      const responseTime = Date.now() - startTime;
      this.updateMetrics(responseTime, response.usage.total_tokens);

      return {
        content: response.choices[0].message.content,
        finishReason: this.mapFinishReason(response.choices[0].finish_reason),
        usage: {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        },
        model: response.model,
        metadata: {
          id: response.id,
          created: response.created,
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
    model: string = "text-embedding-ada-002",
  ): Promise<LLMEmbeddingResponse> {
    const startTime = Date.now();

    try {
      const requestBody = {
        model,
        input: text,
      };

      const response = await this.retryRequest(async () => {
        return await this.makeRequest(
          "/embeddings",
          "POST",
          requestBody,
        );
      });

      const responseTime = Date.now() - startTime;
      this.updateMetrics(responseTime, (response as any).usage?.total_tokens || text.length / 4);

      return {
        embedding: (response as any).data[0].embedding,
        model,
        usage: {
          promptTokens: (response as any).usage?.prompt_tokens || Math.ceil(text.length / 4),
          totalTokens: (response as any).usage?.total_tokens || Math.ceil(text.length / 4),
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

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.makeRequest<OpenRouterModelsResponse>("/models", "GET");
      return response.data && Array.isArray(response.data);
    } catch (error) {
      return false;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await this.makeRequest<OpenRouterModelsResponse>("/models", "GET");
      return response.data.map((model) => model.id).sort();
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private async makeRequest<T>(
    endpoint: string,
    method: "GET" | "POST" = "GET",
    body?: any,
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      "Authorization": `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "Constella/1.0.0",
      "HTTP-Referer": this.siteUrl,
      "X-Title": this.siteName,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.config.timeout || 30000);

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
      case "stop":
        return "stop";
      case "length":
        return "length";
      case "content_filter":
        return "content_filter";
      case "tool_calls":
        return "tool_calls";
      default:
        return "stop";
    }
  }

  private handleError(error: any): LLMError {
    if (error instanceof LLMError) {
      return error;
    }

    const message = error?.message || String(error);

    // Check for specific OpenRouter error patterns
    if (message.includes("401") || message.includes("authentication")) {
      return new LLMAuthenticationError("openrouter");
    }

    if (message.includes("429") || message.includes("rate limit")) {
      const retryAfter = this.extractRetryAfter(message);
      return new LLMRateLimitError("openrouter", retryAfter);
    }

    if (message.includes("404") || message.includes("model not found")) {
      return new LLMModelNotFoundError("openrouter", "unknown");
    }

    return new LLMError(
      `OpenRouter API error: ${message}`,
      "API_ERROR",
      "openrouter",
      error instanceof Error ? error : undefined,
    );
  }

  private extractRetryAfter(message: string): number | undefined {
    const match = message.match(/retry after (\d+)/i);
    return match ? parseInt(match[1]) : undefined;
  }
}

/**
 * Factory function for creating OpenRouter provider instances
 */
export function createOpenRouterProvider(config: OpenRouterConfig): OpenRouterProvider {
  return new OpenRouterProvider(config);
}

/**
 * Popular OpenRouter models configuration
 */
export const OPENROUTER_MODELS = {
  // Anthropic Claude models via OpenRouter
  CLAUDE_3_OPUS: "anthropic/claude-3-opus",
  CLAUDE_3_SONNET: "anthropic/claude-3-sonnet",
  CLAUDE_3_HAIKU: "anthropic/claude-3-haiku",

  // OpenAI models via OpenRouter
  GPT_4_TURBO: "openai/gpt-4-turbo-preview",
  GPT_4: "openai/gpt-4",
  GPT_35_TURBO: "openai/gpt-3.5-turbo",

  // Google models via OpenRouter
  GEMINI_PRO: "google/gemini-pro",
  GEMINI_PRO_VISION: "google/gemini-pro-vision",

  // Meta models via OpenRouter
  LLAMA_2_70B: "meta-llama/llama-2-70b-chat",
  CODELLAMA_34B: "codellama/codellama-34b-instruct",

  // Mistral models via OpenRouter
  MISTRAL_7B: "mistralai/mistral-7b-instruct",
  MIXTRAL_8X7B: "mistralai/mixtral-8x7b-instruct",

  // Other popular models
  PERPLEXITY_LLAMA: "perplexity/pplx-70b-online",
  NOUS_HERMES: "nousresearch/nous-hermes-llama2-13b",
} as const;

/**
 * Model capabilities and approximate pricing information
 * Note: OpenRouter pricing is dynamic, these are estimates
 */
export const OPENROUTER_MODEL_INFO = {
  [OPENROUTER_MODELS.CLAUDE_3_OPUS]: {
    contextWindow: 200000,
    outputTokens: 4096,
    costPer1KTokens: { input: 0.015, output: 0.075 },
  },
  [OPENROUTER_MODELS.CLAUDE_3_SONNET]: {
    contextWindow: 200000,
    outputTokens: 4096,
    costPer1KTokens: { input: 0.003, output: 0.015 },
  },
  [OPENROUTER_MODELS.CLAUDE_3_HAIKU]: {
    contextWindow: 200000,
    outputTokens: 4096,
    costPer1KTokens: { input: 0.00025, output: 0.00125 },
  },
  [OPENROUTER_MODELS.GPT_4_TURBO]: {
    contextWindow: 128000,
    outputTokens: 4096,
    costPer1KTokens: { input: 0.01, output: 0.03 },
  },
  [OPENROUTER_MODELS.GEMINI_PRO]: {
    contextWindow: 32768,
    outputTokens: 2048,
    costPer1KTokens: { input: 0.000125, output: 0.000375 },
  },
  [OPENROUTER_MODELS.MIXTRAL_8X7B]: {
    contextWindow: 32768,
    outputTokens: 4096,
    costPer1KTokens: { input: 0.00024, output: 0.00024 },
  },
} as const;
