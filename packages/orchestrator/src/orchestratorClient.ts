import type { Task, TaskType } from "./types.js";

export interface OrchestratorClientOptions {
  baseUrl?: string; // e.g. http://localhost:8000
}

export class OrchestratorClient {
  private readonly baseUrl: string;

  constructor(opts: OrchestratorClientOptions = {}) {
    this.baseUrl = opts.baseUrl ?? process.env.ORCH_URL ?? "http://localhost:8000";
  }

  async submitTask(task: Omit<Task, "id">): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task_type: task.type,
        parameters: task.parameters,
        priority: task.priority,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Orchestrator error ${res.status}: ${text}`);
    }
    return res.json();
  }
} 