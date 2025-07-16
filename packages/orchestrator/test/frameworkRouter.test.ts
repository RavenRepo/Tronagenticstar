import { describe, expect, it } from "vitest";
import { FrameworkRouter } from "../src/frameworkRouter.js";
import { BaseAgent } from "../src/agent.js";
import type { Task } from "../src/types.js";

class DummyAgent extends BaseAgent {
  async execute(task: Task): Promise<unknown> {
    return { ok: true, agent: this.id };
  }
}

describe("FrameworkRouter", () => {
  it("selects agent with lowest score", async () => {
    const r = new FrameworkRouter();

    const fastAgent = new DummyAgent({ id: "fast", specialization: "QUALITY" });
    fastAgent["metrics"] = { avgResponseTimeMs: 10, currentLoad: 0.2 } as any;

    const slowAgent = new DummyAgent({ id: "slow", specialization: "QUALITY" });
    slowAgent["metrics"] = { avgResponseTimeMs: 100, currentLoad: 0.1 } as any;

    r.registerAgent(fastAgent);
    r.registerAgent(slowAgent);

    const result = await r.route({
      id: "t1",
      type: "QUALITY",
      priority: 5,
      parameters: {},
    });

    expect((result as any).agent).toBe("fast");
  });
}); 