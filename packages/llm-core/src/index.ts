/**
 * @constella/llm-core - Main Entry Point
 *
 * Unified LLM provider abstraction for the Constella platform.
 * Provides intelligent routing, fallback handling, and cost optimization
 * across multiple LLM providers (OpenAI, Anthropic, local models).
 */

// Core provider abstractions
export {
  BaseLLMProvider,
  LLMError,
  LLMRateLimitError,
  LLMAuthenticationError,
  LLMModelNotFoundError,
  LLMUtils,
} from "./providers/base.js";

export type {
  LLMMessage,
  LLMCompletionOptions,
  LLMCompletionResponse,
  LLMEmbeddingResponse,
  LLMProviderConfig,
  LLMProviderMetrics,
  LLMProviderFactory,
} from "./providers/base.js";

// OpenAI provider
export {
  OpenAIProvider,
  createOpenAIProvider,
  OPENAI_MODELS,
  OPENAI_MODEL_INFO,
} from "./providers/openai.js";

// Gemini provider
export {
  GeminiProvider,
  createGeminiProvider,
  GEMINI_MODELS,
  GEMINI_MODEL_INFO,
} from "./providers/gemini.js";

// Anthropic provider
export {
  AnthropicProvider,
  createAnthropicProvider,
  ANTHROPIC_MODELS,
  ANTHROPIC_MODEL_INFO,
} from "./providers/anthropic.js";

// OpenRouter provider
export {
  OpenRouterProvider,
  createOpenRouterProvider,
  OPENROUTER_MODELS,
  OPENROUTER_MODEL_INFO,
} from "./providers/openrouter.js";

// LLM Manager - Main orchestration class
export { LLMManager, DEFAULT_LLM_CONFIG } from "./manager.js";

export type {
  LLMManagerConfig,
  TaskRequirements,
  LLMManagerMetrics,
} from "./manager.js";

/**
 * Quick setup function for common use cases
 */
import { LLMManager, DEFAULT_LLM_CONFIG } from "./manager.js";

export function createLLMManager(apiKeys: {
  openai?: string;
  anthropic?: string;
  gemini?: string;
  openrouter?: string;
}): LLMManager {
  const config = {
    ...DEFAULT_LLM_CONFIG,
    providers: {
      ...DEFAULT_LLM_CONFIG.providers,
    },
  };

  // Update API keys
  if (apiKeys.openai) {
    for (const [name, providerConfig] of Object.entries(config.providers)) {
      if (providerConfig.type === "openai") {
        (providerConfig as any).apiKey = apiKeys.openai;
      }
    }
  }

  if (apiKeys.gemini) {
    for (const [name, providerConfig] of Object.entries(config.providers)) {
      if (providerConfig.type === "gemini") {
        (providerConfig as any).apiKey = apiKeys.gemini;
      }
    }
  }

  if (apiKeys.anthropic) {
    for (const [name, providerConfig] of Object.entries(config.providers)) {
      if (providerConfig.type === "anthropic") {
        (providerConfig as any).apiKey = apiKeys.anthropic;
      }
    }
  }

  if (apiKeys.openrouter) {
    for (const [name, providerConfig] of Object.entries(config.providers)) {
      if (providerConfig.type === "openrouter") {
        (providerConfig as any).apiKey = apiKeys.openrouter;
      }
    }
  }

  return new LLMManager(config);
}

/**
 * Agent-specific LLM configurations
 */
export const AGENT_CONFIGS = {
  ARCHITECTURE: {
    quality: "high" as const,
    costPriority: "medium" as const,
    maxTokens: 2000,
    temperature: 0.3,
  },

  SECURITY: {
    quality: "high" as const,
    costPriority: "high" as const,
    maxTokens: 1500,
    temperature: 0.1,
  },

  QUALITY: {
    quality: "balanced" as const,
    costPriority: "medium" as const,
    maxTokens: 1000,
    temperature: 0.2,
  },

  CODE_GENERATION: {
    quality: "high" as const,
    costPriority: "medium" as const,
    maxTokens: 3000,
    temperature: 0.2,
  },

  DESIGN: {
    quality: "high" as const,
    costPriority: "low" as const,
    maxTokens: 1500,
    temperature: 0.7,
  },
} as const;

/**
 * Common prompt templates for agents
 */
export const PROMPT_TEMPLATES = {
  SYSTEM_ARCHITECT: (
    context: string,
  ) => `You are a senior system architect with deep expertise in software design patterns, scalability, and best practices.

Context: ${context}

Analyze the provided information and provide architectural insights including:
- System design recommendations
- Scalability considerations
- Security implications
- Performance optimizations
- Technology stack suggestions

Be specific, actionable, and consider enterprise-grade requirements.`,

  SECURITY_ANALYST: (
    context: string,
  ) => `You are a cybersecurity expert specializing in application security, vulnerability assessment, and compliance.

Context: ${context}

Perform a security analysis including:
- Vulnerability identification
- Threat modeling
- Security best practices
- Compliance considerations (SOC2, GDPR, etc.)
- Mitigation strategies

Provide specific, actionable security recommendations with priority levels.`,

  CODE_REVIEWER: (
    context: string,
  ) => `You are a senior software engineer performing code review with focus on quality, maintainability, and performance.

Context: ${context}

Review the code and provide:
- Code quality assessment
- Performance optimizations
- Security vulnerabilities
- Best practice violations
- Refactoring suggestions

Be constructive and provide specific examples of improvements.`,

  UX_DESIGNER: (
    context: string,
  ) => `You are a senior UX/UI designer with expertise in user experience, accessibility, and modern design principles.

Context: ${context}

Analyze the design requirements and provide:
- User experience recommendations
- Interface design suggestions
- Accessibility considerations
- Usability improvements
- Visual design principles

Focus on creating intuitive, accessible, and engaging user experiences.`,
} as const;

/**
 * Version information
 */
export const VERSION = "1.0.0";
export const BUILD_DATE = new Date().toISOString();
