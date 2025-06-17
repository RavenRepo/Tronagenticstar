export type TaskType = "ARCHITECTURE" | "SECURITY" | "QUALITY" | "PERFORMANCE" | "DEVOPS";
export interface Task {
    id: string;
    type: TaskType;
    priority: number;
    parameters: Record<string, unknown>;
    deadline?: Date;
}
export interface AgentMetrics {
    avgResponseTimeMs: number;
    currentLoad: number;
    qualityScore?: number;
}
