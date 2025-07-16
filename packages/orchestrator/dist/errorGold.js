import { EventEmitter } from "eventemitter3";
import { CircuitBreakerState } from "./types.js";
/**
 * ErrorGold SDK - Enterprise error handling and reporting
 */
export class ErrorGoldCollector extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = config;
        this.errorQueue = [];
        this.circuitBreakers = new Map();
        this.errorStats = new Map();
        // Start background processing
        if (config.flushInterval) {
            setInterval(() => this.flushErrors(), config.flushInterval);
        }
    }
    /**
     * Capture and process an error
     */
    async captureError(context) {
        const errorContext = {
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
    async safeExecute(agentId, taskId, fn, context) {
        const cb = this.getOrCreateCircuitBreaker(agentId);
        if (cb.getState() === CircuitBreakerState.OPEN) {
            throw new Error(`Circuit breaker open for agent ${agentId}`);
        }
        try {
            const result = await fn();
            cb.recordSuccess();
            return result;
        }
        catch (error) {
            await this.captureError({
                taskId,
                agentId,
                error: error,
                context: context || {},
                severity: this.determineSeverity(error)
            });
            throw error;
        }
    }
    /**
     * Get error statistics
     */
    getErrorStats(agentId) {
        if (agentId) {
            return this.errorStats.get(agentId) || new ErrorStats();
        }
        return this.errorStats;
    }
    /**
     * Get circuit breaker status
     */
    getCircuitBreakerStatus(agentId) {
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
    resetCircuitBreaker(agentId) {
        const cb = this.circuitBreakers.get(agentId);
        if (cb) {
            cb.reset();
            this.emit('circuit_breaker_reset', { agentId });
        }
    }
    /**
     * Get recent errors
     */
    getRecentErrors(agentId, severity, limit = 100) {
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
    clearErrors() {
        this.errorQueue = [];
        this.emit('errors_cleared');
    }
    /**
     * Export error data for analysis
     */
    exportErrors(format = 'json') {
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
    getOrCreateCircuitBreaker(agentId) {
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
    updateErrorStats(agentId, severity) {
        let stats = this.errorStats.get(agentId);
        if (!stats) {
            stats = new ErrorStats();
            this.errorStats.set(agentId, stats);
        }
        stats.recordError(severity);
    }
    determineSeverity(error) {
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
    async handleCriticalError(error) {
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
    async flushErrors() {
        if (this.errorQueue.length === 0)
            return;
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
    constructor(config) {
        this.config = config;
        this.state = CircuitBreakerState.CLOSED;
        this.failureCount = 0;
    }
    recordSuccess() {
        this.failureCount = 0;
        this.state = CircuitBreakerState.CLOSED;
    }
    recordFailure() {
        this.failureCount++;
        this.lastFailureTime = new Date();
        if (this.failureCount >= this.config.failureThreshold) {
            this.state = CircuitBreakerState.OPEN;
            this.nextAttemptTime = new Date(Date.now() + this.config.recoveryTimeout);
        }
    }
    getState() {
        if (this.state === CircuitBreakerState.OPEN && this.nextAttemptTime) {
            if (Date.now() >= this.nextAttemptTime.getTime()) {
                this.state = CircuitBreakerState.HALF_OPEN;
            }
        }
        return this.state;
    }
    getFailureCount() {
        return this.failureCount;
    }
    getLastFailureTime() {
        return this.lastFailureTime;
    }
    reset() {
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
    constructor() {
        this.totalErrors = 0;
        this.errorsBySeverity = new Map();
        // Initialize severity counters
        ['low', 'medium', 'high', 'critical'].forEach(severity => {
            this.errorsBySeverity.set(severity, 0);
        });
    }
    recordError(severity) {
        this.totalErrors++;
        const current = this.errorsBySeverity.get(severity) || 0;
        this.errorsBySeverity.set(severity, current + 1);
        const now = new Date();
        if (!this.firstError) {
            this.firstError = now;
        }
        this.lastError = now;
    }
    getTotalErrors() {
        return this.totalErrors;
    }
    getErrorsBySeverity() {
        const result = {};
        for (const [severity, count] of this.errorsBySeverity.entries()) {
            result[severity] = count;
        }
        return result;
    }
    getErrorRate(periodMs = 3600000) {
        if (!this.lastError || this.totalErrors === 0)
            return 0;
        const period = Math.min(periodMs, Date.now() - (this.firstError?.getTime() || 0));
        return (this.totalErrors / period) * 1000; // Errors per second
    }
}
