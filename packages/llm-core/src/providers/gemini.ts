/**
 * Gemini Provider Implementation
 *
 * This module provides integration with Google's Gemini AI API.
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

interface GeminiConfig extends LLMProviderConfig {
  projectId?: string;
  location?: string;
}

interface GeminiMessage {
  role: "user" | "model";
  parts: Array<{ text: string }>;
}

interface GeminiRequest {
  contents: GeminiMessage[];
  generationConfig?: {
    temperature?: number;
    topP?: number;
    topK?: number;
    candidateCount?: number;
    maxOutputTokens?: number;
    stopSequences?: string[];
  };
  safetySettings?: Array<{
    category: string;
    threshold: string;
  }>;
}

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>;
      role: string;
    };
    finishReason: string;
    index: number;
    safetyRatings: Array<{
      category: string;
      probability: string;
    }>;
  }>;
  promptFeedback?: {
    safetyRatings: Array<{
      category: string;
      probability: string;
    }>;
    blockReason?: string;
  };
  usageMetadata?: {
    promptTokenCount: number;
    candidatesTokenCount: number;
    totalTokenCount: number;
  };
}

export class GeminiProvider extends BaseLLMProvider {
  private baseUrl: string;
  private apiKey: string;
  private projectId?: string;
  private location: string;

  constructor(config: GeminiConfig) {
    super(config);

    this.apiKey = config.apiKey || "";
    this.projectId = config.projectId;
    this.location = config.location || "us-central1";

    // Use the Gemini REST API directly
    this.baseUrl = "https://generativelanguage.googleapis.com/v1beta";

    if (!this.apiKey) {
      throw new LLMError(
        "Gemini API key is required",
        "MISSING_API_KEY",
        "gemini",
      );
    }
  }

  getProviderName(): string {
    return "gemini";
  }

  async completion(
    messages: LLMMessage[],
    options: LLMCompletionOptions = {},
  ): Promise<LLMCompletionResponse> {
    const startTime = Date.now();

    try {
      // Validate input
      LLMUtils.validateMessages(messages);

      // Convert to Gemini format
      const geminiMessages = this.convertMessages(messages);

      // Prepare request
      const model = options.model || "gemini-1.5-flash";
      const requestBody: GeminiRequest = {
        contents: geminiMessages,
        generationConfig: {
          temperature: options.temperature || 0.7,
          topP: options.topP || 0.95,
          topK: 40,
          candidateCount: 1,
          maxOutputTokens: options.maxTokens || 1000,
          stopSequences: options.stop,
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_MEDIUM_AND_ABOVE",
          },
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE",
          },
          {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE",
          },
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE",
          },
        ],
      };

      const response = await this.retryRequest(async () => {
        return await this.makeRequest<GeminiResponse>(
          `/models/${model}:generateContent`,
          "POST",
          requestBody,
        );
      });

      const responseTime = Date.now() - startTime;
      const usage = response.usageMetadata || {
        promptTokenCount: 0,
        candidatesTokenCount: 0,
        totalTokenCount: 0,
      };

      this.updateMetrics(responseTime, usage.totalTokenCount);

      if (!response.candidates || response.candidates.length === 0) {
        throw new LLMError(
          "No response candidates from Gemini",
          "NO_CANDIDATES",
          "gemini",
        );
      }

      const candidate = response.candidates[0];
      const content = candidate.content.parts.map((part) => part.text).join("");

      return {
        content,
        finishReason: this.mapFinishReason(candidate.finishReason),
        usage: {
          promptTokens: usage.promptTokenCount,
          completionTokens: usage.candidatesTokenCount,
          totalTokens: usage.totalTokenCount,
        },
        model,
        metadata: {
          safetyRatings: candidate.safetyRatings,
          promptFeedback: response.promptFeedback,
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
    model: string = "embedding-001",
  ): Promise<LLMEmbeddingResponse> {
    const startTime = Date.now();

    try {
      const requestBody = {
        model: `models/${model}`,
        content: {
          parts: [{ text }],
        },
      };

      const response = await this.retryRequest(async () => {
        return await this.makeRequest(
          "/models/embedding-001:embedContent",
          "POST",
          requestBody,
        );
      });

      const responseTime = Date.now() - startTime;
      this.updateMetrics(responseTime, text.length / 4); // Rough token estimate

      return {
        embedding: (response as any).embedding.values,
        model,
        usage: {
          promptTokens: Math.ceil(text.length / 4),
          totalTokens: Math.ceil(text.length / 4),
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
      const response = await this.makeRequest("/models", "GET");
      return (
        (response as any).models && Array.isArray((response as any).models)
      );
    } catch (error) {
      return false;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await this.makeRequest("/models", "GET");
      return (response as any).models
        .map((model: any) => model.name.replace("models/", ""))
        .filter((name: string) => name.startsWith("gemini-"))
        .sort();
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private convertMessages(messages: LLMMessage[]): GeminiMessage[] {
    const geminiMessages: GeminiMessage[] = [];

    for (const message of messages) {
      if (message.role === "system") {
        // Gemini doesn't have a system role, so we prepend it to the first user message
        const nextUserIndex = geminiMessages.findIndex(
          (m) => m.role === "user",
        );
        const systemText = `System instructions: ${message.content}\n\n`;

        if (nextUserIndex >= 0) {
          geminiMessages[nextUserIndex].parts[0].text =
            systemText + geminiMessages[nextUserIndex].parts[0].text;
        } else {
          // If no user message yet, we'll add it to the next user message when it comes
          geminiMessages.push({
            role: "user",
            parts: [
              {
                text:
                  systemText + "Please acknowledge these system instructions.",
              },
            ],
          });
        }
      } else {
        geminiMessages.push({
          role: message.role === "user" ? "user" : "model",
          parts: [{ text: message.content }],
        });
      }
    }

    return geminiMessages;
  }

  private async makeRequest<T>(
    endpoint: string,
    method: "GET" | "POST" = "GET",
    body?: any,
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}?key=${this.apiKey}`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "Constella/1.0.0",
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
    reason: string,
  ): LLMCompletionResponse["finishReason"] {
    switch (reason) {
      case "STOP":
        return "stop";
      case "MAX_TOKENS":
        return "length";
      case "SAFETY":
        return "content_filter";
      case "RECITATION":
        return "content_filter";
      case "OTHER":
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

    // Check for specific Gemini error patterns
    if (message.includes("403") || message.includes("API_KEY_INVALID")) {
      return new LLMAuthenticationError("gemini");
    }

    if (message.includes("429") || message.includes("RATE_LIMIT_EXCEEDED")) {
      const retryAfter = this.extractRetryAfter(message);
      return new LLMRateLimitError("gemini", retryAfter);
    }

    if (message.includes("404") || message.includes("MODEL_NOT_FOUND")) {
      return new LLMModelNotFoundError("gemini", "unknown");
    }

    return new LLMError(
      `Gemini API error: ${message}`,
      "API_ERROR",
      "gemini",
      error instanceof Error ? error : undefined,
    );
  }

  private extractRetryAfter(message: string): number | undefined {
    const match = message.match(/retry after (\d+)/i);
    return match ? parseInt(match[1]) : undefined;
  }
}

/**
 * Factory function for creating Gemini provider instances
 */
export function createGeminiProvider(config: GeminiConfig): GeminiProvider {
  return new GeminiProvider(config);
}

/**
 * Default Gemini models configuration
 */
export const GEMINI_MODELS = {
  // Chat models
  GEMINI_15_PRO: "gemini-1.5-pro",
  GEMINI_15_FLASH: "gemini-1.5-flash",
  GEMINI_10_PRO: "gemini-1.0-pro",

  // Embedding models
  EMBEDDING_001: "embedding-001",
} as const;

/**
 * Model capabilities and pricing information
 */
export const GEMINI_MODEL_INFO = {
  [GEMINI_MODELS.GEMINI_15_PRO]: {
    contextWindow: 1048576, // 1M tokens
    outputTokens: 8192,
    costPer1KTokens: { input: 0.00125, output: 0.00375 },
  },
  [GEMINI_MODELS.GEMINI_15_FLASH]: {
    contextWindow: 1048576, // 1M tokens
    outputTokens: 8192,
    costPer1KTokens: { input: 0.000075, output: 0.0003 },
  },
  [GEMINI_MODELS.GEMINI_10_PRO]: {
    contextWindow: 32768,
    outputTokens: 2048,
    costPer1KTokens: { input: 0.0005, output: 0.0015 },
  },
  [GEMINI_MODELS.EMBEDDING_001]: {
    contextWindow: 2048,
    dimensions: 768,
    costPer1KTokens: { input: 0.0000125 },
  },
} as const;
