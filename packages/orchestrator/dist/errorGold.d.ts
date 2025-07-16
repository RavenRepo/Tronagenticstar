import { EventEmitter } from "eventemitter3";
import { ErrorContext, CircuitBreakerState } from "./types.js";
/**
 * ErrorGold SDK - Enterprise error handling and reporting
 */
export declare class ErrorGoldCollector extends EventEmitter {
    private config;
    private errorQueue;
    private circuitBreakers;
    private errorStats;
    constructor(config?: {
        maxQueueSize?: number;
        flushInterval?: number;
        retryAttempts?: number;
        enableCircuitBreaker?: boolean;
    });
    /**
     * Capture and process an error
     */
    captureError(context: Omit<ErrorContext, 'timestamp'>): Promise<void>;
    /**
     * Execute a function with error handling
     */
    safeExecute<T>(agentId: string, taskId: string, fn: () => Promise<T>, context?: Record<string, unknown>): Promise<T>;
    /**
     * Get error statistics
     */
    getErrorStats(agentId?: string): ErrorStats | Map<string, ErrorStats>;
    /**
     * Get circuit breaker status
     */
    getCircuitBreakerStatus(agentId: string): {
        state: CircuitBreakerState;
        failureCount: number;
        lastFailureTime?: Date;
    };
    /**
     * Reset circuit breaker for an agent
     */
    resetCircuitBreaker(agentId: string): void;
    /**
     * Get recent errors
     */
    getRecentErrors(agentId?: string, severity?: ErrorContext['severity'], limit?: number): ErrorContext[];
    /**
     * Clear error queue
     */
    clearErrors(): void;
    /**
     * Export error data for analysis
     */
    exportErrors(format?: 'json' | 'csv'): string;
    private getOrCreateCircuitBreaker;
    private updateErrorStats;
    private determineSeverity;
    private handleCriticalError;
    private flushErrors;
}
/**
 * Error statistics tracking
 */
declare class ErrorStats {
    private totalErrors;
    private errorsBySeverity;
    private firstError?;
    private lastError?;
    constructor();
    recordError(severity: ErrorContext['severity']): void;
    getTotalErrors(): number;
    getErrorsBySeverity(): Record<string, number>;
    getErrorRate(periodMs?: number): number;
}
export {};
