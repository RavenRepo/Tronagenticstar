/**
 * Constella BeeAI Framework - ChatModel (LLM Provider System)
 *
 * Implements BeeAI's ChatModel pattern for provider-agnostic LLM integration.
 * Supports multiple providers with seamless switching and consistent interfaces.
 */

import { EventEmitter } from 'eventemitter3';
import {
  LLMProvider,
  LLMMessage,
  LLMResponse,
  LLMConfig,
  FrameworkError,
  LLMProviderError,
  LLMProviderUnavailableError,
  LLMProviderRateLimitError,
  JSONObject,
  UUID,
  Timestamp
} from '../types';

// ============================================================================
// PROVIDER CONFIGURATION TYPES
// ============================================================================

export interface ProviderConfig {
  name: string;
  type: 'openai' | 'ollama' | 'anthropic' | 'google' | 'azure' | 'huggingface';
  base_url?: string;
  api_key?: string;
  organization?: string;
  default_model?: string;
  timeout_ms?: number;
  max_retries?: number;
  rate_limit?: {
    requests_per_minute: number;
    tokens_per_minute: number;
  };
  headers?: Record<string, string>;
  proxy?: string;
}

export interface ModelInfo {
  id: string;
  object: string;
  created: number;
  owned_by: string;
  capabilities: string[];
  context_window: number;
  max_tokens: number;
  pricing?: {
    input_tokens_per_dollar: number;
    output_tokens_per_dollar: number;
  };
}

// ============================================================================
// CHAT MODEL CLASS (BeeAI Pattern)
// ============================================================================

export class ChatModel extends EventEmitter {
  private static readonly instances: Map<string, ChatModel> = new Map();
  private static readonly providers: Map<string, LLMProvider> = new Map();

  private readonly provider: LLMProvider;
  private readonly config: LLMConfig;
  private readonly providerConfig: ProviderConfig;
  private readonly callHistory: Array<{
    timestamp: Timestamp;
    model: string;
    tokens: number;
    cost?: number;
  }> = [];

  private constructor(provider: LLMProvider, config: LLMConfig, providerConfig: ProviderConfig) {
    super();
    this.provider = provider;
    this.config = config;
    this.providerConfig = providerConfig;
  }

  // ============================================================================
  // STATIC FACTORY METHODS (BeeAI Pattern)
  // ============================================================================

  /**
   * Create ChatModel from provider name and model (BeeAI style)
   * Examples: "openai:gpt-4", "ollama:granite3.3:8b", "anthropic:claude-3"
   */
  public static fromName(nameWithModel: string, config?: Partial<LLMConfig>): ChatModel {
    const [providerName, ...modelParts] = nameWithModel.split(':');
    const model = modelParts.join(':');

    if (!providerName || !model) {
      throw new FrameworkError(
        `Invalid model name format. Expected "provider:model", got "${nameWithModel}"`,
        'INVALID_MODEL_NAME'
      );
    }

    const cacheKey = `${providerName}:${model}:${JSON.stringify(config || {})}`;

    if (this.instances.has(cacheKey)) {
      return this.instances.get(cacheKey)!;
    }

    const provider = this.getOrCreateProvider(providerName);
    const fullConfig: LLMConfig = {
      model,
      temperature: 0.7,
      max_tokens: 2048,
      timeout: 30000,
      ...config
    };

    const providerConfig = this.getProviderConfig(providerName);
    const instance = new ChatModel(provider, fullConfig, providerConfig);

    this.instances.set(cacheKey, instance);
    return instance;
  }

  /**
   * Register a custom provider
   */
  public static registerProvider(name: string, provider: LLMProvider): void {
    this.providers.set(name, provider);
  }

  /**
   * Get available providers
   */
  public static getProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Clear provider cache (useful for testing)
   */
  public static clearCache(): void {
    this.instances.clear();
  }

  // ============================================================================
  // PUBLIC INTERFACE
  // ============================================================================

  /**
   * Generate completion from messages
   */
  public async generate(
    messages: LLMMessage[],
    overrideConfig?: Partial<LLMConfig>
  ): Promise<LLMResponse> {
    const startTime = Date.now();
    const finalConfig = { ...this.config, ...overrideConfig };

    try {
      // Validate messages
      this.validateMessages(messages);

      // Check rate limits
      await this.checkRateLimits();

      // Generate response
      const response = await this.provider.generate(messages, finalConfig);

      // Track usage
      this.trackUsage(response, Date.now() - startTime);

      // Emit success event
      this.emit('generation.completed', {
        model: finalConfig.model,
        messages_count: messages.length,
        tokens_used: response.usage?.total_tokens || 0,
        duration_ms: Date.now() - startTime
      });

      return response;

    } catch (error) {
      this.handleGenerationError(error, messages, finalConfig, Date.now() - startTime);
      throw error;
    }
  }

  /**
   * Generate streaming completion
   */
  public async *generateStream(
    messages: LLMMessage[],
    overrideConfig?: Partial<LLMConfig>
  ): AsyncGenerator<LLMResponse> {
    const finalConfig = { ...this.config, ...overrideConfig, stream: true };

    if (!this.provider.generateStream) {
      throw new LLMProviderError(
        'Streaming not supported by this provider',
        this.provider.name,
        finalConfig.model
      );
    }

    try {
      this.validateMessages(messages);
      await this.checkRateLimits();

      for await (const chunk of this.provider.generateStream(messages, finalConfig)) {
        yield chunk;
      }

    } catch (error) {
      this.handleGenerationError(error, messages, finalConfig, 0);
      throw error;
    }
  }

  /**
   * Check if the provider/model is available
   */
  public async isAvailable(): Promise<boolean> {
    try {
      return await this.provider.isAvailable();
    } catch {
      return false;
    }
  }

  /**
   * Get available models for this provider
   */
  public async getModels(): Promise<string[]> {
    try {
      return await this.provider.getModels();
    } catch (error) {
      throw new LLMProviderError(
        `Failed to get models: ${error instanceof Error ? error.message : String(error)}`,
        this.provider.name
      );
    }
  }

  /**
   * Get model information
   */
  public getModelInfo(): ModelInfo {
    return {
      id: this.config.model!,
      object: 'model',
      created: Date.now(),
      owned_by: this.provider.name,
      capabilities: this.getCapabilities(),
      context_window: this.getContextWindow(),
      max_tokens: this.config.max_tokens || 2048,
      pricing: this.getPricingInfo()
    };
  }

  /**
   * Get usage statistics
   */
  public getUsageStats(): {
    total_calls: number;
    total_tokens: number;
    total_cost: number;
    average_latency_ms: number;
    last_24h_calls: number;
    error_rate: number;
  } {
    const now = Date.now();
    const last24h = now - (24 * 60 * 60 * 1000);

    const recentCalls = this.callHistory.filter(call =>
      new Date(call.timestamp).getTime() > last24h
    );

    const totalTokens = this.callHistory.reduce((sum, call) => sum + call.tokens, 0);
    const totalCost = this.callHistory.reduce((sum, call) => sum + (call.cost || 0), 0);

    return {
      total_calls: this.callHistory.length,
      total_tokens: totalTokens,
      total_cost: totalCost,
      average_latency_ms: 0, // Would need to track this separately
      last_24h_calls: recentCalls.length,
      error_rate: 0 // Would need to track errors separately
    };
  }

  /**
   * Estimate cost for a generation request
   */
  public estimateCost(messages: LLMMessage[], maxTokens?: number): number {
    const inputTokens = this.estimateTokens(messages);
    const outputTokens = maxTokens || this.config.max_tokens || 1000;

    const pricing = this.getPricingInfo();
    if (!pricing) return 0;

    const inputCost = inputTokens / pricing.input_tokens_per_dollar;
    const outputCost = outputTokens / pricing.output_tokens_per_dollar;

    return inputCost + outputCost;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private static getOrCreateProvider(providerName: string): LLMProvider {
    if (this.providers.has(providerName)) {
      return this.providers.get(providerName)!;
    }

    // Create provider based on name
    const provider = this.createProvider(providerName);
    this.providers.set(providerName, provider);
    return provider;
  }

  private static createProvider(providerName: string): LLMProvider {
    const config = this.getProviderConfig(providerName);

    switch (config.type) {
      case 'openai':
        return new OpenAIProvider(config);
      case 'ollama':
        return new OllamaProvider(config);
      case 'anthropic':
        return new AnthropicProvider(config);
      default:
        throw new FrameworkError(
          `Unsupported provider type: ${config.type}`,
          'UNSUPPORTED_PROVIDER'
        );
    }
  }

  private static getProviderConfig(providerName: string): ProviderConfig {
    // In a real implementation, this would load from environment variables or config files
    const envPrefix = providerName.toUpperCase();

    return {
      name: providerName,
      type: providerName as any,
      base_url: process.env[`${envPrefix}_BASE_URL`],
      api_key: process.env[`${envPrefix}_API_KEY`],
      default_model: process.env[`${envPrefix}_DEFAULT_MODEL`],
      timeout_ms: parseInt(process.env[`${envPrefix}_TIMEOUT_MS`] || '30000'),
      max_retries: parseInt(process.env[`${envPrefix}_MAX_RETRIES`] || '3')
    };
  }

  private validateMessages(messages: LLMMessage[]): void {
    if (!messages || messages.length === 0) {
      throw new FrameworkError('Messages array cannot be empty', 'INVALID_MESSAGES');
    }

    for (const [index, message] of messages.entries()) {
      if (!message.role || !message.content) {
        throw new FrameworkError(
          `Invalid message at index ${index}: role and content are required`,
          'INVALID_MESSAGE_FORMAT'
        );
      }

      if (!['system', 'user', 'assistant', 'tool'].includes(message.role)) {
        throw new FrameworkError(
          `Invalid role "${message.role}" at index ${index}`,
          'INVALID_MESSAGE_ROLE'
        );
      }
    }
  }

  private async checkRateLimits(): Promise<void> {
    if (!this.providerConfig.rate_limit) return;

    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    const recentCalls = this.callHistory.filter(call =>
      new Date(call.timestamp).getTime() > oneMinuteAgo
    );

    if (recentCalls.length >= this.providerConfig.rate_limit.requests_per_minute) {
      throw new LLMProviderRateLimitError(
        this.provider.name,
        60, // retry after 60 seconds
        this.config.model
      );
    }
  }

  private trackUsage(response: LLMResponse, durationMs: number): void {
    const usage = response.usage;
    if (!usage) return;

    const cost = this.calculateCost(usage.total_tokens, usage.prompt_tokens, usage.completion_tokens);

    this.callHistory.push({
      timestamp: new Date().toISOString(),
      model: this.config.model!,
      tokens: usage.total_tokens,
      cost
    });

    // Keep only last 1000 calls
    if (this.callHistory.length > 1000) {
      this.callHistory.splice(0, this.callHistory.length - 1000);
    }

    this.emit('usage.tracked', {
      model: this.config.model,
      tokens: usage.total_tokens,
      cost,
      duration_ms: durationMs
    });
  }

  private calculateCost(totalTokens: number, inputTokens: number, outputTokens: number): number {
    const pricing = this.getPricingInfo();
    if (!pricing) return 0;

    const inputCost = inputTokens / pricing.input_tokens_per_dollar;
    const outputCost = outputTokens / pricing.output_tokens_per_dollar;

    return inputCost + outputCost;
  }

  private handleGenerationError(
    error: unknown,
    messages: LLMMessage[],
    config: LLMConfig,
    durationMs: number
  ): void {
    this.emit('generation.error', {
      model: config.model,
      messages_count: messages.length,
      error: error instanceof Error ? error.message : String(error),
      duration_ms: durationMs
    });
  }

  private getCapabilities(): string[] {
    return [
      'text_generation',
      'conversation',
      'instruction_following'
    ];
  }

  private getContextWindow(): number {
    // Default context windows by model type
    const model = this.config.model || '';

    if (model.includes('gpt-4')) return 8192;
    if (model.includes('gpt-3.5')) return 4096;
    if (model.includes('claude')) return 100000;
    if (model.includes('granite')) return 8192;

    return 4096; // Default
  }

  private getPricingInfo(): { input_tokens_per_dollar: number; output_tokens_per_dollar: number } | undefined {
    // Simplified pricing - in production this would be more sophisticated
    const model = this.config.model || '';

    if (model.includes('gpt-4')) {
      return { input_tokens_per_dollar: 10000, output_tokens_per_dollar: 5000 };
    }
    if (model.includes('gpt-3.5')) {
      return { input_tokens_per_dollar: 500000, output_tokens_per_dollar: 250000 };
    }

    return undefined; // Free or unknown pricing
  }

  private estimateTokens(messages: LLMMessage[]): number {
    // Rough estimation - 4 characters per token
    return messages.reduce((total, message) => {
      return total + Math.ceil(message.content.length / 4);
    }, 0);
  }
}

// ============================================================================
// PROVIDER IMPLEMENTATIONS
// ============================================================================

class OpenAIProvider implements LLMProvider {
  public readonly name = 'openai';
  private readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async generate(messages: LLMMessage[], config?: LLMConfig): Promise<LLMResponse> {
    // Implementation would use OpenAI SDK
    throw new LLMProviderUnavailableError(this.name, config?.model);
  }

  async isAvailable(): Promise<boolean> {
    return !!this.config.api_key;
  }

  async getModels(): Promise<string[]> {
    return ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'];
  }
}

class OllamaProvider implements LLMProvider {
  public readonly name = 'ollama';
  private readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async generate(messages: LLMMessage[], config?: LLMConfig): Promise<LLMResponse> {
    // Implementation would use Ollama API
    throw new LLMProviderUnavailableError(this.name, config?.model);
  }

  async isAvailable(): Promise<boolean> {
    // Check if Ollama is running locally
    return true;
  }

  async getModels(): Promise<string[]> {
    return ['granite3.3:8b', 'llama2', 'codellama'];
  }
}

class AnthropicProvider implements LLMProvider {
  public readonly name = 'anthropic';
  private readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async generate(messages: LLMMessage[], config?: LLMConfig): Promise<LLMResponse> {
    // Implementation would use Anthropic SDK
    throw new LLMProviderUnavailableError(this.name, config?.model);
  }

  async isAvailable(): Promise<boolean> {
    return !!this.config.api_key;
  }

  async getModels(): Promise<string[]> {
    return ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'];
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export default ChatModel;
export { ProviderConfig, ModelInfo };
