export type TaskType =
  | "ARCHITECTURE"
  | "SECURITY"
  | "QUALITY"
  | "PERFORMANCE"
  | "DEVOPS";

export interface Task {
  id: string;
  type: TaskType;
  priority: number; // 1 (low) – 10 (critical)
  parameters: Record<string, unknown>;
  deadline?: Date;
}

export interface AgentMetrics {
  avgResponseTimeMs: number;
  currentLoad: number; // 0–1
  qualityScore?: number;
} 