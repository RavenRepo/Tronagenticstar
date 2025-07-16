export declare enum TaskType {
    ARCHITECTURE = "ARCHITECTURE",
    SECURITY = "SECURITY",
    QUALITY = "QUALITY",
    PERFORMANCE = "PERFORMANCE",
    DEVOPS = "DEVOPS"
}
export interface Task {
    id: string;
    type: TaskType;
    priority: number;
    parameters: Record<string, unknown>;
    deadline?: Date;
    correlationId?: string;
    manifestHash?: string;
}
export interface AgentMetrics {
    avgResponseTimeMs: number;
    currentLoad: number;
    qualityScore?: number;
    healthStatus: 'healthy' | 'degraded' | 'unhealthy';
    lastActivity: Date;
}
export interface AgentInfo {
    id: string;
    type: string;
    specialization: TaskType;
    capabilities: string[];
    status: AgentStatus;
    version: string;
    metadata: Record<string, unknown>;
}
export declare enum AgentStatus {
    INITIALIZING = "initializing",
    READY = "ready",
    BUSY = "busy",
    DEGRADED = "degraded",
    FAILED = "failed",
    SHUTTING_DOWN = "shutting_down"
}
export interface MemoryEntry {
    id: string;
    agentId: string;
    timestamp: Date;
    content: unknown;
    tags: string[];
    metadata: Record<string, unknown>;
}
export interface ContextQuery {
    query: string;
    agentId?: string;
    taskType?: TaskType;
    limit?: number;
    filters?: Record<string, unknown>;
}
export interface ErrorContext {
    taskId: string;
    agentId: string;
    error: Error;
    context: Record<string, unknown>;
    timestamp: Date;
    severity: 'low' | 'medium' | 'high' | 'critical';
}
export interface AgentCredentials {
    agentId: string;
    token: string;
    capabilities: string[];
    expiresAt: Date;
}
export interface CircuitBreakerConfig {
    failureThreshold: number;
    recoveryTimeout: number;
    monitoringPeriod: number;
}
export declare enum CircuitBreakerState {
    CLOSED = "closed",
    OPEN = "open",
    HALF_OPEN = "half_open"
}
