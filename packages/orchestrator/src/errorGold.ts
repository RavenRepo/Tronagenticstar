import { EventEmitter } from "eventemitter3";
import { ErrorContext, CircuitBreakerConfig, CircuitBreakerState } from "./types.js";

/**
 * ErrorGold SDK - Enterprise error handling and reporting
 */
export class ErrorGoldCollector extends EventEmitter {
  private errorQueue: ErrorContext[] = [];
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private errorStats: Map<string, ErrorStats> = new Map();

  constructor(
    private config: {
      maxQueueSize?: number;
      flushInterval?: number;
      retryAttempts?: number;
      enableCircuitBreaker?: boolean;
    } = {}
  ) {
    super();
    
    // Start background processing
    if (config.flushInterval) {
      setInterval(() => this.flushErrors(), config.flushInterval);
    }
  }

  /**
   * Capture and process an error
   */
  async captureError(context: Omit<ErrorContext, 'timestamp'>): Promise<void> {
    const errorContext: ErrorContext = {
      ...context,
      timestamp: new Date()
    };

    // Update error statistics
    this.updateErrorStats(context.agentId, context.severity);

    // Add to queue
    this.errorQueue.push(errorContext);
    
    // Maintain queue size
    if (this.config.maxQueueSize && this.errorQueue.length > this.config.maxQueueSize) {
      this.errorQueue.shift(); // Remove oldest error
    }

    // Emit for immediate handling
    this.emit('error_captured', errorContext);

    // Update circuit breaker
    if (this.config.enableCircuitBreaker) {
      const cb = this.getOrCreateCircuitBreaker(context.agentId);
      cb.recordFailure();
    }

    // Handle critical errors immediately
    if (context.severity === 'critical') {
      await this.handleCriticalError(errorContext);
    }
  }

  /**
   * Execute a function with error handling
   */
  async safeExecute<T>(
    agentId: string,
    taskId: string,
    fn: () => Promise<T>,
    context?: Record<string, unknown>
  ): Promise<T> {
    const cb = this.getOrCreateCircuitBreaker(agentId);
    
    if (cb.getState() === CircuitBreakerState.OPEN) {
      throw new Error(`Circuit breaker open for agent ${agentId}`);
    }

    try {
      const result = await fn();
      cb.recordSuccess();
      return result;
    } catch (error) {
      await this.captureError({
        taskId,
        agentId,
        error: error as Error,
        context: context || {},
        severity: this.determineSeverity(error as Error)
      });
      
      throw error;
    }
  }

  /**
   * Get error statistics
   */
  getErrorStats(agentId?: string): ErrorStats | Map<string, ErrorStats> {
    if (agentId) {
      return this.errorStats.get(agentId) || new ErrorStats();
    }
    return this.errorStats;
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus(agentId: string): {
    state: CircuitBreakerState;
    failureCount: number;
    lastFailureTime?: Date;
  } {
    const cb = this.circuitBreakers.get(agentId);
    if (!cb) {
      return {
        state: CircuitBreakerState.CLOSED,
        failureCount: 0
      };
    }

    return {
      state: cb.getState(),
      failureCount: cb.getFailureCount(),
      lastFailureTime: cb.getLastFailureTime()
    };
  }

  /**
   * Reset circuit breaker for an agent
   */
  resetCircuitBreaker(agentId: string): void {
    const cb = this.circuitBreakers.get(agentId);
    if (cb) {
      cb.reset();
      this.emit('circuit_breaker_reset', { agentId });
    }
  }

  /**
   * Get recent errors
   */
  getRecentErrors(
    agentId?: string,
    severity?: ErrorContext['severity'],
    limit: number = 100
  ): ErrorContext[] {
    let errors = this.errorQueue;

    if (agentId) {
      errors = errors.filter(e => e.agentId === agentId);
    }

    if (severity) {
      errors = errors.filter(e => e.severity === severity);
    }

    return errors
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Clear error queue
   */
  clearErrors(): void {
    this.errorQueue = [];
    this.emit('errors_cleared');
  }

  /**
   * Export error data for analysis
   */
  exportErrors(format: 'json' | 'csv' = 'json'): string {
    if (format === 'csv') {
      const headers = ['timestamp', 'agentId', 'taskId', 'severity', 'error', 'context'];
      const rows = this.errorQueue.map(error => [
        error.timestamp.toISOString(),
        error.agentId,
        error.taskId,
        error.severity,
        error.error.message,
        JSON.stringify(error.context)
      ]);

      return [headers, ...rows].map(row => row.join(',')).join('\n');
    }

    return JSON.stringify(this.errorQueue, null, 2);
  }

  private getOrCreateCircuitBreaker(agentId: string): CircuitBreaker {
    let cb = this.circuitBreakers.get(agentId);
    if (!cb) {
      cb = new CircuitBreaker({
        failureThreshold: 5,
        recoveryTimeout: 60000, // 1 minute
        monitoringPeriod: 300000 // 5 minutes
      });
      this.circuitBreakers.set(agentId, cb);
    }
    return cb;
  }

  private updateErrorStats(agentId: string, severity: ErrorContext['severity']): void {
    let stats = this.errorStats.get(agentId);
    if (!stats) {
      stats = new ErrorStats();
      this.errorStats.set(agentId, stats);
    }
    stats.recordError(severity);
  }

  private determineSeverity(error: Error): ErrorContext['severity'] {
    const message = error.message.toLowerCase();
    
    if (message.includes('critical') || message.includes('fatal')) {
      return 'critical';
    }
    if (message.includes('error') || message.includes('failed')) {
      return 'high';
    }
    if (message.includes('warning') || message.includes('timeout')) {
      return 'medium';
    }
    return 'low';
  }

  private async handleCriticalError(error: ErrorContext): Promise<void> {
    // Immediate notification for critical errors
    this.emit('critical_error', error);
    
    // Could integrate with external alerting systems here
    console.error('CRITICAL ERROR:', {
      agentId: error.agentId,
      taskId: error.taskId,
      error: error.error.message,
      context: error.context
    });
  }

  private async flushErrors(): Promise<void> {
    if (this.errorQueue.length === 0) return;

    // In a real implementation, this would send errors to a logging service
    this.emit('errors_flushed', {
      count: this.errorQueue.length,
      timestamp: new Date()
    });
  }
}

/**
 * Circuit Breaker implementation
 */
class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount: number = 0;
  private lastFailureTime?: Date;
  private nextAttemptTime?: Date;

  constructor(private config: CircuitBreakerConfig) {}

  recordSuccess(): void {
    this.failureCount = 0;
    this.state = CircuitBreakerState.CLOSED;
  }

  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = new Date();

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitBreakerState.OPEN;
      this.nextAttemptTime = new Date(Date.now() + this.config.recoveryTimeout);
    }
  }

  getState(): CircuitBreakerState {
    if (this.state === CircuitBreakerState.OPEN && this.nextAttemptTime) {
      if (Date.now() >= this.nextAttemptTime.getTime()) {
        this.state = CircuitBreakerState.HALF_OPEN;
      }
    }
    return this.state;
  }

  getFailureCount(): number {
    return this.failureCount;
  }

  getLastFailureTime(): Date | undefined {
    return this.lastFailureTime;
  }

  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = undefined;
    this.nextAttemptTime = undefined;
  }
}

/**
 * Error statistics tracking
 */
class ErrorStats {
  private totalErrors: number = 0;
  private errorsBySeverity: Map<ErrorContext['severity'], number> = new Map();
  private firstError?: Date;
  private lastError?: Date;

  constructor() {
    // Initialize severity counters
    ['low', 'medium', 'high', 'critical'].forEach(severity => {
      this.errorsBySeverity.set(severity as ErrorContext['severity'], 0);
    });
  }

  recordError(severity: ErrorContext['severity']): void {
    this.totalErrors++;
    const current = this.errorsBySeverity.get(severity) || 0;
    this.errorsBySeverity.set(severity, current + 1);

    const now = new Date();
    if (!this.firstError) {
      this.firstError = now;
    }
    this.lastError = now;
  }

  getTotalErrors(): number {
    return this.totalErrors;
  }

  getErrorsBySeverity(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [severity, count] of this.errorsBySeverity.entries()) {
      result[severity] = count;
    }
    return result;
  }

  getErrorRate(periodMs: number = 3600000): number { // Default 1 hour
    if (!this.lastError || this.totalErrors === 0) return 0;
    
    const period = Math.min(periodMs, Date.now() - (this.firstError?.getTime() || 0));
    return (this.totalErrors / period) * 1000; // Errors per second
  }
}
