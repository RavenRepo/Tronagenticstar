/**
 * LLM Manager - Central coordinator for all LLM operations in Constella
 *
 * This module provides intelligent routing, fallback handling, and unified
 * access to multiple LLM providers. It handles provider selection based on
 * task requirements, cost optimization, and availability.
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
  LLMUtils,
} from "./providers/base.js";
import {
  OpenAIProvider,
  OPENAI_MODELS,
  OPENAI_MODEL_INFO,
} from "./providers/openai.js";
import {
  GeminiProvider,
  GEMINI_MODELS,
  GEMINI_MODEL_INFO,
} from "./providers/gemini.js";
import {
  AnthropicProvider,
  ANTHROPIC_MODELS,
  ANTHROPIC_MODEL_INFO,
} from "./providers/anthropic.js";
import {
  OpenRouterProvider,
  OPENROUTER_MODELS,
  OPENROUTER_MODEL_INFO,
} from "./providers/openrouter.js";

export interface LLMManagerConfig {
  providers: {
    [key: string]: LLMProviderConfig & {
      type: string;
      priority: number;
      enabled: boolean;
    };
  };
  fallbackStrategy: "fastest" | "cheapest" | "best_quality" | "round_robin";
  maxRetries: number;
  timeoutMs: number;
  costBudget?: {
    dailyLimitUsd: number;
    warningThresholdUsd: number;
  };
  caching?: {
    enabled: boolean;
    ttlSeconds: number;
    maxCacheSize: number;
  };
}

export interface TaskRequirements {
  maxTokens?: number;
  quality: "fast" | "balanced" | "high";
  costPriority: "low" | "medium" | "high";
  requiresSpecificModel?: string;
  allowFallback?: boolean;
}

export interface LLMManagerMetrics {
  totalRequests: number;
  totalCostUsd: number;
  averageResponseTime: number;
  successRate: number;
  providerUsage: Record<
    string,
    {
      requests: number;
      successRate: number;
      averageResponseTime: number;
      totalCost: number;
    }
  >;
  lastError?: string;
}

interface CacheEntry {
  response: LLMCompletionResponse;
  timestamp: number;
  cost: number;
}

export class LLMManager {
  private providers: Map<string, BaseLLMProvider> = new Map();
  private config: LLMManagerConfig;
  private metrics: LLMManagerMetrics;
  private cache: Map<string, CacheEntry> = new Map();
  private costTracker: Map<string, number> = new Map(); // Daily cost per provider
  private roundRobinIndex: number = 0;

  constructor(config: LLMManagerConfig) {
    this.config = config;
    this.metrics = {
      totalRequests: 0,
      totalCostUsd: 0,
      averageResponseTime: 0,
      successRate: 0,
      providerUsage: {},
    };

    this.initializeProviders();
    this.startMetricsCleanup();
  }

  /**
   * Main completion method with intelligent routing
   */
  async completion(
    messages: LLMMessage[],
    requirements: TaskRequirements = {
      quality: "balanced",
      costPriority: "medium",
    },
    options: LLMCompletionOptions = {},
  ): Promise<LLMCompletionResponse> {
    const startTime = Date.now();
    this.metrics.totalRequests++;

    try {
      // Check cache first
      if (this.config.caching?.enabled) {
        const cacheKey = this.generateCacheKey(messages, options);
        const cached = this.getCachedResponse(cacheKey);
        if (cached) {
          return cached.response;
        }
      }

      // Select optimal provider
      const provider = await this.selectProvider(
        messages,
        requirements,
        options,
      );
      if (!provider) {
        throw new LLMError("No available providers", "NO_PROVIDERS", "manager");
      }

      // Execute request with selected provider
      const response = await provider.completion(messages, options);

      // Calculate and track cost
      const cost = this.calculateCost(provider.getProviderName(), response);
      this.trackCost(provider.getProviderName(), cost);

      // Update metrics
      const responseTime = Date.now() - startTime;
      this.updateMetrics(provider.getProviderName(), responseTime, cost, true);

      // Cache successful response
      if (this.config.caching?.enabled) {
        const cacheKey = this.generateCacheKey(messages, options);
        this.setCachedResponse(cacheKey, response, cost);
      }

      return response;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.updateMetrics("unknown", responseTime, 0, false, error);

      // Try fallback if enabled
      if (requirements.allowFallback !== false) {
        return this.handleFallback(messages, requirements, options, error);
      }

      throw error;
    }
  }

  /**
   * Generate embeddings with provider selection
   */
  async embedding(
    text: string,
    requirements: TaskRequirements = {
      quality: "balanced",
      costPriority: "medium",
    },
  ): Promise<LLMEmbeddingResponse> {
    const providers = this.getAvailableProviders();

    for (const providerName of providers) {
      try {
        const provider = this.providers.get(providerName)!;
        const response = await provider.embedding(text);

        const cost = this.calculateEmbeddingCost(providerName, response);
        this.trackCost(providerName, cost);

        return response;
      } catch (error) {
        if (error instanceof LLMRateLimitError) {
          continue; // Try next provider
        }
        throw error;
      }
    }

    throw new LLMError(
      "No available providers for embeddings",
      "NO_PROVIDERS",
      "manager",
    );
  }

  /**
   * Health check for all providers
   */
  async healthCheck(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    const checks = Array.from(this.providers.entries()).map(
      async ([name, provider]) => {
        try {
          results[name] = await provider.healthCheck();
        } catch (error) {
          results[name] = false;
        }
      },
    );

    await Promise.all(checks);
    return results;
  }

  /**
   * Get comprehensive metrics
   */
  getMetrics(): LLMManagerMetrics {
    return { ...this.metrics };
  }

  /**
   * Get cost summary
   */
  getCostSummary(): Record<
    string,
    { dailyCost: number; monthlyEstimate: number }
  > {
    const summary: Record<
      string,
      { dailyCost: number; monthlyEstimate: number }
    > = {};

    for (const [provider, cost] of this.costTracker.entries()) {
      summary[provider] = {
        dailyCost: cost,
        monthlyEstimate: cost * 30,
      };
    }

    return summary;
  }

  /**
   * Initialize providers based on configuration
   */
  private initializeProviders(): void {
    for (const [name, providerConfig] of Object.entries(
      this.config.providers,
    )) {
      if (!providerConfig.enabled) continue;

      try {
        let provider: BaseLLMProvider;

        switch (providerConfig.type.toLowerCase()) {
          case "openai":
            provider = new OpenAIProvider(providerConfig);
            break;
          case "gemini":
            provider = new GeminiProvider(providerConfig);
            break;
          case "anthropic":
            provider = new AnthropicProvider(providerConfig);
            break;
          case "openrouter":
            provider = new OpenRouterProvider(providerConfig);
            break;
          default:
            console.warn(`Unsupported provider type: ${providerConfig.type}`);
            continue;
        }

        this.providers.set(name, provider);
        this.metrics.providerUsage[name] = {
          requests: 0,
          successRate: 0,
          averageResponseTime: 0,
          totalCost: 0,
        };
      } catch (error) {
        console.error(`Failed to initialize provider ${name}:`, error);
      }
    }
  }

  /**
   * Intelligent provider selection based on requirements
   */
  private async selectProvider(
    messages: LLMMessage[],
    requirements: TaskRequirements,
    options: LLMCompletionOptions,
  ): Promise<BaseLLMProvider | null> {
    const availableProviders = this.getAvailableProviders();

    if (availableProviders.length === 0) {
      return null;
    }

    // If specific model required, find matching provider
    if (requirements.requiresSpecificModel) {
      for (const providerName of availableProviders) {
        const provider = this.providers.get(providerName)!;
        try {
          const models = await provider.getAvailableModels();
          if (models.includes(requirements.requiresSpecificModel)) {
            return provider;
          }
        } catch (error) {
          continue;
        }
      }
      return null;
    }

    // Score providers based on requirements
    const scores = await Promise.all(
      availableProviders.map(async (name) => {
        const provider = this.providers.get(name)!;
        const score = await this.scoreProvider(
          provider,
          name,
          requirements,
          messages,
        );
        return { name, provider, score };
      }),
    );

    // Sort by score and return best
    scores.sort((a, b) => b.score - a.score);
    return scores[0]?.provider || null;
  }

  /**
   * Score provider based on requirements
   */
  private async scoreProvider(
    provider: BaseLLMProvider,
    name: string,
    requirements: TaskRequirements,
    messages: LLMMessage[],
  ): Promise<number> {
    let score = 0;
    const providerConfig = this.config.providers[name];
    const usage = this.metrics.providerUsage[name];

    // Base priority score
    score += providerConfig.priority * 10;

    // Quality requirements
    if (requirements.quality === "high" && name.includes("gpt-4")) {
      score += 30;
    } else if (requirements.quality === "fast" && name.includes("3.5")) {
      score += 20;
    } else if (requirements.quality === "balanced") {
      score += 15;
    }

    // Cost considerations
    const estimatedCost = this.estimateCost(name, messages);
    if (requirements.costPriority === "low" && estimatedCost < 0.001) {
      score += 25;
    } else if (requirements.costPriority === "high") {
      score += Math.max(0, 20 - estimatedCost * 10000);
    }

    // Performance history
    if (usage.successRate > 0.9) score += 15;
    if (usage.averageResponseTime < 3000) score += 10;

    // Budget constraints
    const dailyCost = this.costTracker.get(name) || 0;
    if (this.config.costBudget) {
      const budgetUsed = dailyCost / this.config.costBudget.dailyLimitUsd;
      if (budgetUsed > 0.8) score -= 30;
      else if (budgetUsed > 0.5) score -= 15;
    }

    // Fallback strategy
    switch (this.config.fallbackStrategy) {
      case "fastest":
        score += Math.max(0, 20 - usage.averageResponseTime / 100);
        break;
      case "cheapest":
        score += Math.max(0, 25 - estimatedCost * 50000);
        break;
      case "round_robin":
        const availableProviders = this.getAvailableProviders();
        if (this.roundRobinIndex % availableProviders.length === 0) {
          score += 50;
        }
        break;
    }

    return Math.max(0, score);
  }

  /**
   * Handle fallback when primary provider fails
   */
  private async handleFallback(
    messages: LLMMessage[],
    requirements: TaskRequirements,
    options: LLMCompletionOptions,
    originalError: any,
  ): Promise<LLMCompletionResponse> {
    console.warn(
      "Primary provider failed, attempting fallback:",
      originalError.message,
    );

    // Try remaining providers in order of preference
    const fallbackProviders = this.getAvailableProviders();

    for (const providerName of fallbackProviders) {
      try {
        const provider = this.providers.get(providerName)!;
        const response = await provider.completion(messages, options);

        console.log(`Fallback successful with provider: ${providerName}`);
        return response;
      } catch (error) {
        console.warn(`Fallback provider ${providerName} also failed:`, error);
        continue;
      }
    }

    throw new LLMError(
      "All providers failed",
      "ALL_PROVIDERS_FAILED",
      "manager",
      originalError,
    );
  }

  /**
   * Get list of available providers
   */
  private getAvailableProviders(): string[] {
    return Array.from(this.providers.keys())
      .filter((name) => this.config.providers[name].enabled)
      .sort(
        (a, b) =>
          this.config.providers[b].priority - this.config.providers[a].priority,
      );
  }

  /**
   * Calculate cost for completion
   */
  private calculateCost(
    providerName: string,
    response: LLMCompletionResponse,
  ): number {
    if (providerName.includes("openai")) {
      const modelInfo =
        OPENAI_MODEL_INFO[response.model as keyof typeof OPENAI_MODEL_INFO];
      if (modelInfo) {
        const inputCost =
          (response.usage.promptTokens / 1000) *
          modelInfo.costPer1KTokens.input;
        const outputCost =
          (response.usage.completionTokens / 1000) *
          ((modelInfo.costPer1KTokens as any).output || 0);
        return inputCost + outputCost;
      }
    }

    if (providerName.includes("gemini")) {
      const modelInfo =
        GEMINI_MODEL_INFO[response.model as keyof typeof GEMINI_MODEL_INFO];
      if (modelInfo) {
        const inputCost =
          (response.usage.promptTokens / 1000) *
          modelInfo.costPer1KTokens.input;
        const outputCost =
          (response.usage.completionTokens / 1000) *
          ((modelInfo.costPer1KTokens as any).output || 0);
        return inputCost + outputCost;
      }
    }

    if (providerName.includes("anthropic")) {
      const modelInfo =
        ANTHROPIC_MODEL_INFO[
          response.model as keyof typeof ANTHROPIC_MODEL_INFO
        ];
      if (modelInfo) {
        const inputCost =
          (response.usage.promptTokens / 1000) *
          modelInfo.costPer1KTokens.input;
        const outputCost =
          (response.usage.completionTokens / 1000) *
          modelInfo.costPer1KTokens.output;
        return inputCost + outputCost;
      }
    }

    if (providerName.includes("openrouter")) {
      const modelInfo =
        OPENROUTER_MODEL_INFO[
          response.model as keyof typeof OPENROUTER_MODEL_INFO
        ];
      if (modelInfo) {
        const inputCost =
          (response.usage.promptTokens / 1000) *
          modelInfo.costPer1KTokens.input;
        const outputCost =
          (response.usage.completionTokens / 1000) *
          modelInfo.costPer1KTokens.output;
        return inputCost + outputCost;
      }
    }

    return 0; // Unknown cost
  }

  /**
   * Calculate cost for embeddings
   */
  private calculateEmbeddingCost(
    providerName: string,
    response: LLMEmbeddingResponse,
  ): number {
    if (providerName.includes("openai")) {
      const modelInfo =
        OPENAI_MODEL_INFO[response.model as keyof typeof OPENAI_MODEL_INFO];
      if (modelInfo) {
        return (
          (response.usage.totalTokens / 1000) * modelInfo.costPer1KTokens.input
        );
      }
    }

    if (providerName.includes("gemini")) {
      const modelInfo =
        GEMINI_MODEL_INFO[response.model as keyof typeof GEMINI_MODEL_INFO];
      if (modelInfo) {
        return (
          (response.usage.totalTokens / 1000) * modelInfo.costPer1KTokens.input
        );
      }
    }

    if (providerName.includes("anthropic")) {
      const modelInfo =
        ANTHROPIC_MODEL_INFO[
          response.model as keyof typeof ANTHROPIC_MODEL_INFO
        ];
      if (modelInfo) {
        return (
          (response.usage.totalTokens / 1000) * modelInfo.costPer1KTokens.input
        );
      }
    }

    if (providerName.includes("openrouter")) {
      const modelInfo =
        OPENROUTER_MODEL_INFO[
          response.model as keyof typeof OPENROUTER_MODEL_INFO
        ];
      if (modelInfo) {
        return (
          (response.usage.totalTokens / 1000) * modelInfo.costPer1KTokens.input
        );
      }
    }

    return 0;
  }

  /**
   * Estimate cost before making request
   */
  private estimateCost(providerName: string, messages: LLMMessage[]): number {
    const estimatedTokens = messages.reduce(
      (sum, msg) => sum + LLMUtils.estimateTokenCount(msg.content),
      0,
    );

    if (providerName.includes("openai")) {
      // Use GPT-4o-mini pricing as default estimate
      return (estimatedTokens / 1000) * 0.00015;
    }

    if (providerName.includes("gemini")) {
      // Use Gemini 1.5 Flash pricing as default estimate
      return (estimatedTokens / 1000) * 0.000075;
    }

    if (providerName.includes("anthropic")) {
      // Use Claude 3 Haiku pricing as default estimate
      return (estimatedTokens / 1000) * 0.00025;
    }

    if (providerName.includes("openrouter")) {
      // Use average OpenRouter pricing as default estimate
      return (estimatedTokens / 1000) * 0.0005;
    }

    return 0.001; // Default estimate
  }

  /**
   * Track daily costs per provider
   */
  private trackCost(providerName: string, cost: number): void {
    const currentCost = this.costTracker.get(providerName) || 0;
    this.costTracker.set(providerName, currentCost + cost);
    this.metrics.totalCostUsd += cost;
  }

  /**
   * Update metrics after request
   */
  private updateMetrics(
    providerName: string,
    responseTime: number,
    cost: number,
    success: boolean,
    error?: any,
  ): void {
    // Update provider-specific metrics
    if (this.metrics.providerUsage[providerName]) {
      const usage = this.metrics.providerUsage[providerName];
      usage.requests++;
      usage.totalCost += cost;
      usage.averageResponseTime =
        (usage.averageResponseTime * (usage.requests - 1) + responseTime) /
        usage.requests;
      usage.successRate =
        (usage.successRate * (usage.requests - 1) + (success ? 1 : 0)) /
        usage.requests;
    }

    // Update global metrics
    this.metrics.averageResponseTime =
      (this.metrics.averageResponseTime * (this.metrics.totalRequests - 1) +
        responseTime) /
      this.metrics.totalRequests;

    this.metrics.successRate =
      (this.metrics.successRate * (this.metrics.totalRequests - 1) +
        (success ? 1 : 0)) /
      this.metrics.totalRequests;

    if (error) {
      this.metrics.lastError = error.message || String(error);
    }
  }

  /**
   * Cache management
   */
  private generateCacheKey(
    messages: LLMMessage[],
    options: LLMCompletionOptions,
  ): string {
    const key = JSON.stringify({ messages, options });
    return Buffer.from(key).toString("base64").substring(0, 32);
  }

  private getCachedResponse(key: string): CacheEntry | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const ttl = this.config.caching?.ttlSeconds || 3600;
    if (Date.now() - entry.timestamp > ttl * 1000) {
      this.cache.delete(key);
      return null;
    }

    return entry;
  }

  private setCachedResponse(
    key: string,
    response: LLMCompletionResponse,
    cost: number,
  ): void {
    const maxSize = this.config.caching?.maxCacheSize || 1000;

    if (this.cache.size >= maxSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      response,
      timestamp: Date.now(),
      cost,
    });
  }

  /**
   * Cleanup old metrics and reset daily counters
   */
  private startMetricsCleanup(): void {
    setInterval(() => {
      // Reset daily cost tracking at midnight
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() === 0) {
        this.costTracker.clear();
      }

      // Clean old cache entries
      if (this.config.caching?.enabled) {
        const ttl = (this.config.caching.ttlSeconds || 3600) * 1000;
        const cutoff = Date.now() - ttl;

        for (const [key, entry] of this.cache.entries()) {
          if (entry.timestamp < cutoff) {
            this.cache.delete(key);
          }
        }
      }
    }, 60000); // Check every minute
  }
}

/**
 * Default configuration for common use cases
 */
export const DEFAULT_LLM_CONFIG: LLMManagerConfig = {
  providers: {
    "claude-haiku": {
      type: "anthropic",
      priority: 110,
      enabled: true,
      apiKey: process.env.ANTHROPIC_API_KEY || "",
      timeout: 60000,
      retryAttempts: 3,
    },
    "gemini-flash": {
      type: "gemini",
      priority: 100,
      enabled: true,
      apiKey: process.env.GEMINI_API_KEY || "",
      timeout: 30000,
      retryAttempts: 3,
    },
    "openrouter-claude": {
      type: "openrouter",
      priority: 95,
      enabled: true,
      apiKey: process.env.OPENROUTER_API_KEY || "",
      timeout: 45000,
      retryAttempts: 3,
    },
    "openai-gpt4o-mini": {
      type: "openai",
      priority: 90,
      enabled: true,
      apiKey: process.env.OPENAI_API_KEY || "",
      timeout: 30000,
      retryAttempts: 3,
    },
    "openai-gpt4o": {
      type: "openai",
      priority: 80,
      enabled: true,
      apiKey: process.env.OPENAI_API_KEY || "",
      timeout: 45000,
      retryAttempts: 2,
    },
  },
  fallbackStrategy: "best_quality",
  maxRetries: 3,
  timeoutMs: 30000,
  costBudget: {
    dailyLimitUsd: 10.0,
    warningThresholdUsd: 8.0,
  },
  caching: {
    enabled: true,
    ttlSeconds: 3600,
    maxCacheSize: 500,
  },
};
