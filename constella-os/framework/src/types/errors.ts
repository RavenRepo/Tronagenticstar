/**
 * Constella BeeAI Framework - Error Type Definitions
 *
 * Comprehensive error handling system with specific error types
 * for different framework components and scenarios
 */

import { JSONObject, JSONValue, UUID, Timestamp } from './index';

// ============================================================================
// BASE ERROR TYPES
// ============================================================================

export interface ErrorContext {
  timestamp: Timestamp;
  component: string;
  operation?: string;
  user_id?: string;
  session_id?: string;
  correlation_id?: UUID;
  additional_data?: JSONObject;
}

export interface ErrorDetails {
  code: string;
  message: string;
  context: ErrorContext;
  cause?: Error;
  stack_trace?: string;
  recovery_suggestions?: string[];
}

// ============================================================================
// FRAMEWORK ERROR CLASSES
// ============================================================================

export class FrameworkError extends Error {
  public readonly code: string;
  public readonly context: ErrorContext;
  public readonly cause?: Error;
  public readonly recovery_suggestions: string[];

  constructor(
    message: string,
    code: string = 'FRAMEWORK_ERROR',
    context: Partial<ErrorContext> = {},
    cause?: Error,
    recovery_suggestions: string[] = []
  ) {
    super(message);
    this.name = 'FrameworkError';
    this.code = code;
    this.context = {
      timestamp: new Date().toISOString(),
      component: 'framework',
      ...context
    };
    this.cause = cause;
    this.recovery_suggestions = recovery_suggestions;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FrameworkError);
    }
  }

  /**
   * Generate a comprehensive error explanation
   */
  explain(): string {
    let explanation = `[${this.code}] ${this.message}`;

    if (this.context.component) {
      explanation += `\nComponent: ${this.context.component}`;
    }

    if (this.context.operation) {
      explanation += `\nOperation: ${this.context.operation}`;
    }

    if (this.context.correlation_id) {
      explanation += `\nCorrelation ID: ${this.context.correlation_id}`;
    }

    if (this.context.additional_data) {
      explanation += `\nContext: ${JSON.stringify(this.context.additional_data, null, 2)}`;
    }

    if (this.cause) {
      explanation += `\nCaused by: ${this.cause.message}`;
    }

    if (this.recovery_suggestions.length > 0) {
      explanation += `\nRecovery suggestions:\n${this.recovery_suggestions.map(s => `  - ${s}`).join('\n')}`;
    }

    return explanation;
  }

  /**
   * Convert to JSON for logging/serialization
   */
  toJSON(): ErrorDetails {
    return {
      code: this.code,
      message: this.message,
      context: this.context,
      cause: this.cause ? {
        name: this.cause.name,
        message: this.cause.message,
        stack: this.cause.stack
      } as any,
      stack_trace: this.stack,
      recovery_suggestions: this.recovery_suggestions
    };
  }
}

// ============================================================================
// AGENT-SPECIFIC ERRORS
// ============================================================================

export class AgentError extends FrameworkError {
  public readonly agent_id: string;
  public readonly step_number?: number;

  constructor(
    message: string,
    agent_id: string,
    step_number?: number,
    cause?: Error,
    recovery_suggestions: string[] = []
  ) {
    super(
      message,
      'AGENT_ERROR',
      {
        component: 'agent',
        operation: 'execution',
        additional_data: { agent_id, step_number }
      },
      cause,
      recovery_suggestions
    );
    this.name = 'AgentError';
    this.agent_id = agent_id;
    this.step_number = step_number;
  }
}

export class AgentTimeoutError extends AgentError {
  public readonly timeout_seconds: number;

  constructor(agent_id: string, timeout_seconds: number, step_number?: number) {
    super(
      `Agent execution timed out after ${timeout_seconds} seconds`,
      agent_id,
      step_number,
      undefined,
      [
        'Increase timeout configuration',
        'Check agent performance and optimization',
        'Review LLM provider response times'
      ]
    );
    this.code = 'AGENT_TIMEOUT';
    this.timeout_seconds = timeout_seconds;
  }
}

export class AgentConfigurationError extends AgentError {
  public readonly configuration_field: string;

  constructor(agent_id: string, configuration_field: string, message: string) {
    super(
      `Invalid agent configuration: ${message}`,
      agent_id,
      undefined,
      undefined,
      [
        `Review ${configuration_field} configuration`,
        'Check agent configuration documentation',
        'Validate all required fields are provided'
      ]
    );
    this.code = 'AGENT_CONFIGURATION_ERROR';
    this.configuration_field = configuration_field;
  }
}

export class AgentMaxIterationsError extends AgentError {
  public readonly max_iterations: number;

  constructor(agent_id: string, max_iterations: number) {
    super(
      `Agent exceeded maximum iterations limit of ${max_iterations}`,
      agent_id,
      max_iterations,
      undefined,
      [
        'Increase max_iterations limit if appropriate',
        'Review agent logic for potential infinite loops',
        'Check if complex tasks need workflow decomposition'
      ]
    );
    this.code = 'AGENT_MAX_ITERATIONS';
    this.max_iterations = max_iterations;
  }
}

// ============================================================================
// TOOL-SPECIFIC ERRORS
// ============================================================================

export class ToolError extends FrameworkError {
  public readonly tool_name: string;
  public readonly parameters?: JSONObject;

  constructor(
    message: string,
    tool_name: string,
    parameters?: JSONObject,
    cause?: Error,
    recovery_suggestions: string[] = []
  ) {
    super(
      message,
      'TOOL_ERROR',
      {
        component: 'tool',
        operation: 'execution',
        additional_data: { tool_name, parameters }
      },
      cause,
      recovery_suggestions
    );
    this.name = 'ToolError';
    this.tool_name = tool_name;
    this.parameters = parameters;
  }
}

export class ToolNotFoundError extends ToolError {
  constructor(tool_name: string) {
    super(
      `Tool '${tool_name}' not found`,
      tool_name,
      undefined,
      undefined,
      [
        'Check tool name spelling',
        'Verify tool is registered with agent',
        'Check tool availability and dependencies'
      ]
    );
    this.code = 'TOOL_NOT_FOUND';
  }
}

export class ToolValidationError extends ToolError {
  public readonly validation_errors: string[];

  constructor(tool_name: string, validation_errors: string[], parameters?: JSONObject) {
    super(
      `Tool validation failed: ${validation_errors.join(', ')}`,
      tool_name,
      parameters,
      undefined,
      [
        'Check parameter types and values',
        'Review tool schema requirements',
        'Validate all required parameters are provided'
      ]
    );
    this.code = 'TOOL_VALIDATION_ERROR';
    this.validation_errors = validation_errors;
  }
}

export class ToolExecutionError extends ToolError {
  public readonly execution_time_ms?: number;

  constructor(
    tool_name: string,
    message: string,
    parameters?: JSONObject,
    execution_time_ms?: number,
    cause?: Error
  ) {
    super(
      `Tool execution failed: ${message}`,
      tool_name,
      parameters,
      cause,
      [
        'Check tool dependencies and configuration',
        'Review parameter values and types',
        'Check external service availability'
      ]
    );
    this.code = 'TOOL_EXECUTION_ERROR';
    this.execution_time_ms = execution_time_ms;
  }
}

// ============================================================================
// REQUIREMENT-SPECIFIC ERRORS
// ============================================================================

export interface RequirementViolation {
  requirement_name: string;
  step_number: number;
  violation_type: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Timestamp;
  suggested_action?: string;
}

export class RequirementViolationError extends FrameworkError {
  public readonly violation: RequirementViolation;

  constructor(violation: RequirementViolation) {
    super(
      `Requirement violation: ${violation.message}`,
      'REQUIREMENT_VIOLATION',
      {
        component: 'requirement',
        operation: 'enforcement',
        additional_data: { violation }
      },
      undefined,
      violation.suggested_action ? [violation.suggested_action] : [
        'Review requirement configuration',
        'Check agent behavior compliance',
        'Consider adjusting requirement severity'
      ]
    );
    this.name = 'RequirementViolationError';
    this.violation = violation;
  }
}

export class RequirementConfigurationError extends FrameworkError {
  public readonly requirement_name: string;

  constructor(requirement_name: string, message: string) {
    super(
      `Requirement configuration error: ${message}`,
      'REQUIREMENT_CONFIGURATION_ERROR',
      {
        component: 'requirement',
        operation: 'configuration',
        additional_data: { requirement_name }
      },
      undefined,
      [
        'Check requirement configuration syntax',
        'Validate requirement parameters',
        'Review requirement documentation'
      ]
    );
    this.requirement_name = requirement_name;
  }
}

// ============================================================================
// LLM PROVIDER ERRORS
// ============================================================================

export class LLMProviderError extends FrameworkError {
  public readonly provider_name: string;
  public readonly model?: string;

  constructor(
    message: string,
    provider_name: string,
    model?: string,
    cause?: Error,
    recovery_suggestions: string[] = []
  ) {
    super(
      message,
      'LLM_PROVIDER_ERROR',
      {
        component: 'llm_provider',
        operation: 'generation',
        additional_data: { provider_name, model }
      },
      cause,
      recovery_suggestions
    );
    this.name = 'LLMProviderError';
    this.provider_name = provider_name;
    this.model = model;
  }
}

export class LLMProviderUnavailableError extends LLMProviderError {
  constructor(provider_name: string, model?: string) {
    super(
      `LLM provider '${provider_name}' is unavailable`,
      provider_name,
      model,
      undefined,
      [
        'Check provider service status',
        'Verify API credentials and configuration',
        'Consider using fallback provider'
      ]
    );
    this.code = 'LLM_PROVIDER_UNAVAILABLE';
  }
}

export class LLMProviderRateLimitError extends LLMProviderError {
  public readonly retry_after_seconds?: number;

  constructor(provider_name: string, retry_after_seconds?: number, model?: string) {
    super(
      `Rate limit exceeded for provider '${provider_name}'`,
      provider_name,
      model,
      undefined,
      [
        'Wait before retrying request',
        'Implement exponential backoff',
        'Consider upgrading provider plan'
      ]
    );
    this.code = 'LLM_PROVIDER_RATE_LIMIT';
    this.retry_after_seconds = retry_after_seconds;
  }
}

// ============================================================================
// MEMORY-SPECIFIC ERRORS
// ============================================================================

export class MemoryError extends FrameworkError {
  public readonly provider_name: string;
  public readonly operation: string;

  constructor(
    message: string,
    provider_name: string,
    operation: string,
    cause?: Error,
    recovery_suggestions: string[] = []
  ) {
    super(
      message,
      'MEMORY_ERROR',
      {
        component: 'memory',
        operation,
        additional_data: { provider_name }
      },
      cause,
      recovery_suggestions
    );
    this.name = 'MemoryError';
    this.provider_name = provider_name;
    this.operation = operation;
  }
}

export class MemoryConnectionError extends MemoryError {
  constructor(provider_name: string, connection_url?: string) {
    super(
      `Failed to connect to memory provider '${provider_name}'`,
      provider_name,
      'connection',
      undefined,
      [
        'Check memory provider service status',
        'Verify connection configuration',
        'Check network connectivity'
      ]
    );
    this.code = 'MEMORY_CONNECTION_ERROR';
    if (connection_url) {
      this.context.additional_data!.connection_url = connection_url;
    }
  }
}

// ============================================================================
// WORKFLOW-SPECIFIC ERRORS
// ============================================================================

export class WorkflowError extends FrameworkError {
  public readonly workflow_id: UUID;
  public readonly step_id?: UUID;

  constructor(
    message: string,
    workflow_id: UUID,
    step_id?: UUID,
    cause?: Error,
    recovery_suggestions: string[] = []
  ) {
    super(
      message,
      'WORKFLOW_ERROR',
      {
        component: 'workflow',
        operation: 'execution',
        additional_data: { workflow_id, step_id }
      },
      cause,
      recovery_suggestions
    );
    this.name = 'WorkflowError';
    this.workflow_id = workflow_id;
    this.step_id = step_id;
  }
}

export class WorkflowDefinitionError extends WorkflowError {
  constructor(workflow_id: UUID, message: string) {
    super(
      `Workflow definition error: ${message}`,
      workflow_id,
      undefined,
      undefined,
      [
        'Check workflow definition syntax',
        'Validate step dependencies',
        'Review workflow configuration'
      ]
    );
    this.code = 'WORKFLOW_DEFINITION_ERROR';
  }
}

export class WorkflowStepError extends WorkflowError {
  public readonly step_name: string;

  constructor(workflow_id: UUID, step_id: UUID, step_name: string, message: string, cause?: Error) {
    super(
      `Workflow step '${step_name}' failed: ${message}`,
      workflow_id,
      step_id,
      cause,
      [
        'Check step configuration and parameters',
        'Review step dependencies',
        'Check agent/tool availability'
      ]
    );
    this.code = 'WORKFLOW_STEP_ERROR';
    this.step_name = step_name;
  }
}

// ============================================================================
// AUTHENTICATION & AUTHORIZATION ERRORS
// ============================================================================

export class AuthenticationError extends FrameworkError {
  constructor(message: string = 'Authentication failed') {
    super(
      message,
      'AUTHENTICATION_ERROR',
      {
        component: 'auth',
        operation: 'authentication'
      },
      undefined,
      [
        'Check authentication credentials',
        'Verify token validity',
        'Review authentication configuration'
      ]
    );
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends FrameworkError {
  public readonly required_permission: string;

  constructor(required_permission: string, message?: string) {
    super(
      message || `Insufficient permissions: requires '${required_permission}'`,
      'AUTHORIZATION_ERROR',
      {
        component: 'auth',
        operation: 'authorization',
        additional_data: { required_permission }
      },
      undefined,
      [
        'Check user permissions',
        'Contact administrator for access',
        'Review authorization configuration'
      ]
    );
    this.name = 'AuthorizationError';
    this.required_permission = required_permission;
  }
}

// ============================================================================
// VALIDATION ERRORS
// ============================================================================

export class ValidationError extends FrameworkError {
  public readonly field_errors: Record<string, string[]>;

  constructor(field_errors: Record<string, string[]>, context?: string) {
    const message = context
      ? `Validation failed for ${context}: ${Object.keys(field_errors).join(', ')}`
      : `Validation failed: ${Object.keys(field_errors).join(', ')}`;

    super(
      message,
      'VALIDATION_ERROR',
      {
        component: 'validation',
        operation: 'validation',
        additional_data: { field_errors, context }
      },
      undefined,
      [
        'Check input data types and values',
        'Review validation schema',
        'Ensure all required fields are provided'
      ]
    );
    this.name = 'ValidationError';
    this.field_errors = field_errors;
  }
}

// ============================================================================
// NETWORK & EXTERNAL SERVICE ERRORS
// ============================================================================

export class NetworkError extends FrameworkError {
  public readonly url?: string;
  public readonly status_code?: number;

  constructor(message: string, url?: string, status_code?: number, cause?: Error) {
    super(
      message,
      'NETWORK_ERROR',
      {
        component: 'network',
        operation: 'request',
        additional_data: { url, status_code }
      },
      cause,
      [
        'Check network connectivity',
        'Verify service availability',
        'Review request configuration'
      ]
    );
    this.name = 'NetworkError';
    this.url = url;
    this.status_code = status_code;
  }
}

export class ExternalServiceError extends FrameworkError {
  public readonly service_name: string;
  public readonly error_code?: string;

  constructor(service_name: string, message: string, error_code?: string, cause?: Error) {
    super(
      `External service '${service_name}' error: ${message}`,
      'EXTERNAL_SERVICE_ERROR',
      {
        component: 'external_service',
        operation: 'request',
        additional_data: { service_name, error_code }
      },
      cause,
      [
        'Check external service status',
        'Review service configuration',
        'Consider implementing fallback logic'
      ]
    );
    this.name = 'ExternalServiceError';
    this.service_name = service_name;
    this.error_code = error_code;
  }
}

// ============================================================================
// ERROR UTILITY FUNCTIONS
// ============================================================================

export function isFrameworkError(error: unknown): error is FrameworkError {
  return error instanceof FrameworkError;
}

export function createErrorFromUnknown(
  error: unknown,
  context: Partial<ErrorContext> = {}
): FrameworkError {
  if (isFrameworkError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new FrameworkError(
      error.message,
      'UNKNOWN_ERROR',
      context,
      error
    );
  }

  return new FrameworkError(
    String(error),
    'UNKNOWN_ERROR',
    context
  );
}

export function extractErrorCode(error: unknown): string {
  if (isFrameworkError(error)) {
    return error.code;
  }
  return 'UNKNOWN_ERROR';
}

export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
