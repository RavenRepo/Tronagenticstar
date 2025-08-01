import { BaseAgent } from "./agent.js";
import { AgentFactory } from "./agentFactory.js";
import { Task } from "./types.js";
import fs from "fs";
import path from "path";

/**
 * SpecialistAgent – lightweight helper base class for new domain-specific agents.
 * Provides:
 *   • default async execute wrapper with timing metrics
 *   • helper `simulateWork` for early scaffolds
 */
export abstract class SpecialistAgent extends BaseAgent {
  /** Wrap concrete _execute implementation with basic timing */
  async execute(task: Task): Promise<unknown> {
    const start = Date.now();
    const result = await this._executeSpecialist(task);
    this.updateMetrics({ avgResponseTimeMs: Date.now() - start, lastActivity: new Date() });
    return result;
  }

  /** Agent-specific execution logic */
  protected abstract _executeSpecialist(task: Task): Promise<unknown>;

  /** Utility used by early scaffolds to fake work until real logic lands */
  protected async simulateWork(ms = 250): Promise<void> {
    await new Promise((r) => setTimeout(r, ms));
  }
}

/**
 * registerSpecialist – convenience helper to wire specialist agent classes
 * into the global AgentFactory registry.
 */
export function registerSpecialist(kind: string, cls: typeof SpecialistAgent) {
  AgentFactory.registerAgentType(kind, cls as any);

  // ----- Auto-append to noAgentDupes.md -----
  try {
    const filePath = path.resolve(process.cwd(), "docs", "noAgentDupes.md");
    const entry = `| ${kind} | packages/orchestrator/src/${cls.name}.ts | stub |\n`;
    let content = "";
    if (fs.existsSync(filePath)) {
      content = fs.readFileSync(filePath, "utf-8");
      if (content.includes(`| ${kind} |`)) return; // already listed
    } else {
      content = "# Agent Registry (noAgentDupes)\n\n| Kind | Path | Notes |\n|------|------|-------|\n";
    }
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content + entry);
  } catch {
    /* non-fatal */
  }
} 