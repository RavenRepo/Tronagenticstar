/**
 * Constella BeeAI Framework - Requirements System
 *
 * Implements constraint enforcement and rule-based governance for agents.
 * Provides deterministic behavior while preserving reasoning abilities.
 */

import { EventEmitter } from 'eventemitter3';
import {
  RequirementConfig,
  RequirementViolation,
  RequirementViolationError,
  RequirementConfigurationError,
  AgentExecutionContext,
  JSONObject,
  JSONValue,
  UUID,
  Timestamp,
  FrameworkEvent
} from '../types';

// ============================================================================
// REQUIREMENT ENFORCEMENT TYPES
// ============================================================================

export interface RequirementEnforcementResult {
  allowed: boolean;
  modified_parameters?: JSONObject;
  enforcement_actions?: string[];
  violation?: RequirementViolation;
  metadata?: JSONObject;
}

export interface RequirementCheckContext {
  step_number: number;
  action: string;
  parameters: JSONObject;
  execution_context: AgentExecutionContext;
  previous_violations: RequirementViolation[];
  agent_state?: JSONObject;
}

// ============================================================================
// BASE REQUIREMENT CLASS
// ============================================================================

export abstract class Requirement extends EventEmitter {
  public abstract readonly config: RequirementConfig;

  protected readonly violationHistory: Map<string, RequirementViolation[]> = new Map();
  protected readonly enforcementMetrics: Map<string, number> = new Map();

  constructor() {
    super();
    this.validateConfiguration();
  }

  // ============================================================================
  // ABSTRACT METHODS (must be implemented by subclasses)
  // ============================================================================

  /**
   * Check if the requirement is violated by the proposed action
   */
  public abstract check(
    context: RequirementCheckContext
  ): Promise<RequirementViolation | null>;

  /**
   * Enforce the requirement by modifying parameters or blocking execution
   */
  public abstract enforce(
    context: RequirementCheckContext
  ): Promise<RequirementEnforcementResult>;

  // ============================================================================
  // PUBLIC INTERFACE
  // ============================================================================

  /**
   * Evaluate requirement and return enforcement decision
   */
  public async evaluate(context: RequirementCheckContext): Promise<RequirementEnforcementResult> {
    try {
      // Check if requirement should be enforced at this step
      if (!this.shouldEnforceAtStep(context.step_number)) {
        return { allowed: true };
      }

      // Check for violation
      const violation = await this.check(context);

      if (!violation) {
        // No violation - allow execution
        this.recordSuccessfulCheck(context);
        return { allowed: true };
      }

      // Handle violation based on severity and configuration
      return await this.handleViolation(violation, context);

    } catch (error) {
      // Log error and allow execution by default (fail-open for stability)
      this.emitEvent('requirement.evaluation_error', {
        requirement_name: this.config.name,
        error: error instanceof Error ? error.message : String(error),
        context: context
      });

      return {
        allowed: true,
        metadata: {
          evaluation_error: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  /**
   * Force enforcement at a specific step (for ConditionalRequirement pattern)
   */
  public async forceAtStep(
    step_number: number,
    context: RequirementCheckContext
  ): Promise<RequirementEnforcementResult> {
    if (this.config.force_at_step === step_number) {
      return await this.enforce(context);
    }
    return { allowed: true };
  }

  /**
   * Get violation history for an agent
   */
  public getViolationHistory(agent_id: string): RequirementViolation[] {
    return this.violationHistory.get(agent_id) || [];
  }

  /**
   * Get enforcement metrics
   */
  public getMetrics(): {
    total_checks: number;
    total_violations: number;
    total_enforcements: number;
    violation_rate: number;
    enforcement_rate: number;
  } {
    const totalChecks = this.enforcementMetrics.get('total_checks') || 0;
    const totalViolations = this.enforcementMetrics.get('total_violations') || 0;
    const totalEnforcements = this.enforcementMetrics.get('total_enforcements') || 0;

    return {
      total_checks: totalChecks,
      total_violations: totalViolations,
      total_enforcements: totalEnforcements,
      violation_rate: totalChecks > 0 ? totalViolations / totalChecks : 0,
      enforcement_rate: totalViolations > 0 ? totalEnforcements / totalViolations : 0
    };
  }

  /**
   * Clear violation history (useful for testing or agent resets)
   */
  public clearViolationHistory(agent_id?: string): void {
    if (agent_id) {
      this.violationHistory.delete(agent_id);
    } else {
      this.violationHistory.clear();
    }
  }

  // ============================================================================
  // PROTECTED HELPER METHODS
  // ============================================================================

  protected shouldEnforceAtStep(step_number: number): boolean {
    if (this.config.enforce_at_step !== undefined) {
      return step_number >= this.config.enforce_at_step;
    }
    return true; // Enforce at all steps by default
  }

  protected createViolation(
    step_number: number,
    violation_type: string,
    message: string,
    suggested_action?: string
  ): RequirementViolation {
    return {
      requirement_name: this.config.name,
      step_number,
      violation_type,
      message,
      severity: this.config.severity,
      timestamp: new Date().toISOString(),
      suggested_action
    };
  }

  protected recordViolation(violation: RequirementViolation, agent_id: string): void {
    const history = this.violationHistory.get(agent_id) || [];
    history.push(violation);

    // Keep only last 100 violations per agent
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }

    this.violationHistory.set(agent_id, history);
    this.incrementMetric('total_violations');
  }

  protected recordSuccessfulCheck(context: RequirementCheckContext): void {
    this.incrementMetric('total_checks');

    this.emitEvent('requirement.check_passed', {
      requirement_name: this.config.name,
      agent_id: context.execution_context.conversation_id,
      step_number: context.step_number
    });
  }

  protected incrementMetric(metric: string): void {
    const current = this.enforcementMetrics.get(metric) || 0;
    this.enforcementMetrics.set(metric, current + 1);
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private validateConfiguration(): void {
    if (!this.config.name || this.config.name.trim() === '') {
      throw new RequirementConfigurationError('', 'Requirement name is required');
    }

    if (!['low', 'medium', 'high', 'critical'].includes(this.config.severity)) {
      throw new RequirementConfigurationError(
        this.config.name,
        `Invalid severity: ${this.config.severity}`
      );
    }

    if (this.config.max_violations !== undefined && this.config.max_violations < 0) {
      throw new RequirementConfigurationError(
        this.config.name,
        'max_violations must be non-negative'
      );
    }
  }

  private async handleViolation(
    violation: RequirementViolation,
    context: RequirementCheckContext
  ): Promise<RequirementEnforcementResult> {
    const agent_id = context.execution_context.conversation_id;

    // Record the violation
    this.recordViolation(violation, agent_id);

    // Check if we've exceeded max violations
    if (this.config.max_violations !== undefined) {
      const violationCount = this.getViolationHistory(agent_id).length;
      if (violationCount > this.config.max_violations) {
        this.emitEvent('requirement.max_violations_exceeded', {
          requirement_name: this.config.name,
          agent_id,
          violation_count: violationCount,
          max_violations: this.config.max_violations
        });

        return {
          allowed: false,
          violation,
          metadata: {
            max_violations_exceeded: true,
            violation_count: violationCount
          }
        };
      }
    }

    // Attempt enforcement based on severity
    switch (violation.severity) {
      case 'critical':
        // Critical violations block execution
        this.emitEvent('requirement.violation_critical', {
          requirement_name: this.config.name,
          violation,
          agent_id
        });
        return {
          allowed: false,
          violation,
          enforcement_actions: ['execution_blocked']
        };

      case 'high':
        // High severity violations trigger enforcement
        const enforcementResult = await this.enforce(context);
        this.incrementMetric('total_enforcements');

        this.emitEvent('requirement.violation_enforced', {
          requirement_name: this.config.name,
          violation,
          enforcement_result: enforcementResult,
          agent_id
        });

        return {
          ...enforcementResult,
          violation,
          enforcement_actions: [...(enforcementResult.enforcement_actions || []), 'parameters_modified']
        };

      case 'medium':
        // Medium severity violations log warning but allow execution
        this.emitEvent('requirement.violation_warning', {
          requirement_name: this.config.name,
          violation,
          agent_id
        });

        return {
          allowed: true,
          violation,
          enforcement_actions: ['warning_logged']
        };

      case 'low':
        // Low severity violations are just recorded
        this.emitEvent('requirement.violation_info', {
          requirement_name: this.config.name,
          violation,
          agent_id
        });

        return {
          allowed: true,
          violation,
          enforcement_actions: ['violation_recorded']
        };

      default:
        // Default to allowing execution
        return {
          allowed: true,
          violation
        };
    }
  }

  private emitEvent(type: string, data: JSONObject): void {
    const event: FrameworkEvent = {
      id: this.generateUUID(),
      type,
      timestamp: new Date().toISOString(),
      source: `requirement.${this.config.name}`,
      version: '1.0',
      severity: type.includes('critical') ? 'critical' : type.includes('warning') ? 'warn' : 'info',
      category: 'system',
      data
    };

    this.emit('event', event);
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
// CONDITIONAL REQUIREMENT (BeeAI Pattern)
// ============================================================================

export class ConditionalRequirement extends Requirement {
  public readonly config: RequirementConfig;
  private readonly toolClass: any;
  private readonly condition?: (context: RequirementCheckContext) => boolean;

  constructor(
    toolClass: any,
    options: {
      force_at_step?: number;
      enforce_at_step?: number;
      condition?: (context: RequirementCheckContext) => boolean;
      severity?: 'low' | 'medium' | 'high' | 'critical';
      max_violations?: number;
    } = {}
  ) {
    super();

    this.toolClass = toolClass;
    this.condition = options.condition;
    this.config = {
      name: `conditional_${toolClass.name || 'unknown'}`,
      description: `Conditional requirement for ${toolClass.name || 'tool'}`,
      force_at_step: options.force_at_step,
      enforce_at_step: options.enforce_at_step,
      severity: options.severity || 'medium',
      max_violations: options.max_violations
    };
  }

  public async check(context: RequirementCheckContext): Promise<RequirementViolation | null> {
    // If this is the forced step, and the tool is not being used, that's a violation
    if (this.config.force_at_step === context.step_number) {
      const isUsingRequiredTool = this.isUsingRequiredTool(context);

      if (!isUsingRequiredTool) {
        return this.createViolation(
          context.step_number,
          'missing_required_tool',
          `Tool '${this.toolClass.name}' is required at step ${context.step_number}`,
          `Use the ${this.toolClass.name} tool before proceeding`
        );
      }
    }

    // If there's a custom condition, check it
    if (this.condition && !this.condition(context)) {
      return this.createViolation(
        context.step_number,
        'condition_not_met',
        `Custom condition not met for requirement '${this.config.name}'`,
        'Review the requirement condition and adjust agent behavior'
      );
    }

    return null; // No violation
  }

  public async enforce(context: RequirementCheckContext): Promise<RequirementEnforcementResult> {
    if (this.config.force_at_step === context.step_number) {
      // Force the use of the required tool
      const modifiedParameters = {
        ...context.parameters,
        tool_name: this.toolClass.name,
        forced_by_requirement: true
      };

      return {
        allowed: true,
        modified_parameters: modifiedParameters,
        enforcement_actions: ['tool_forced'],
        metadata: {
          forced_tool: this.toolClass.name,
          original_parameters: context.parameters
        }
      };
    }

    return { allowed: true };
  }

  private isUsingRequiredTool(context: RequirementCheckContext): boolean {
    // Check if the current action involves using the required tool
    return (
      context.action === 'tool_call' &&
      context.parameters.tool_name === this.toolClass.name
    );
  }
}

// ============================================================================
// SEQUENCE REQUIREMENT
// ============================================================================

export class SequenceRequirement extends Requirement {
  public readonly config: RequirementConfig;
  private readonly requiredSequence: string[];
  private readonly agentSequenceState: Map<string, string[]> = new Map();

  constructor(
    requiredSequence: string[],
    options: {
      name?: string;
      severity?: 'low' | 'medium' | 'high' | 'critical';
      max_violations?: number;
    } = {}
  ) {
    super();

    this.requiredSequence = requiredSequence;
    this.config = {
      name: options.name || `sequence_${requiredSequence.join('_')}`,
      description: `Enforces sequence: ${requiredSequence.join(' -> ')}`,
      severity: options.severity || 'medium',
      max_violations: options.max_violations
    };
  }

  public async check(context: RequirementCheckContext): Promise<RequirementViolation | null> {
    const agent_id = context.execution_context.conversation_id;
    const currentSequence = this.agentSequenceState.get(agent_id) || [];

    // Determine the expected next action in sequence
    const expectedNextIndex = currentSequence.length;

    if (expectedNextIndex >= this.requiredSequence.length) {
      // Sequence is complete, reset for next cycle
      this.agentSequenceState.set(agent_id, []);
      return null;
    }

    const expectedAction = this.requiredSequence[expectedNextIndex];
    const currentAction = this.getCurrentAction(context);

    if (currentAction !== expectedAction) {
      return this.createViolation(
        context.step_number,
        'sequence_violation',
        `Expected action '${expectedAction}' but got '${currentAction}' at position ${expectedNextIndex}`,
        `Follow the required sequence: ${this.requiredSequence.join(' -> ')}`
      );
    }

    return null;
  }

  public async enforce(context: RequirementCheckContext): Promise<RequirementEnforcementResult> {
    const agent_id = context.execution_context.conversation_id;
    const currentSequence = this.agentSequenceState.get(agent_id) || [];
    const expectedNextIndex = currentSequence.length;

    if (expectedNextIndex < this.requiredSequence.length) {
      const expectedAction = this.requiredSequence[expectedNextIndex];

      // Update the sequence state
      currentSequence.push(expectedAction);
      this.agentSequenceState.set(agent_id, currentSequence);

      // Modify parameters to enforce the correct action
      const modifiedParameters = {
        ...context.parameters,
        action: expectedAction,
        enforced_by_sequence: true
      };

      return {
        allowed: true,
        modified_parameters: modifiedParameters,
        enforcement_actions: ['sequence_enforced'],
        metadata: {
          expected_action: expectedAction,
          sequence_position: expectedNextIndex,
          remaining_sequence: this.requiredSequence.slice(expectedNextIndex + 1)
        }
      };
    }

    return { allowed: true };
  }

  private getCurrentAction(context: RequirementCheckContext): string {
    if (context.action === 'tool_call' && context.parameters.tool_name) {
      return context.parameters.tool_name as string;
    }
    return context.action;
  }
}

// ============================================================================
// RATE LIMIT REQUIREMENT
// ============================================================================

export class RateLimitRequirement extends Requirement {
  public readonly config: RequirementConfig;
  private readonly maxCalls: number;
  private readonly timeWindowMs: number;
  private readonly callHistory: Map<string, number[]> = new Map();

  constructor(
    maxCalls: number,
    timeWindowMs: number,
    options: {
      name?: string;
      severity?: 'low' | 'medium' | 'high' | 'critical';
    } = {}
  ) {
    super();

    this.maxCalls = maxCalls;
    this.timeWindowMs = timeWindowMs;
    this.config = {
      name: options.name || `rate_limit_${maxCalls}_per_${timeWindowMs}ms`,
      description: `Rate limit: ${maxCalls} calls per ${timeWindowMs}ms`,
      severity: options.severity || 'high'
    };
  }

  public async check(context: RequirementCheckContext): Promise<RequirementViolation | null> {
    const agent_id = context.execution_context.conversation_id;
    const now = Date.now();
    const history = this.callHistory.get(agent_id) || [];

    // Clean up old entries
    const recentCalls = history.filter(timestamp => now - timestamp < this.timeWindowMs);
    this.callHistory.set(agent_id, recentCalls);

    if (recentCalls.length >= this.maxCalls) {
      return this.createViolation(
        context.step_number,
        'rate_limit_exceeded',
        `Rate limit exceeded: ${recentCalls.length}/${this.maxCalls} calls in ${this.timeWindowMs}ms window`,
        `Wait ${this.timeWindowMs}ms before making more calls`
      );
    }

    return null;
  }

  public async enforce(context: RequirementCheckContext): Promise<RequirementEnforcementResult> {
    // Record the call
    const agent_id = context.execution_context.conversation_id;
    const history = this.callHistory.get(agent_id) || [];
    history.push(Date.now());
    this.callHistory.set(agent_id, history);

    return {
      allowed: true,
      enforcement_actions: ['call_recorded'],
      metadata: {
        calls_in_window: history.length,
        max_calls: this.maxCalls
      }
    };
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export {
  RequirementCheckContext,
  RequirementEnforcementResult
};

export default Requirement;
