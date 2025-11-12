/**
 * Constella BeeAI Framework - Base Tool Class
 *
 * Core abstraction for all tools in the framework. Provides validation,
 * execution tracking, error handling, and integration with the agent system.
 */

import { EventEmitter } from 'eventemitter3';
import { z } from 'zod';
import {
  ToolSchema,
  ToolExecutionContext,
  ToolResult,
  ToolError,
  ToolValidationError,
  ToolExecutionError,
  JSONObject,
  JSONValue,
  UUID,
  Timestamp,
  FrameworkEvent
} from '../types';

// ============================================================================
// TOOL VALIDATION SCHEMAS
// ============================================================================

const ToolParameterSchema = z.object({
  type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
  description: z.string(),
  required: z.boolean().optional(),
  enum: z.array(z.string()).optional(),
  properties: z.record(z.any()).optional(),
  items: z.any().optional()
});

const ToolSchemaValidator = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  parameters: z.object({
    type: z.literal('object'),
    properties: z.record(ToolParameterSchema),
    required: z.array(z.string()).optional()
  })
});

// ============================================================================
// TOOL EXECUTION METADATA
// ============================================================================

export interface ToolExecutionMetadata {
  execution_id: UUID;
  start_time: Timestamp;
  end_time?: Timestamp;
  execution_time_ms?: number;
  memory_usage_mb?: number;
  cpu_usage_percent?: number;
  network_requests?: number;
  cache_hits?: number;
  cache_misses?: number;
  errors?: string[];
  warnings?: string[];
  debug_info?: JSONObject;
}

export interface ToolConfiguration {
  timeout_ms?: number;
  retry_attempts?: number;
  retry_delay_ms?: number;
  cache_enabled?: boolean;
  cache_ttl_seconds?: number;
  rate_limit?: {
    max_calls_per_minute: number;
    max_calls_per_hour: number;
  };
  resource_limits?: {
    max_memory_mb: number;
    max_execution_time_ms: number;
  };
  logging_enabled?: boolean;
  metrics_enabled?: boolean;
}

// ============================================================================
// BASE TOOL CLASS
// ============================================================================

export abstract class Tool extends EventEmitter {
  // Abstract properties that must be implemented by subclasses
  public abstract readonly name: string;
  public abstract readonly description: string;
  public abstract readonly schema: ToolSchema;

  // Configuration and state
  protected readonly config: ToolConfiguration;
  protected readonly executionHistory: Map<UUID, ToolExecutionMetadata> = new Map();
  private readonly rateLimitTracker: Map<string, number[]> = new Map();

  constructor(config: ToolConfiguration = {}) {
    super();

    // Default configuration
    this.config = {
      timeout_ms: 30000, // 30 seconds
      retry_attempts: 3,
      retry_delay_ms: 1000,
      cache_enabled: false,
      cache_ttl_seconds: 300, // 5 minutes
      rate_limit: {
        max_calls_per_minute: 60,
        max_calls_per_hour: 1000
      },
      resource_limits: {
        max_memory_mb: 512,
        max_execution_time_ms: 60000 // 1 minute
      },
      logging_enabled: true,
      metrics_enabled: true,
      ...config
    };

    this.validateSchema();
  }

  // ============================================================================
  // ABSTRACT METHODS (must be implemented by subclasses)
  // ============================================================================

  /**
   * Execute the tool with given parameters and context
   */
  protected abstract executeInternal(
    parameters: JSONObject,
    context: ToolExecutionContext
  ): Promise<JSONValue>;

  // ============================================================================
  // PUBLIC INTERFACE
  // ============================================================================

  /**
   * Main execution method with full validation and error handling
   */
  public async execute(
    parameters: JSONObject,
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    const executionId = this.generateExecutionId();
    const metadata: ToolExecutionMetadata = {
      execution_id: executionId,
      start_time: new Date().toISOString(),
      errors: [],
      warnings: []
    };

    try {
      // Pre-execution validation and checks
      await this.preExecutionChecks(parameters, context, metadata);

      // Execute with timeout and resource monitoring
      const result = await this.executeWithMonitoring(parameters, context, metadata);

      // Post-execution processing
      await this.postExecutionProcessing(result, metadata);

      return {
        success: true,
        data: result,
        metadata: this.buildResultMetadata(metadata)
      };

    } catch (error) {
      return this.handleExecutionError(error, metadata);
    } finally {
      this.finalizeExecution(executionId, metadata);
    }
  }

  /**
   * Validate parameters against the tool schema
   */
  public validate(parameters: JSONObject): { valid: boolean; errors: string[] } {
    try {
      const errors: string[] = [];

      // Check required parameters
      const requiredParams = this.schema.parameters.required || [];
      for (const param of requiredParams) {
        if (!(param in parameters)) {
          errors.push(`Missing required parameter: ${param}`);
        }
      }

      // Validate parameter types and constraints
      for (const [paramName, paramValue] of Object.entries(parameters)) {
        const paramSchema = this.schema.parameters.properties[paramName];
        if (!paramSchema) {
          errors.push(`Unknown parameter: ${paramName}`);
          continue;
        }

        const validationError = this.validateParameter(paramName, paramValue, paramSchema);
        if (validationError) {
          errors.push(validationError);
        }
      }

      return {
        valid: errors.length === 0,
        errors
      };

    } catch (error) {
      return {
        valid: false,
        errors: [`Validation error: ${error instanceof Error ? error.message : String(error)}`]
      };
    }
  }

  /**
   * Get tool information for discovery and documentation
   */
  public getInfo(): {
    name: string;
    description: string;
    schema: ToolSchema;
    configuration: ToolConfiguration;
    capabilities: string[];
    version: string;
  } {
    return {
      name: this.name,
      description: this.description,
      schema: this.schema,
      configuration: this.config,
      capabilities: this.getCapabilities(),
      version: this.getVersion()
    };
  }

  /**
   * Check if the tool is currently available and healthy
   */
  public async isHealthy(): Promise<{
    healthy: boolean;
    issues: string[];
    last_check: Timestamp;
  }> {
    const issues: string[] = [];
    const startTime = Date.now();

    try {
      // Check basic functionality
      await this.performHealthCheck();

      // Check resource constraints
      if (this.config.resource_limits) {
        const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;
        if (memoryUsage > this.config.resource_limits.max_memory_mb) {
          issues.push(`High memory usage: ${memoryUsage.toFixed(2)}MB`);
        }
      }

      // Check rate limits
      const rateLimitIssue = this.checkRateLimits('health-check');
      if (rateLimitIssue) {
        issues.push(rateLimitIssue);
      }

    } catch (error) {
      issues.push(`Health check failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      healthy: issues.length === 0,
      issues,
      last_check: new Date().toISOString()
    };
  }

  /**
   * Get execution statistics and metrics
   */
  public getMetrics(): {
    total_executions: number;
    successful_executions: number;
    failed_executions: number;
    average_execution_time_ms: number;
    last_execution?: Timestamp;
    error_rate: number;
  } {
    const executions = Array.from(this.executionHistory.values());
    const successfulExecutions = executions.filter(e => !e.errors || e.errors.length === 0);
    const avgExecutionTime = executions.length > 0
      ? executions.reduce((sum, e) => sum + (e.execution_time_ms || 0), 0) / executions.length
      : 0;

    return {
      total_executions: executions.length,
      successful_executions: successfulExecutions.length,
      failed_executions: executions.length - successfulExecutions.length,
      average_execution_time_ms: avgExecutionTime,
      last_execution: executions.length > 0 ? executions[executions.length - 1].start_time : undefined,
      error_rate: executions.length > 0 ? (executions.length - successfulExecutions.length) / executions.length : 0
    };
  }

  // ============================================================================
  // PROTECTED METHODS (can be overridden by subclasses)
  // ============================================================================

  /**
   * Perform tool-specific health checks
   */
  protected async performHealthCheck(): Promise<void> {
    // Default implementation - subclasses can override
    // Perform a simple validation check
    this.validateSchema();
  }

  /**
   * Get tool-specific capabilities
   */
  protected getCapabilities(): string[] {
    return [
      'basic_execution',
      'parameter_validation',
      'error_handling',
      'metrics_collection'
    ];
  }

  /**
   * Get tool version
   */
  protected getVersion(): string {
    return '1.0.0';
  }

  /**
   * Pre-execution hook for subclasses
   */
  protected async beforeExecution(
    parameters: JSONObject,
    context: ToolExecutionContext,
    metadata: ToolExecutionMetadata
  ): Promise<void> {
    // Default implementation - subclasses can override
  }

  /**
   * Post-execution hook for subclasses
   */
  protected async afterExecution(
    result: JSONValue,
    metadata: ToolExecutionMetadata
  ): Promise<void> {
    // Default implementation - subclasses can override
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async preExecutionChecks(
    parameters: JSONObject,
    context: ToolExecutionContext,
    metadata: ToolExecutionMetadata
  ): Promise<void> {
    // Validate parameters
    const validation = this.validate(parameters);
    if (!validation.valid) {
      throw new ToolValidationError(this.name, validation.errors, parameters);
    }

    // Check rate limits
    const rateLimitError = this.checkRateLimits(context.agent_id);
    if (rateLimitError) {
      throw new ToolError(
        `Rate limit exceeded: ${rateLimitError}`,
        this.name,
        parameters,
        undefined,
        ['Wait before retrying', 'Consider increasing rate limits']
      );
    }

    // Call subclass hook
    await this.beforeExecution(parameters, context, metadata);

    // Emit start event
    this.emitEvent('tool.execution_started', {
      tool_name: this.name,
      agent_id: context.agent_id,
      execution_id: metadata.execution_id,
      parameters,
      context
    });
  }

  private async executeWithMonitoring(
    parameters: JSONObject,
    context: ToolExecutionContext,
    metadata: ToolExecutionMetadata
  ): Promise<JSONValue> {
    const timeoutPromise = this.createTimeoutPromise();
    const executionPromise = this.executeInternal(parameters, context);

    try {
      const result = await Promise.race([executionPromise, timeoutPromise]);
      metadata.end_time = new Date().toISOString();
      metadata.execution_time_ms = Date.now() - new Date(metadata.start_time).getTime();

      return result;
    } catch (error) {
      metadata.end_time = new Date().toISOString();
      metadata.execution_time_ms = Date.now() - new Date(metadata.start_time).getTime();

      if (error instanceof Error && error.message.includes('timeout')) {
        throw new ToolExecutionError(
          this.name,
          `Execution timed out after ${this.config.timeout_ms}ms`,
          parameters,
          metadata.execution_time_ms,
          error
        );
      }

      throw error;
    }
  }

  private async postExecutionProcessing(
    result: JSONValue,
    metadata: ToolExecutionMetadata
  ): Promise<void> {
    // Call subclass hook
    await this.afterExecution(result, metadata);

    // Emit completion event
    this.emitEvent('tool.execution_completed', {
      tool_name: this.name,
      execution_id: metadata.execution_id,
      success: true,
      result,
      execution_time_ms: metadata.execution_time_ms
    });
  }

  private handleExecutionError(
    error: unknown,
    metadata: ToolExecutionMetadata
  ): ToolResult {
    metadata.end_time = new Date().toISOString();
    metadata.execution_time_ms = Date.now() - new Date(metadata.start_time).getTime();

    let toolError: ToolError;

    if (error instanceof ToolError) {
      toolError = error;
    } else if (error instanceof Error) {
      toolError = new ToolExecutionError(
        this.name,
        error.message,
        undefined,
        metadata.execution_time_ms,
        error
      );
    } else {
      toolError = new ToolExecutionError(
        this.name,
        String(error),
        undefined,
        metadata.execution_time_ms
      );
    }

    metadata.errors!.push(toolError.message);

    // Emit error event
    this.emitEvent('tool.execution_error', {
      tool_name: this.name,
      execution_id: metadata.execution_id,
      error: toolError.explain(),
      execution_time_ms: metadata.execution_time_ms
    });

    return {
      success: false,
      error: toolError.message,
      metadata: this.buildResultMetadata(metadata)
    };
  }

  private finalizeExecution(executionId: UUID, metadata: ToolExecutionMetadata): void {
    // Store execution history
    this.executionHistory.set(executionId, metadata);

    // Cleanup old execution history (keep last 100 executions)
    if (this.executionHistory.size > 100) {
      const entries = Array.from(this.executionHistory.entries());
      entries.sort((a, b) => new Date(a[1].start_time).getTime() - new Date(b[1].start_time).getTime());
      const toRemove = entries.slice(0, entries.length - 100);
      toRemove.forEach(([id]) => this.executionHistory.delete(id));
    }

    // Update rate limit tracking
    this.updateRateLimitTracking();
  }

  private validateSchema(): void {
    try {
      ToolSchemaValidator.parse(this.schema);
    } catch (error) {
      throw new ToolError(
        `Invalid tool schema: ${error instanceof Error ? error.message : String(error)}`,
        this.name
      );
    }
  }

  private validateParameter(
    paramName: string,
    paramValue: JSONValue,
    paramSchema: any
  ): string | null {
    // Type validation
    const expectedType = paramSchema.type;
    const actualType = this.getJSONValueType(paramValue);

    if (expectedType !== actualType) {
      return `Parameter '${paramName}' expected type '${expectedType}' but got '${actualType}'`;
    }

    // Enum validation
    if (paramSchema.enum && !paramSchema.enum.includes(paramValue)) {
      return `Parameter '${paramName}' must be one of: ${paramSchema.enum.join(', ')}`;
    }

    // Additional type-specific validations
    if (expectedType === 'string' && typeof paramValue === 'string') {
      if (paramValue.length === 0) {
        return `Parameter '${paramName}' cannot be empty`;
      }
    }

    if (expectedType === 'number' && typeof paramValue === 'number') {
      if (!isFinite(paramValue)) {
        return `Parameter '${paramName}' must be a finite number`;
      }
    }

    return null;
  }

  private getJSONValueType(value: JSONValue): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  private checkRateLimits(identifier: string): string | null {
    if (!this.config.rate_limit) return null;

    const now = Date.now();
    const calls = this.rateLimitTracker.get(identifier) || [];

    // Clean up old calls (older than 1 hour)
    const recentCalls = calls.filter(time => now - time < 3600000);

    // Check per-minute limit
    const callsLastMinute = recentCalls.filter(time => now - time < 60000);
    if (callsLastMinute.length >= this.config.rate_limit.max_calls_per_minute) {
      return `Exceeded rate limit: ${this.config.rate_limit.max_calls_per_minute} calls per minute`;
    }

    // Check per-hour limit
    if (recentCalls.length >= this.config.rate_limit.max_calls_per_hour) {
      return `Exceeded rate limit: ${this.config.rate_limit.max_calls_per_hour} calls per hour`;
    }

    return null;
  }

  private updateRateLimitTracking(): void {
    // This would be called after successful execution
    // Implementation depends on how you want to track rate limits
  }

  private createTimeoutPromise(): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Tool execution timeout after ${this.config.timeout_ms}ms`));
      }, this.config.timeout_ms);
    });
  }

  private buildResultMetadata(metadata: ToolExecutionMetadata): JSONObject {
    return {
      execution_time_ms: metadata.execution_time_ms,
      memory_usage_mb: metadata.memory_usage_mb,
      execution_id: metadata.execution_id,
      errors: metadata.errors,
      warnings: metadata.warnings
    };
  }

  private emitEvent(type: string, data: JSONObject): void {
    if (this.config.logging_enabled) {
      const event: FrameworkEvent = {
        id: this.generateExecutionId(),
        type,
        timestamp: new Date().toISOString(),
        source: this.name,
        version: '1.0',
        severity: type.includes('error') ? 'error' : 'info',
        category: 'tool',
        data
      };

      this.emit('event', event);
    }
  }

  private generateExecutionId(): UUID {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export default Tool;
