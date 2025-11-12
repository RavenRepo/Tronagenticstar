/**
 * Constella BeeAI Framework - Main Export Index
 *
 * Provides a unified interface to all framework components.
 * This is the main entry point for the Constella BeeAI Framework implementation.
 */

// ============================================================================
// CORE EXPORTS
// ============================================================================

// Core framework components
export { Tool } from './core/Tool';
export { Requirement } from './core/Requirements';
export { ConditionalRequirement, SequenceRequirement, RateLimitRequirement } from './core/Requirements';

// Backend/LLM providers
export { ChatModel } from './backend/ChatModel';

// Tools
export { ThinkTool } from './tools/ThinkTool';
export { HandoffTool } from './tools/HandoffTool';

// ============================================================================
// TYPE EXPORTS
// ============================================================================

// Core types
export type {
  UUID,
  Timestamp,
  JSONValue,
  JSONObject,
  JSONArray,
  FrameworkConfig
} from './types';

// LLM types
export type {
  LLMProvider,
  LLMMessage,
  LLMResponse,
  LLMConfig,
  LLMChoice,
  ToolCall
} from './types';

// Tool types
export type {
  ToolSchema,
  ToolParameter,
  ToolExecutionContext,
  ToolResult
} from './types';

// Requirement types
export type {
  RequirementConfig,
  RequirementViolation
} from './types';

// Agent types
export type {
  AgentConfig,
  AgentExecutionContext,
  AgentExecutionResult,
  AgentExecutionStep,
  AgentMessage
} from './types';

// Workflow types
export type {
  WorkflowDefinition,
  WorkflowStep,
  WorkflowExecution,
  WorkflowTrigger,
  RetryPolicy
} from './types';

// Memory types
export type {
  MemoryRecord,
  MemoryQuery,
  MemorySearchResult,
  MemoryProvider
} from './types';

// Event types
export type {
  FrameworkEvent,
  EventSubscription,
  EventHandler,
  EventFilter
} from './types/events';

// Metric types
export type {
  BaseMetric,
  PerformanceMetric,
  ResourceMetric,
  SystemMetric,
  AgentMetrics,
  ToolMetrics
} from './types/metrics';

// Error types
export type {
  ErrorContext,
  ErrorDetails
} from './types/errors';

// ============================================================================
// ERROR EXPORTS
// ============================================================================

export {
  FrameworkError,
  AgentError,
  ToolError,
  RequirementViolationError,
  LLMProviderError,
  LLMProviderUnavailableError,
  LLMProviderRateLimitError,
  MemoryError,
  MemoryConnectionError,
  WorkflowError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  NetworkError,
  ExternalServiceError
} from './types/errors';

// ============================================================================
// UTILITY EXPORTS
// ============================================================================

export {
  isFrameworkError,
  createErrorFromUnknown,
  extractErrorCode,
  extractErrorMessage
} from './types/errors';

export {
  EventBuilder,
  createEvent,
  isEventType,
  filterEventsByType
} from './types/events';

export {
  MetricBuilder,
  PerformanceTracker
} from './types/metrics';

// ============================================================================
// FRAMEWORK VERSION
// ============================================================================

export const FRAMEWORK_VERSION = '1.0.0';
export const FRAMEWORK_NAME = 'Constella BeeAI Framework';

// ============================================================================
// CONVENIENCE FACTORIES
// ============================================================================

/**
 * Create a ChatModel instance (BeeAI pattern)
 */
export function createChatModel(nameWithModel: string, config?: Partial<LLMConfig>) {
  return ChatModel.fromName(nameWithModel, config);
}

/**
 * Create a ThinkTool instance
 */
export function createThinkTool() {
  return new ThinkTool();
}

/**
 * Create a HandoffTool instance
 */
export function createHandoffTool(targetAgent: any, config?: any) {
  return new HandoffTool(targetAgent, config);
}

/**
 * Create a ConditionalRequirement (BeeAI pattern)
 */
export function createConditionalRequirement(
  toolClass: any,
  options?: {
    force_at_step?: number;
    enforce_at_step?: number;
    condition?: (context: any) => boolean;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    max_violations?: number;
  }
) {
  return new ConditionalRequirement(toolClass, options);
}

// ============================================================================
// FRAMEWORK INITIALIZATION
// ============================================================================

/**
 * Initialize the framework with configuration
 */
export function initializeFramework(config?: Partial<FrameworkConfig>) {
  // Framework initialization logic would go here
  // This could set up global configurations, logging, metrics, etc.
  console.log(`${FRAMEWORK_NAME} v${FRAMEWORK_VERSION} initialized`);

  if (config) {
    // Apply global configuration
    console.log('Framework configuration applied:', config);
  }
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export default {
  // Core classes
  Tool,
  Requirement,
  ConditionalRequirement,
  SequenceRequirement,
  RateLimitRequirement,
  ChatModel,
  ThinkTool,
  HandoffTool,

  // Factories
  createChatModel,
  createThinkTool,
  createHandoffTool,
  createConditionalRequirement,

  // Utilities
  initializeFramework,

  // Constants
  FRAMEWORK_VERSION,
  FRAMEWORK_NAME
};
