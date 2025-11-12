/**
 * Constella BeeAI Framework - Type Definitions
 *
 * Comprehensive type system for the BeeAI framework implementation
 * Ensures type safety across all framework components
 */

import { EventEmitter } from "eventemitter3";

// ============================================================================
// CORE TYPES
// ============================================================================

export type UUID = string;
export type Timestamp = string; // ISO 8601 format
export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONObject
  | JSONArray;
export type JSONObject = { [key: string]: JSONValue };
export type JSONArray = JSONValue[];

// ============================================================================
// LLM PROVIDER TYPES
// ============================================================================

export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface LLMResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: LLMChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface LLMChoice {
  index: number;
  message: LLMMessage;
  finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | null;
}

export interface LLMConfig {
  model: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stream?: boolean;
  timeout?: number;
}

export interface LLMProvider {
  name: string;
  generate(messages: LLMMessage[], config?: LLMConfig): Promise<LLMResponse>;
  generateStream?(
    messages: LLMMessage[],
    config?: LLMConfig,
  ): AsyncGenerator<LLMResponse>;
  isAvailable(): Promise<boolean>;
  getModels(): Promise<string[]>;
}

// ============================================================================
// TOOL TYPES
// ============================================================================

export interface ToolParameter {
  type: "string" | "number" | "boolean" | "object" | "array";
  description: string;
  required?: boolean;
  enum?: string[];
  properties?: Record<string, ToolParameter>;
  items?: ToolParameter;
}

export interface ToolSchema {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ToolParameter>;
    required?: string[];
  };
}

export interface ToolExecutionContext {
  agent_id: string;
  conversation_id: string;
  step_number: number;
  user_id?: string;
  session_data?: JSONObject;
}

export interface ToolResult {
  success: boolean;
  data?: JSONValue;
  error?: string;
  metadata?: {
    execution_time_ms: number;
    tokens_used?: number;
    cost?: number;
    [key: string]: JSONValue;
  };
}

export interface Tool {
  name: string;
  description: string;
  schema: ToolSchema;

  execute(
    parameters: JSONObject,
    context: ToolExecutionContext,
  ): Promise<ToolResult>;

  validate(parameters: JSONObject): boolean;
}

// ============================================================================
// REQUIREMENT TYPES
// ============================================================================

export interface RequirementConfig {
  name: string;
  description: string;
  enforce_at_step?: number;
  force_at_step?: number;
  max_violations?: number;
  severity: "low" | "medium" | "high" | "critical";
}

export interface RequirementViolation {
  requirement_name: string;
  step_number: number;
  violation_type: string;
  message: string;
  severity: "low" | "medium" | "high" | "critical";
  timestamp: Timestamp;
}

export interface Requirement {
  config: RequirementConfig;

  check(
    step_number: number,
    action: string,
    parameters: JSONObject,
    context: AgentExecutionContext,
  ): Promise<RequirementViolation | null>;

  enforce(
    step_number: number,
    action: string,
    parameters: JSONObject,
    context: AgentExecutionContext,
  ): Promise<JSONObject>; // Returns modified parameters
}

// ============================================================================
// MEMORY TYPES
// ============================================================================

export interface MemoryRecord {
  id: UUID;
  conversation_id: string;
  agent_id: string;
  timestamp: Timestamp;
  type: "message" | "tool_call" | "result" | "context" | "knowledge";
  content: JSONValue;
  metadata?: JSONObject;
  vector?: number[];
  tags?: string[];
}

export interface MemoryQuery {
  conversation_id?: string;
  agent_id?: string;
  type?: string;
  tags?: string[];
  content_filter?: string;
  vector_query?: number[];
  similarity_threshold?: number;
  limit?: number;
  offset?: number;
}

export interface MemorySearchResult {
  record: MemoryRecord;
  score?: number;
  distance?: number;
}

export interface MemoryProvider {
  name: string;

  store(record: MemoryRecord): Promise<void>;
  retrieve(id: UUID): Promise<MemoryRecord | null>;
  search(query: MemoryQuery): Promise<MemorySearchResult[]>;
  delete(id: UUID): Promise<boolean>;
  clear(conversation_id: string): Promise<number>;

  // Vector operations
  generateEmbedding?(text: string): Promise<number[]>;
  similaritySearch?(
    vector: number[],
    limit?: number,
  ): Promise<MemorySearchResult[]>;
}

// ============================================================================
// AGENT TYPES
// ============================================================================

export interface AgentConfig {
  name: string;
  role?: string;
  instructions?: string;
  llm_provider: LLMProvider;
  tools: Tool[];
  requirements: Requirement[];
  memory_provider?: MemoryProvider;
  middlewares?: Middleware[];
  max_iterations?: number;
  timeout_seconds?: number;
  temperature?: number;
}

export interface AgentExecutionContext {
  conversation_id: string;
  step_number: number;
  user_id?: string;
  session_data?: JSONObject;
  parent_agent_id?: string;
  execution_path: string[];
  start_time: Timestamp;
  memory_records: MemoryRecord[];
}

export interface AgentExecutionStep {
  step_number: number;
  timestamp: Timestamp;
  action: "think" | "tool_call" | "response" | "handoff";
  tool_name?: string;
  parameters?: JSONObject;
  result?: ToolResult;
  reasoning?: string;
  violations: RequirementViolation[];
}

export interface AgentExecutionResult {
  conversation_id: string;
  agent_id: string;
  status: "completed" | "failed" | "timeout" | "violation";
  final_response?: string;
  steps: AgentExecutionStep[];
  total_steps: number;
  execution_time_ms: number;
  tokens_used: number;
  cost?: number;
  errors?: string[];
  metadata?: JSONObject;
}

export interface AgentMessage {
  id: UUID;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Timestamp;
  metadata?: JSONObject;
}

// ============================================================================
// WORKFLOW TYPES
// ============================================================================

export interface WorkflowStep {
  id: UUID;
  name: string;
  type: "agent" | "tool" | "condition" | "parallel" | "sequential";
  agent_id?: string;
  tool_name?: string;
  parameters?: JSONObject;
  condition?: string; // JavaScript expression
  dependencies?: UUID[];
  retry_policy?: RetryPolicy;
  timeout_seconds?: number;
}

export interface RetryPolicy {
  max_retries: number;
  backoff_strategy: "fixed" | "exponential" | "linear";
  base_delay_ms: number;
  max_delay_ms?: number;
  retry_on?: string[]; // Error types to retry on
}

export interface WorkflowDefinition {
  id: UUID;
  name: string;
  description: string;
  version: string;
  steps: WorkflowStep[];
  triggers?: WorkflowTrigger[];
  variables?: JSONObject;
  metadata?: JSONObject;
}

export interface WorkflowTrigger {
  type: "manual" | "scheduled" | "event" | "webhook";
  configuration: JSONObject;
}

export interface WorkflowExecution {
  id: UUID;
  workflow_id: UUID;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  start_time: Timestamp;
  end_time?: Timestamp;
  steps_completed: number;
  total_steps: number;
  current_step?: UUID;
  variables: JSONObject;
  results: Record<UUID, JSONValue>;
  errors?: string[];
  metadata?: JSONObject;
}

// ============================================================================
// MIDDLEWARE TYPES
// ============================================================================

export interface MiddlewareContext {
  agent_id: string;
  conversation_id: string;
  step_number: number;
  action: string;
  parameters: JSONObject;
  execution_context: AgentExecutionContext;
}

export interface MiddlewareResult {
  continue: boolean;
  modified_parameters?: JSONObject;
  additional_context?: JSONObject;
  error?: string;
}

export interface Middleware {
  name: string;
  priority: number; // Lower numbers execute first

  beforeExecution(context: MiddlewareContext): Promise<MiddlewareResult>;
  afterExecution(
    context: MiddlewareContext,
    result: ToolResult,
  ): Promise<MiddlewareResult>;

  onError(context: MiddlewareContext, error: Error): Promise<MiddlewareResult>;
}

// ============================================================================
// EVENT TYPES
// ============================================================================

export interface FrameworkEvent {
  id: UUID;
  type: string;
  timestamp: Timestamp;
  source: string;
  data: JSONObject;
  metadata?: JSONObject;
}

export interface EventSubscription {
  id: UUID;
  event_types: string[];
  handler: (event: FrameworkEvent) => Promise<void>;
  filter?: (event: FrameworkEvent) => boolean;
  active: boolean;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export class FrameworkError extends Error {
  public code: string;
  public context?: JSONObject;
  public cause?: Error;

  constructor(
    message: string,
    code: string = "FRAMEWORK_ERROR",
    context?: JSONObject,
    cause?: Error,
  ) {
    super(message);
    this.name = "FrameworkError";
    this.code = code;
    this.context = context;
    this.cause = cause;
  }

  explain(): string {
    let explanation = `${this.code}: ${this.message}`;
    if (this.context) {
      explanation += `\nContext: ${JSON.stringify(this.context, null, 2)}`;
    }
    if (this.cause) {
      explanation += `\nCaused by: ${this.cause.message}`;
    }
    return explanation;
  }
}

export class AgentError extends FrameworkError {
  constructor(
    message: string,
    agent_id: string,
    step_number?: number,
    cause?: Error,
  ) {
    super(message, "AGENT_ERROR", { agent_id, step_number }, cause);
    this.name = "AgentError";
  }
}

export class ToolError extends FrameworkError {
  constructor(
    message: string,
    tool_name: string,
    parameters?: JSONObject,
    cause?: Error,
  ) {
    super(message, "TOOL_ERROR", { tool_name, parameters }, cause);
    this.name = "ToolError";
  }
}

export class RequirementViolationError extends FrameworkError {
  public violation: RequirementViolation;

  constructor(violation: RequirementViolation) {
    super(
      `Requirement violation: ${violation.message}`,
      "REQUIREMENT_VIOLATION",
      { violation },
    );
    this.name = "RequirementViolationError";
    this.violation = violation;
  }
}

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

export interface FrameworkConfig {
  // Core settings
  name: string;
  version: string;
  environment: "development" | "staging" | "production";

  // Logging
  log_level: "debug" | "info" | "warn" | "error";
  log_format: "json" | "text";

  // Security
  auth: {
    enabled: boolean;
    jwt_secret?: string;
    token_expiry?: number;
    allowed_origins?: string[];
  };

  // Memory
  memory: {
    provider: "redis" | "neo4j" | "qdrant" | "memory";
    redis_url?: string;
    neo4j_url?: string;
    qdrant_url?: string;
    collection_name?: string;
  };

  // Performance
  performance: {
    max_concurrent_executions: number;
    default_timeout_seconds: number;
    memory_cache_size: number;
    rate_limiting?: {
      enabled: boolean;
      requests_per_minute: number;
    };
  };

  // Observability
  observability: {
    metrics_enabled: boolean;
    tracing_enabled: boolean;
    prometheus_endpoint?: string;
    jaeger_endpoint?: string;
  };

  // Extensions
  extensions?: JSONObject;
}

// ============================================================================
// EXPORT ALL TYPES
// ============================================================================

// Re-export types from other modules when they exist
// export * from './errors';
// export * from './events';
// export * from './metrics';

// Re-export common Node.js types for convenience
export { EventEmitter };
