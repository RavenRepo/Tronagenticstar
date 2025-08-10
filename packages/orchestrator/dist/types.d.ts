export declare enum TaskType {
    ARCHITECTURE = "ARCHITECTURE",
    SECURITY = "SECURITY",
    QUALITY = "QUALITY",
    PERFORMANCE = "PERFORMANCE",
    DEVOPS = "DEVOPS",
    CODE_GENERATION = "CODE_GENERATION",
    REFACTOR = "REFACTOR",
    EVALUATION = "EVALUATION",
    DESIGN = "DESIGN",
    EMBEDDING = "EMBEDDING",
    PERFORMANCE_ANALYSIS = "PERFORMANCE_ANALYSIS",
    COMPLIANCE = "COMPLIANCE",
    RETRIEVAL = "RETRIEVAL"
}
export interface Task {
    id: string;
    type: TaskType;
    parameters: any;
    correlationId?: string;
    manifestHash?: string;
    priority?: number;
}
export interface AgentMetrics {
    avgResponseTimeMs: number;
    currentLoad: number;
    qualityScore?: number;
    healthStatus?: 'healthy' | 'degraded' | 'unhealthy';
    lastActivity?: Date;
    totalTasksCompleted?: number;
    totalTasksFailed?: number;
    lastSeen?: Date;
}
export interface AgentInfo {
    id: string;
    type?: string;
    address?: string;
    specialization: TaskType;
    capabilities: string[];
    status: AgentStatus;
    metrics: AgentMetrics;
    version?: string;
    metadata?: Record<string, unknown>;
    lastSeen?: Date;
}
export declare enum AgentStatus {
    INITIALIZING = "initializing",
    READY = "ready",
    BUSY = "busy",
    DEGRADED = "degraded",
    UNAVAILABLE = "unavailable",
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
export interface TaskResultMetrics {
    processing_time_ms: number;
    [key: string]: unknown;
}
export interface TaskResult {
    task_id: string;
    status: string;
    result: unknown;
    metrics: TaskResultMetrics;
}
