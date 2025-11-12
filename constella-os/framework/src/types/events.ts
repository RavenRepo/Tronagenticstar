/**
 * Constella BeeAI Framework - Event Type Definitions
 *
 * Comprehensive event system for framework-wide communication,
 * monitoring, and observability
 */

import { EventEmitter } from 'eventemitter3';
import { JSONObject, JSONValue, UUID, Timestamp } from './index';

// ============================================================================
// BASE EVENT TYPES
// ============================================================================

export interface BaseEvent {
  id: UUID;
  type: string;
  timestamp: Timestamp;
  source: string;
  version: string;
  correlation_id?: UUID;
  metadata?: JSONObject;
}

export interface FrameworkEvent extends BaseEvent {
  data: JSONObject;
  severity: 'debug' | 'info' | 'warn' | 'error' | 'critical';
  category: 'system' | 'agent' | 'tool' | 'workflow' | 'memory' | 'auth' | 'performance';
}

// ============================================================================
// AGENT EVENTS
// ============================================================================

export interface AgentEvent extends FrameworkEvent {
  category: 'agent';
  agent_id: string;
  conversation_id?: string;
  step_number?: number;
}

export interface AgentStartedEvent extends AgentEvent {
  type: 'agent.started';
  data: {
    agent_name: string;
    conversation_id: string;
    initial_message: string;
    configuration: JSONObject;
  };
}

export interface AgentStepEvent extends AgentEvent {
  type: 'agent.step';
  data: {
    step_number: number;
    action: 'think' | 'tool_call' | 'response' | 'handoff';
    tool_name?: string;
    parameters?: JSONObject;
    reasoning?: string;
  };
}

export interface AgentToolCallEvent extends AgentEvent {
  type: 'agent.tool_call';
  data: {
    tool_name: string;
    parameters: JSONObject;
    step_number: number;
    execution_time_ms?: number;
  };
}

export interface AgentResponseEvent extends AgentEvent {
  type: 'agent.response';
  data: {
    response: string;
    step_number: number;
    final: boolean;
    tokens_used: number;
    execution_time_ms: number;
  };
}

export interface AgentErrorEvent extends AgentEvent {
  type: 'agent.error';
  severity: 'error' | 'critical';
  data: {
    error_code: string;
    error_message: string;
    step_number?: number;
    stack_trace?: string;
    recovery_attempted: boolean;
  };
}

export interface AgentCompletedEvent extends AgentEvent {
  type: 'agent.completed';
  data: {
    status: 'success' | 'error' | 'timeout';
    total_steps: number;
    execution_time_ms: number;
    tokens_used: number;
    cost?: number;
    final_response?: string;
  };
}

export interface AgentHandoffEvent extends AgentEvent {
  type: 'agent.handoff';
  data: {
    from_agent_id: string;
    to_agent_id: string;
    handoff_message: string;
    context_transferred: JSONObject;
    step_number: number;
  };
}

// ============================================================================
// TOOL EVENTS
// ============================================================================

export interface ToolEvent extends FrameworkEvent {
  category: 'tool';
  tool_name: string;
  agent_id?: string;
  execution_id: UUID;
}

export interface ToolExecutionStartedEvent extends ToolEvent {
  type: 'tool.execution_started';
  data: {
    parameters: JSONObject;
    context: JSONObject;
    estimated_duration_ms?: number;
  };
}

export interface ToolExecutionCompletedEvent extends ToolEvent {
  type: 'tool.execution_completed';
  data: {
    success: boolean;
    result?: JSONValue;
    error?: string;
    execution_time_ms: number;
    resource_usage?: {
      memory_mb: number;
      cpu_percent: number;
    };
  };
}

export interface ToolValidationEvent extends ToolEvent {
  type: 'tool.validation';
  data: {
    parameters: JSONObject;
    validation_errors?: string[];
    validation_time_ms: number;
  };
}

// ============================================================================
// WORKFLOW EVENTS
// ============================================================================

export interface WorkflowEvent extends FrameworkEvent {
  category: 'workflow';
  workflow_id: UUID;
  execution_id: UUID;
}

export interface WorkflowStartedEvent extends WorkflowEvent {
  type: 'workflow.started';
  data: {
    workflow_name: string;
    workflow_version: string;
    trigger_type: string;
    initial_variables: JSONObject;
    estimated_duration_ms?: number;
  };
}

export interface WorkflowStepStartedEvent extends WorkflowEvent {
  type: 'workflow.step_started';
  data: {
    step_id: UUID;
    step_name: string;
    step_type: string;
    dependencies_resolved: UUID[];
    variables: JSONObject;
  };
}

export interface WorkflowStepCompletedEvent extends WorkflowEvent {
  type: 'workflow.step_completed';
  data: {
    step_id: UUID;
    step_name: string;
    success: boolean;
    result?: JSONValue;
    execution_time_ms: number;
    updated_variables: JSONObject;
  };
}

export interface WorkflowCompletedEvent extends WorkflowEvent {
  type: 'workflow.completed';
  data: {
    status: 'success' | 'failed' | 'cancelled';
    steps_completed: number;
    total_steps: number;
    execution_time_ms: number;
    final_variables: JSONObject;
    error?: string;
  };
}

// ============================================================================
// MEMORY EVENTS
// ============================================================================

export interface MemoryEvent extends FrameworkEvent {
  category: 'memory';
  provider_name: string;
}

export interface MemoryStoreEvent extends MemoryEvent {
  type: 'memory.store';
  data: {
    record_id: UUID;
    record_type: string;
    conversation_id?: string;
    agent_id?: string;
    size_bytes: number;
  };
}

export interface MemoryRetrieveEvent extends MemoryEvent {
  type: 'memory.retrieve';
  data: {
    query: JSONObject;
    results_count: number;
    search_time_ms: number;
    cache_hit: boolean;
  };
}

export interface MemoryPurgeEvent extends MemoryEvent {
  type: 'memory.purge';
  data: {
    conversation_id?: string;
    records_deleted: number;
    space_freed_bytes: number;
  };
}

// ============================================================================
// SYSTEM EVENTS
// ============================================================================

export interface SystemEvent extends FrameworkEvent {
  category: 'system';
}

export interface SystemStartupEvent extends SystemEvent {
  type: 'system.startup';
  data: {
    framework_version: string;
    node_version: string;
    environment: string;
    startup_time_ms: number;
    components_loaded: string[];
  };
}

export interface SystemShutdownEvent extends SystemEvent {
  type: 'system.shutdown';
  data: {
    reason: string;
    graceful: boolean;
    active_conversations: number;
    cleanup_time_ms: number;
  };
}

export interface SystemHealthEvent extends SystemEvent {
  type: 'system.health';
  data: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    components: Record<string, {
      status: 'up' | 'down' | 'degraded';
      response_time_ms?: number;
      error?: string;
    }>;
    memory_usage_mb: number;
    cpu_usage_percent: number;
    uptime_seconds: number;
  };
}

// ============================================================================
// PERFORMANCE EVENTS
// ============================================================================

export interface PerformanceEvent extends FrameworkEvent {
  category: 'performance';
}

export interface PerformanceMetricEvent extends PerformanceEvent {
  type: 'performance.metric';
  data: {
    metric_name: string;
    metric_value: number;
    metric_unit: string;
    component: string;
    threshold_exceeded?: boolean;
    previous_value?: number;
  };
}

export interface PerformanceAlertEvent extends PerformanceEvent {
  type: 'performance.alert';
  severity: 'warn' | 'error' | 'critical';
  data: {
    alert_type: string;
    threshold: number;
    current_value: number;
    component: string;
    suggested_actions: string[];
  };
}

// ============================================================================
// AUTHENTICATION EVENTS
// ============================================================================

export interface AuthEvent extends FrameworkEvent {
  category: 'auth';
  user_id?: string;
  session_id?: string;
}

export interface AuthLoginEvent extends AuthEvent {
  type: 'auth.login';
  data: {
    user_id: string;
    login_method: string;
    success: boolean;
    ip_address?: string;
    user_agent?: string;
    failure_reason?: string;
  };
}

export interface AuthLogoutEvent extends AuthEvent {
  type: 'auth.logout';
  data: {
    user_id: string;
    session_duration_seconds: number;
    voluntary: boolean;
  };
}

export interface AuthTokenEvent extends AuthEvent {
  type: 'auth.token';
  data: {
    action: 'created' | 'refreshed' | 'revoked' | 'expired';
    token_type: string;
    expires_at?: Timestamp;
    scope?: string[];
  };
}

// ============================================================================
// ERROR EVENTS
// ============================================================================

export interface ErrorEvent extends FrameworkEvent {
  severity: 'error' | 'critical';
  data: {
    error_code: string;
    error_message: string;
    error_type: string;
    component: string;
    operation?: string;
    stack_trace?: string;
    context: JSONObject;
    recovery_attempted: boolean;
    user_impact: 'none' | 'low' | 'medium' | 'high' | 'critical';
  };
}

// ============================================================================
// EVENT SUBSCRIPTION TYPES
// ============================================================================

export interface EventSubscription {
  id: UUID;
  event_types: string[];
  event_categories?: string[];
  handler: EventHandler;
  filter?: EventFilter;
  active: boolean;
  created_at: Timestamp;
  metadata?: JSONObject;
}

export type EventHandler = (event: FrameworkEvent) => Promise<void> | void;
export type EventFilter = (event: FrameworkEvent) => boolean;

export interface EventSubscriptionConfig {
  event_types?: string[];
  event_categories?: string[];
  severity_levels?: Array<'debug' | 'info' | 'warn' | 'error' | 'critical'>;
  sources?: string[];
  handler: EventHandler;
  filter?: EventFilter;
  metadata?: JSONObject;
}

// ============================================================================
// EVENT EMITTER INTERFACE
// ============================================================================

export interface FrameworkEventEmitter {
  /**
   * Emit an event to all subscribers
   */
  emit(event: FrameworkEvent): Promise<void>;

  /**
   * Subscribe to specific event types
   */
  subscribe(config: EventSubscriptionConfig): Promise<UUID>;

  /**
   * Unsubscribe from events
   */
  unsubscribe(subscription_id: UUID): Promise<boolean>;

  /**
   * Get all active subscriptions
   */
  getSubscriptions(): Promise<EventSubscription[]>;

  /**
   * Clear all subscriptions
   */
  clearSubscriptions(): Promise<void>;

  /**
   * Get event history (if supported)
   */
  getHistory?(filter?: Partial<FrameworkEvent>, limit?: number): Promise<FrameworkEvent[]>;
}

// ============================================================================
// EVENT AGGREGATION TYPES
// ============================================================================

export interface EventAggregation {
  period: 'minute' | 'hour' | 'day';
  event_types: string[];
  aggregation_type: 'count' | 'sum' | 'avg' | 'min' | 'max';
  field?: string;
}

export interface EventAggregationResult {
  period_start: Timestamp;
  period_end: Timestamp;
  event_type: string;
  aggregation_type: string;
  value: number;
  count: number;
  metadata?: JSONObject;
}

// ============================================================================
// EVENT STREAM TYPES
// ============================================================================

export interface EventStreamConfig {
  buffer_size?: number;
  flush_interval_ms?: number;
  compression?: boolean;
  format: 'json' | 'protobuf' | 'avro';
}

export interface EventStream {
  push(event: FrameworkEvent): Promise<void>;
  flush(): Promise<void>;
  close(): Promise<void>;
  getStats(): EventStreamStats;
}

export interface EventStreamStats {
  events_pushed: number;
  events_flushed: number;
  buffer_size: number;
  last_flush: Timestamp;
  errors: number;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export type EventTypeMap = {
  // Agent events
  'agent.started': AgentStartedEvent;
  'agent.step': AgentStepEvent;
  'agent.tool_call': AgentToolCallEvent;
  'agent.response': AgentResponseEvent;
  'agent.error': AgentErrorEvent;
  'agent.completed': AgentCompletedEvent;
  'agent.handoff': AgentHandoffEvent;

  // Tool events
  'tool.execution_started': ToolExecutionStartedEvent;
  'tool.execution_completed': ToolExecutionCompletedEvent;
  'tool.validation': ToolValidationEvent;

  // Workflow events
  'workflow.started': WorkflowStartedEvent;
  'workflow.step_started': WorkflowStepStartedEvent;
  'workflow.step_completed': WorkflowStepCompletedEvent;
  'workflow.completed': WorkflowCompletedEvent;

  // Memory events
  'memory.store': MemoryStoreEvent;
  'memory.retrieve': MemoryRetrieveEvent;
  'memory.purge': MemoryPurgeEvent;

  // System events
  'system.startup': SystemStartupEvent;
  'system.shutdown': SystemShutdownEvent;
  'system.health': SystemHealthEvent;

  // Performance events
  'performance.metric': PerformanceMetricEvent;
  'performance.alert': PerformanceAlertEvent;

  // Auth events
  'auth.login': AuthLoginEvent;
  'auth.logout': AuthLogoutEvent;
  'auth.token': AuthTokenEvent;

  // Error events
  'error': ErrorEvent;
};

export type EventType = keyof EventTypeMap;

// ============================================================================
// EVENT BUILDER HELPERS
// ============================================================================

export class EventBuilder {
  private event: Partial<FrameworkEvent>;

  constructor(type: string, source: string) {
    this.event = {
      id: this.generateUUID(),
      type,
      source,
      timestamp: new Date().toISOString(),
      version: '1.0',
      severity: 'info',
      category: 'system',
      data: {}
    };
  }

  withCorrelationId(correlationId: UUID): this {
    this.event.correlation_id = correlationId;
    return this;
  }

  withSeverity(severity: 'debug' | 'info' | 'warn' | 'error' | 'critical'): this {
    this.event.severity = severity;
    return this;
  }

  withCategory(category: 'system' | 'agent' | 'tool' | 'workflow' | 'memory' | 'auth' | 'performance'): this {
    this.event.category = category;
    return this;
  }

  withData(data: JSONObject): this {
    this.event.data = { ...this.event.data, ...data };
    return this;
  }

  withMetadata(metadata: JSONObject): this {
    this.event.metadata = { ...this.event.metadata, ...metadata };
    return this;
  }

  build(): FrameworkEvent {
    if (!this.event.type || !this.event.source) {
      throw new Error('Event type and source are required');
    }
    return this.event as FrameworkEvent;
  }

  private generateUUID(): UUID {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

// ============================================================================
// EXPORT UTILITY FUNCTIONS
// ============================================================================

export function createEvent<T extends EventType>(
  type: T,
  source: string,
  data: EventTypeMap[T]['data']
): EventTypeMap[T] {
  return new EventBuilder(type, source)
    .withData(data as JSONObject)
    .build() as EventTypeMap[T];
}

export function isEventType<T extends EventType>(
  event: FrameworkEvent,
  type: T
): event is EventTypeMap[T] {
  return event.type === type;
}

export function filterEventsByType<T extends EventType>(
  events: FrameworkEvent[],
  type: T
): EventTypeMap[T][] {
  return events.filter((event): event is EventTypeMap[T] =>
    isEventType(event, type)
  );
}
