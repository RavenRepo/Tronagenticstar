/**
 * Constella BeeAI Framework - HandoffTool
 *
 * Implements the BeeAI HandoffTool pattern for seamless agent-to-agent delegation.
 * Enables complex multi-agent workflows with context preservation and result aggregation.
 */

import {
  ToolSchema,
  ToolExecutionContext,
  ToolResult,
  JSONObject,
  JSONValue,
  UUID,
  Timestamp,
  AgentExecutionContext,
  AgentExecutionResult
} from '../types';
import { Tool } from '../core/Tool';

// ============================================================================
// HANDOFF TOOL TYPES
// ============================================================================

export interface HandoffConfig {
  target_agent: any; // Agent instance or identifier
  name?: string;
  description?: string;
  timeout_ms?: number;
  preserve_context?: boolean;
  aggregation_strategy?: 'replace' | 'merge' | 'append';
  validation_rules?: HandoffValidationRule[];
  retry_on_failure?: boolean;
  max_retries?: number;
}

export interface HandoffValidationRule {
  field: string;
  validator: (value: any) => boolean;
  error_message: string;
}

export interface HandoffExecution {
  id: UUID;
  source_agent_id: string;
  target_agent_id: string;
  handoff_message: string;
  context_transferred: JSONObject;
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'timeout';
  started_at: Timestamp;
  completed_at?: Timestamp;
  execution_time_ms?: number;
  result?: AgentExecutionResult;
  error?: string;
  retry_count: number;
}

// ============================================================================
// HANDOFF TOOL IMPLEMENTATION
// ============================================================================

export class HandoffTool extends Tool {
  public readonly name: string;
  public readonly description: string;
  public readonly schema: ToolSchema;

  private readonly targetAgent: any;
  private readonly config: HandoffConfig;
  private readonly handoffHistory: Map<string, HandoffExecution[]> = new Map();
  private readonly activeHandoffs: Map<UUID, HandoffExecution> = new Map();

  constructor(targetAgent: any, config: HandoffConfig) {
    super({
      timeout_ms: config.timeout_ms || 120000, // 2 minutes default
      retry_attempts: config.max_retries || 2,
      cache_enabled: false, // Handoffs should not be cached
      logging_enabled: true,
      metrics_enabled: true
    });

    this.targetAgent = targetAgent;
    this.config = {
      preserve_context: true,
      aggregation_strategy: 'merge',
      retry_on_failure: true,
      max_retries: 2,
      ...config
    };

    this.name = config.name || `handoff_to_${this.getAgentName(targetAgent)}`;
    this.description = config.description || `Hand off execution to ${this.getAgentName(targetAgent)} agent`;

    this.schema = {
      name: this.name,
      description: this.description,
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'Message or task to hand off to the target agent'
          },
          context: {
            type: 'object',
            description: 'Additional context to pass to the target agent'
          },
          expected_output: {
            type: 'string',
            description: 'Description of expected output from the target agent'
          },
          priority: {
            type: 'string',
            description: 'Priority level for the handoff',
            enum: ['low', 'normal', 'high', 'urgent']
          },
          timeout_override: {
            type: 'number',
            description: 'Override timeout in milliseconds for this specific handoff'
          },
          preserve_full_context: {
            type: 'boolean',
            description: 'Whether to preserve full conversation context'
          },
          validation_requirements: {
            type: 'array',
            description: 'Specific validation requirements for the handoff result',
            items: {
              type: 'object',
              properties: {
                field: { type: 'string' },
                requirement: { type: 'string' },
                critical: { type: 'boolean' }
              }
            }
          }
        },
        required: ['message']
      }
    };
  }

  // ============================================================================
  // TOOL EXECUTION
  // ============================================================================

  protected async executeInternal(
    parameters: JSONObject,
    context: ToolExecutionContext
  ): Promise<JSONValue> {
    const {
      message,
      context: additionalContext = {},
      expected_output,
      priority = 'normal',
      timeout_override,
      preserve_full_context = this.config.preserve_context,
      validation_requirements = []
    } = parameters;

    // Create handoff execution record
    const handoffExecution: HandoffExecution = {
      id: this.generateUUID(),
      source_agent_id: context.agent_id,
      target_agent_id: this.getAgentId(this.targetAgent),
      handoff_message: message as string,
      context_transferred: this.prepareContext(context, additionalContext as JSONObject, preserve_full_context),
      status: 'pending',
      started_at: new Date().toISOString(),
      retry_count: 0
    };

    try {
      // Validate handoff parameters
      await this.validateHandoff(parameters, context);

      // Register active handoff
      this.activeHandoffs.set(handoffExecution.id, handoffExecution);

      // Execute handoff with retry logic
      const result = await this.executeHandoffWithRetry(handoffExecution, {
        expected_output: expected_output as string,
        priority: priority as string,
        timeout_ms: timeout_override as number,
        validation_requirements: validation_requirements as any[]
      });

      // Process and validate result
      const processedResult = await this.processHandoffResult(result, handoffExecution);

      // Update execution record
      handoffExecution.status = 'completed';
      handoffExecution.completed_at = new Date().toISOString();
      handoffExecution.execution_time_ms = Date.now() - new Date(handoffExecution.started_at).getTime();
      handoffExecution.result = result;

      // Store in history
      this.storeHandoffHistory(context.conversation_id, handoffExecution);

      return {
        handoff_id: handoffExecution.id,
        target_agent: this.getAgentName(this.targetAgent),
        status: 'completed',
        execution_time_ms: handoffExecution.execution_time_ms,
        result: processedResult,
        context_preservation: {
          preserved: preserve_full_context,
          context_size: Object.keys(handoffExecution.context_transferred).length
        },
        quality_metrics: {
          response_completeness: this.assessResponseCompleteness(result, expected_output as string),
          context_utilization: this.assessContextUtilization(result, handoffExecution.context_transferred),
          execution_efficiency: this.assessExecutionEfficiency(handoffExecution)
        },
        metadata: {
          retry_count: handoffExecution.retry_count,
          validation_passed: true,
          handoff_chain: this.getHandoffChain(context.conversation_id)
        }
      };

    } catch (error) {
      return this.handleHandoffError(error, handoffExecution, context);
    } finally {
      // Clean up active handoff
      this.activeHandoffs.delete(handoffExecution.id);
    }
  }

  // ============================================================================
  // HANDOFF EXECUTION LOGIC
  // ============================================================================

  private async executeHandoffWithRetry(
    execution: HandoffExecution,
    options: {
      expected_output?: string;
      priority?: string;
      timeout_ms?: number;
      validation_requirements?: any[];
    }
  ): Promise<AgentExecutionResult> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= (this.config.max_retries || 2); attempt++) {
      execution.retry_count = attempt;
      execution.status = 'executing';

      try {
        // Execute handoff to target agent
        const result = await this.executeTargetAgent(execution, options);

        // Validate result if validation requirements exist
        if (options.validation_requirements && options.validation_requirements.length > 0) {
          await this.validateHandoffResult(result, options.validation_requirements);
        }

        return result;

      } catch (error) {
        lastError = error as Error;

        // Check if we should retry
        if (attempt < (this.config.max_retries || 2) && this.shouldRetry(error)) {
          await this.delay(Math.pow(2, attempt) * 1000); // Exponential backoff
          continue;
        }

        throw error;
      }
    }

    throw lastError || new Error('Handoff execution failed after all retries');
  }

  private async executeTargetAgent(
    execution: HandoffExecution,
    options: {
      expected_output?: string;
      priority?: string;
      timeout_ms?: number;
    }
  ): Promise<AgentExecutionResult> {
    const timeout = options.timeout_ms || this.config.timeout_ms || 120000;

    // Create execution context for target agent
    const targetContext: AgentExecutionContext = {
      conversation_id: `handoff_${execution.id}`,
      step_number: 1,
      execution_path: [`handoff_from_${execution.source_agent_id}`],
      start_time: new Date().toISOString(),
      memory_records: []
    };

    // Prepare message with context
    const message = this.formatHandoffMessage(execution, options.expected_output);

    // Execute target agent with timeout
    const executionPromise = this.callTargetAgent(message, targetContext);
    const timeoutPromise = this.createTimeoutPromise(timeout);

    const result = await Promise.race([executionPromise, timeoutPromise]);

    return result;
  }

  private async callTargetAgent(
    message: string,
    context: AgentExecutionContext
  ): Promise<AgentExecutionResult> {
    // Check if target agent has a run method (RequirementAgent pattern)
    if (typeof this.targetAgent.run === 'function') {
      return await this.targetAgent.run(message, {
        conversation_id: context.conversation_id,
        execution_context: context
      });
    }

    // Check if target agent has an execute method
    if (typeof this.targetAgent.execute === 'function') {
      return await this.targetAgent.execute(message, context);
    }

    // Check if target agent is a service URL (Constella microservice pattern)
    if (typeof this.targetAgent === 'string' && this.targetAgent.startsWith('http')) {
      return await this.callMicroservice(this.targetAgent, message, context);
    }

    throw new Error(`Target agent does not have a compatible execution interface`);
  }

  private async callMicroservice(
    serviceUrl: string,
    message: string,
    context: AgentExecutionContext
  ): Promise<AgentExecutionResult> {
    // Implementation for calling Constella microservices
    const response = await fetch(`${serviceUrl}/execute_task`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.AGENT_BEARER || ''}`
      },
      body: JSON.stringify({
        task_id: context.conversation_id,
        task_type: 'handoff_execution',
        parameters: {
          message,
          context: context
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Microservice call failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    // Convert microservice response to AgentExecutionResult format
    return {
      conversation_id: context.conversation_id,
      agent_id: this.extractAgentIdFromUrl(serviceUrl),
      status: result.status === 'completed' ? 'completed' : 'failed',
      final_response: result.result?.generated_code || result.result?.message || 'Task completed',
      steps: [{
        step_number: 1,
        timestamp: new Date().toISOString(),
        action: 'handoff_execution',
        result: {
          success: result.status === 'completed',
          data: result.result
        },
        violations: []
      }],
      total_steps: 1,
      execution_time_ms: result.metrics?.processing_time_ms || 0,
      tokens_used: result.metrics?.tokens_used || 0
    };
  }

  // ============================================================================
  // CONTEXT AND MESSAGE PREPARATION
  // ============================================================================

  private prepareContext(
    originalContext: ToolExecutionContext,
    additionalContext: JSONObject,
    preserveFullContext: boolean
  ): JSONObject {
    const baseContext = {
      source_agent_id: originalContext.agent_id,
      conversation_id: originalContext.conversation_id,
      step_number: originalContext.step_number,
      handoff_timestamp: new Date().toISOString()
    };

    if (preserveFullContext) {
      return {
        ...baseContext,
        ...additionalContext,
        full_context: originalContext,
        session_data: originalContext.session_data
      };
    }

    return {
      ...baseContext,
      ...additionalContext
    };
  }

  private formatHandoffMessage(
    execution: HandoffExecution,
    expectedOutput?: string
  ): string {
    let message = `Handoff from ${execution.source_agent_id}:\n\n${execution.handoff_message}`;

    if (expectedOutput) {
      message += `\n\nExpected output: ${expectedOutput}`;
    }

    if (Object.keys(execution.context_transferred).length > 0) {
      message += `\n\nContext: ${JSON.stringify(execution.context_transferred, null, 2)}`;
    }

    return message;
  }

  // ============================================================================
  // VALIDATION AND PROCESSING
  // ============================================================================

  private async validateHandoff(
    parameters: JSONObject,
    context: ToolExecutionContext
  ): Promise<void> {
    // Check if target agent is available
    if (!await this.isTargetAgentAvailable()) {
      throw new Error(`Target agent ${this.getAgentName(this.targetAgent)} is not available`);
    }

    // Apply custom validation rules
    if (this.config.validation_rules) {
      for (const rule of this.config.validation_rules) {
        const value = parameters[rule.field];
        if (!rule.validator(value)) {
          throw new Error(`Validation failed: ${rule.error_message}`);
        }
      }
    }

    // Check for circular handoffs
    const handoffChain = this.getHandoffChain(context.conversation_id);
    const targetAgentId = this.getAgentId(this.targetAgent);

    if (handoffChain.includes(targetAgentId)) {
      throw new Error(`Circular handoff detected: ${targetAgentId} is already in the handoff chain`);
    }
  }

  private async validateHandoffResult(
    result: AgentExecutionResult,
    validationRequirements: any[]
  ): Promise<void> {
    for (const requirement of validationRequirements) {
      const { field, requirement: req, critical = false } = requirement;

      // Extract field value from result
      const fieldValue = this.extractFieldFromResult(result, field);

      // Validate requirement
      const isValid = this.validateRequirement(fieldValue, req);

      if (!isValid && critical) {
        throw new Error(`Critical validation failed for field '${field}': ${req}`);
      }
    }
  }

  private async processHandoffResult(
    result: AgentExecutionResult,
    execution: HandoffExecution
  ): Promise<JSONValue> {
    switch (this.config.aggregation_strategy) {
      case 'replace':
        return result.final_response || result;

      case 'merge':
        return {
          handoff_result: result.final_response,
          execution_details: {
            agent_id: result.agent_id,
            steps: result.total_steps,
            execution_time_ms: result.execution_time_ms,
            tokens_used: result.tokens_used
          },
          original_context: execution.context_transferred
        };

      case 'append':
        return {
          previous_context: execution.context_transferred,
          handoff_result: result,
          aggregated_at: new Date().toISOString()
        };

      default:
        return result;
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  private async isTargetAgentAvailable(): Promise<boolean> {
    try {
      // Check if agent has health check method
      if (typeof this.targetAgent.isHealthy === 'function') {
        const health = await this.targetAgent.isHealthy();
        return health.healthy;
      }

      // For microservice URLs, check health endpoint
      if (typeof this.targetAgent === 'string' && this.targetAgent.startsWith('http')) {
        const response = await fetch(`${this.targetAgent}/health`);
        return response.ok;
      }

      return true; // Assume available if no health check available
    } catch {
      return false;
    }
  }

  private shouldRetry(error: Error): boolean {
    if (!this.config.retry_on_failure) return false;

    // Retry on timeout or network errors
    const retryableErrors = ['timeout', 'network', 'connection', 'unavailable'];
    return retryableErrors.some(keyword =>
      error.message.toLowerCase().includes(keyword)
    );
  }

  private getAgentName(agent: any): string {
    if (typeof agent === 'string') {
      if (agent.startsWith('http')) {
        return this.extractAgentNameFromUrl(agent);
      }
      return agent;
    }
    return agent.name || agent.constructor.name || 'unknown';
  }

  private getAgentId(agent: any): string {
    if (typeof agent === 'string') {
      return agent;
    }
    return agent.id || agent.name || agent.constructor.name || 'unknown';
  }

  private extractAgentNameFromUrl(url: string): string {
    const parts = url.split('/');
    return parts[parts.length - 1] || 'microservice';
  }

  private extractAgentIdFromUrl(url: string): string {
    const match = url.match(/localhost:(\d+)/);
    if (match) {
      const portMap: Record<string, string> = {
        '8010': 'designforge',
        '8011': 'securishield',
        '8012': 'codecraft',
        '8013': 'perfpulse',
        '8014': 'evaluator'
      };
      return portMap[match[1]] || `agent_${match[1]}`;
    }
    return this.extractAgentNameFromUrl(url);
  }

  private storeHandoffHistory(conversationId: string, execution: HandoffExecution): void {
    const history = this.handoffHistory.get(conversationId) || [];
    history.push(execution);

    // Keep only last 20 handoffs per conversation
    if (history.length > 20) {
      history.splice(0, history.length - 20);
    }

    this.handoffHistory.set(conversationId, history);
  }

  private getHandoffChain(conversationId: string): string[] {
    const history = this.handoffHistory.get(conversationId) || [];
    return history.map(h => h.target_agent_id);
  }

  private assessResponseCompleteness(result: AgentExecutionResult, expectedOutput?: string): number {
    if (!expectedOutput) return 0.8; // Default good score if no expectation

    const response = result.final_response || '';
    const expectedWords = expectedOutput.toLowerCase().split(/\s+/);
    const responseWords = response.toLowerCase().split(/\s+/);

    const matchingWords = expectedWords.filter(word =>
      responseWords.some(rWord => rWord.includes(word) || word.includes(rWord))
    );

    return expectedWords.length > 0 ? matchingWords.length / expectedWords.length : 0.5;
  }

  private assessContextUtilization(result: AgentExecutionResult, context: JSONObject): number {
    // Simple heuristic: check if context keys appear in response
    const response = JSON.stringify(result).toLowerCase();
    const contextKeys = Object.keys(context);

    if (contextKeys.length === 0) return 1.0;

    const utilizedKeys = contextKeys.filter(key =>
      response.includes(key.toLowerCase())
    );

    return utilizedKeys.length / contextKeys.length;
  }

  private assessExecutionEfficiency(execution: HandoffExecution): number {
    const timeMs = execution.execution_time_ms || 0;
    const retries = execution.retry_count;

    // Penalty for long execution times and retries
    let efficiency = 1.0;
    if (timeMs > 60000) efficiency -= 0.2; // > 1 minute
    if (timeMs > 300000) efficiency -= 0.3; // > 5 minutes
    efficiency -= retries * 0.15; // Penalty for retries

    return Math.max(0, efficiency);
  }

  private extractFieldFromResult(result: AgentExecutionResult, fieldPath: string): any {
    const parts = fieldPath.split('.');
    let value: any = result;

    for (const part of parts) {
      value = value?.[part];
      if (value === undefined) break;
    }

    return value;
  }

  private validateRequirement(value: any, requirement: string): boolean {
    // Simple requirement validation - could be enhanced with more sophisticated logic
    if (requirement === 'exists') return value !== undefined && value !== null;
    if (requirement === 'non_empty') return value && value.toString().trim().length > 0;
    if (requirement.startsWith('min_length:')) {
      const minLength = parseInt(requirement.split(':')[1]);
      return value && value.toString().length >= minLength;
    }

    return true; // Default to valid
  }

  private handleHandoffError(
    error: unknown,
    execution: HandoffExecution,
    context: ToolExecutionContext
  ): JSONValue {
    execution.status = 'failed';
    execution.completed_at = new Date().toISOString();
    execution.execution_time_ms = Date.now() - new Date(execution.started_at).getTime();
    execution.error = error instanceof Error ? error.message : String(error);

    this.storeHandoffHistory(context.conversation_id, execution);

    return {
      handoff_id: execution.id,
      target_agent: this.getAgentName(this.targetAgent),
      status: 'failed',
      error: execution.error,
      execution_time_ms: execution.execution_time_ms,
      retry_count: execution.retry_count,
      recovery_suggestions: [
        'Check target agent availability',
        'Verify handoff parameters',
        'Review agent compatibility',
        'Consider alternative agents'
      ]
    };
  }

  private createTimeoutPromise(timeoutMs: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Handoff timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private generateUUID(): UUID {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // ============================================================================
  // PUBLIC INTERFACE
  // ============================================================================

  /**
   * Get handoff history for a conversation
   */
  public getHandoffHistory(conversationId: string): HandoffExecution[] {
    return this.handoffHistory.get(conversationId) || [];
  }

  /**
   * Get currently active handoffs
   */
  public getActiveHandoffs(): HandoffExecution[] {
    return Array.from(this.activeHandoffs.values());
  }

  /**
   * Cancel an active handoff
   */
  public async cancelHandoff(handoffId: UUID): Promise<boolean> {
    const execution = this.activeHandoffs.get(handoffId);
    if (execution) {
      execution.status = 'failed';
      execution.error = 'Cancelled by user';
      execution.completed_at = new Date().toISOString();
      this.activeHandoffs.delete(handoffId);
      return true;
    }
    return false;
  }

  /**
   * Get handoff statistics
   */
  public getHandoffStats(): {
    total_handoffs: number;
    successful_handoffs: number;
    failed_handoffs: number;
    average_execution_time_ms: number;
    success_rate: number;
  } {
    const allHandoffs = Array.from(this.handoffHistory.values()).flat();
    const successful = allHandoffs.filter(h => h.status === 'completed');
    const failed = allHandoffs.filter(h => h.status === 'failed');

    const avgTime = allHandoffs.length > 0
      ? allHandoffs.reduce((sum, h) => sum + (h.execution_time_ms || 0), 0) / allHandoffs.length
      : 0;

    return {
      total_handoffs: allHandoffs.length,
      successful_handoffs: successful.length,
      failed_handoffs: failed.length,
      average_execution_time_ms: avgTime,
      success_rate: allHandoffs.length > 0 ? successful.length / allHandoffs.length : 0
    };
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export default HandoffTool;
export { HandoffConfig, HandoffExecution };
