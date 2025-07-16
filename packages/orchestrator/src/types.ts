export enum TaskType {
  ARCHITECTURE = "ARCHITECTURE",
  SECURITY = "SECURITY", 
  QUALITY = "QUALITY",
  PERFORMANCE = "PERFORMANCE",
  DEVOPS = "DEVOPS"
}

export interface Task {
  id: string;
  type: TaskType;
  priority: number; // 1 (low) – 10 (critical)
  parameters: Record<string, unknown>;
  deadline?: Date;
  correlationId?: string;
  manifestHash?: string;
}

export interface AgentMetrics {
  avgResponseTimeMs: number;
  currentLoad: number; // 0–1
  qualityScore?: number;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy';
  lastActivity: Date;
}

// Agent Registry Types
export interface AgentInfo {
  id: string;
  type: string;
  specialization: TaskType;
  capabilities: string[];
  status: AgentStatus;
  version: string;
  metadata: Record<string, unknown>;
}

export enum AgentStatus {
  INITIALIZING = 'initializing',
  READY = 'ready',
  BUSY = 'busy',
  DEGRADED = 'degraded',
  FAILED = 'failed',
  SHUTTING_DOWN = 'shutting_down'
}

// Memory Bank Types
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

// Error Handling Types
export interface ErrorContext {
  taskId: string;
  agentId: string;
  error: Error;
  context: Record<string, unknown>;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

// Authentication Types
export interface AgentCredentials {
  agentId: string;
  token: string;
  capabilities: string[];
  expiresAt: Date;
}

// Circuit Breaker Types
export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringPeriod: number;
}

export enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open'
}