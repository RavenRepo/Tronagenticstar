/**
 * OpenAI Provider Implementation
 *
 * This module provides integration with OpenAI's GPT models and embeddings API.
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
  LLMUtils
} from './base.js';

interface OpenAIConfig extends LLMProviderConfig {
  organization?: string;
  project?: string;
}

interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIChatResponse {
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
    finish_reason: 'stop' | 'length' | 'content_filter' | 'tool_calls' | null;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIEmbeddingResponse {
  object: string;
  data: Array<{
    object: string;
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIModelsResponse {
  object: string;
  data: Array<{
    id: string;
    object: string;
    created: number;
    owned_by: string;
  }>;
}

export class OpenAIProvider extends BaseLLMProvider {
  private baseUrl: string;
  private apiKey: string;
  private organization?: string;
  private project?: string;

  constructor(config: OpenAIConfig) {
    super(config);

    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    this.apiKey = config.apiKey || '';
    this.organization = config.organization;
    this.project = config.project;

    if (!this.apiKey) {
      throw new LLMError(
        'OpenAI API key is required',
        'MISSING_API_KEY',
        'openai'
      );
    }
  }

  getProviderName(): string {
    return 'openai';
  }

  async completion(
    messages: LLMMessage[],
    options: LLMCompletionOptions = {}
  ): Promise<LLMCompletionResponse> {
    const startTime = Date.now();

    try {
      // Validate input
      LLMUtils.validateMessages(messages);

      // Convert to OpenAI format
      const openaiMessages: OpenAIChatMessage[] = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Prepare request
      const requestBody = {
        model: options.model || 'gpt-4o-mini',
        messages: openaiMessages,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 1000,
        top_p: options.topP,
        stop: options.stop,
        presence_penalty: options.presencePenalty,
        frequency_penalty: options.frequencyPenalty,
        stream: false // We'll implement streaming separately if needed
      };

      // Remove undefined values
      Object.keys(requestBody).forEach(key =>
        requestBody[key as keyof typeof requestBody] === undefined &&
        delete requestBody[key as keyof typeof requestBody]
      );

      const response = await this.retryRequest(async () => {
        return await this.makeRequest<OpenAIChatResponse>(
          '/chat/completions',
          'POST',
          requestBody
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
          totalTokens: response.usage.total_tokens
        },
        model: response.model,
        metadata: {
          id: response.id,
          created: response.created
        }
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.updateMetrics(responseTime, 0, errorMessage);
      throw this.handleError(error);
    }
  }

  async embedding(text: string, model: string = 'text-embedding-ada-002'): Promise<LLMEmbeddingResponse> {
    const startTime = Date.now();

    try {
      const requestBody = {
        model,
        input: text,
        encoding_format: 'float'
      };

      const response = await this.retryRequest(async () => {
        return await this.makeRequest<OpenAIEmbeddingResponse>(
          '/embeddings',
          'POST',
          requestBody
        );
      });

      const responseTime = Date.now() - startTime;
      this.updateMetrics(responseTime, response.usage.total_tokens);

      return {
        embedding: response.data[0].embedding,
        model: response.model,
        usage: {
          promptTokens: response.usage.prompt_tokens,
          totalTokens: response.usage.total_tokens
        }
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.updateMetrics(responseTime, 0, errorMessage);
      throw this.handleError(error);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.makeRequest<OpenAIModelsResponse>('/models', 'GET');
      return response.object === 'list' && Array.isArray(response.data);
    } catch (error) {
      return false;
    }
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await this.makeRequest<OpenAIModelsResponse>('/models', 'GET');
      return response.data
        .map(model => model.id)
        .filter(id => id.startsWith('gpt-') || id.includes('text-embedding'))
        .sort();
    } catch (error) {
      throw this.handleError(error);
    }
  }

  private async makeRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' = 'GET',
    body?: any
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Constella/1.0.0'
    };

    if (this.organization) {
      headers['OpenAI-Organization'] = this.organization;
    }

    if (this.project) {
      headers['OpenAI-Project'] = this.project;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.config.timeout || 30000);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`HTTP ${response.status}: ${errorData.error?.message || response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private mapFinishReason(reason: string | null): LLMCompletionResponse['finishReason'] {
    switch (reason) {
      case 'stop': return 'stop';
      case 'length': return 'length';
      case 'content_filter': return 'content_filter';
      case 'tool_calls': return 'tool_calls';
      default: return 'stop';
    }
  }

  private handleError(error: any): LLMError {
    if (error instanceof LLMError) {
      return error;
    }

    const message = error?.message || String(error);

    // Check for specific OpenAI error patterns
    if (message.includes('401') || message.includes('authentication')) {
      return new LLMAuthenticationError('openai');
    }

    if (message.includes('429') || message.includes('rate limit')) {
      const retryAfter = this.extractRetryAfter(message);
      return new LLMRateLimitError('openai', retryAfter);
    }

    if (message.includes('404') || message.includes('model not found')) {
      return new LLMModelNotFoundError('openai', 'unknown');
    }

    return new LLMError(
      `OpenAI API error: ${message}`,
      'API_ERROR',
      'openai',
      error instanceof Error ? error : undefined
    );
  }

  private extractRetryAfter(message: string): number | undefined {
    const match = message.match(/retry after (\d+)/i);
    return match ? parseInt(match[1]) : undefined;
  }
}

/**
 * Factory function for creating OpenAI provider instances
 */
export function createOpenAIProvider(config: OpenAIConfig): OpenAIProvider {
  return new OpenAIProvider(config);
}

/**
 * Default OpenAI models configuration
 */
export const OPENAI_MODELS = {
  // Chat models
  GPT4_TURBO: 'gpt-4-1106-preview',
  GPT4: 'gpt-4',
  GPT4_32K: 'gpt-4-32k',
  GPT35_TURBO: 'gpt-3.5-turbo',
  GPT35_TURBO_16K: 'gpt-3.5-turbo-16k',
  GPT4O_MINI: 'gpt-4o-mini',
  GPT4O: 'gpt-4o',

  // Embedding models
  ADA_002: 'text-embedding-ada-002',
  ADA_003_SMALL: 'text-embedding-3-small',
  ADA_003_LARGE: 'text-embedding-3-large'
} as const;

/**
 * Model capabilities and pricing information
 */
export const OPENAI_MODEL_INFO = {
  [OPENAI_MODELS.GPT4O_MINI]: {
    contextWindow: 128000,
    outputTokens: 16384,
    costPer1KTokens: { input: 0.00015, output: 0.0006 }
  },
  [OPENAI_MODELS.GPT4O]: {
    contextWindow: 128000,
    outputTokens: 4096,
    costPer1KTokens: { input: 0.005, output: 0.015 }
  },
  [OPENAI_MODELS.GPT35_TURBO]: {
    contextWindow: 16385,
    outputTokens: 4096,
    costPer1KTokens: { input: 0.0005, output: 0.0015 }
  },
  [OPENAI_MODELS.ADA_002]: {
    contextWindow: 8191,
    dimensions: 1536,
    costPer1KTokens: { input: 0.0001 }
  }
} as const;
