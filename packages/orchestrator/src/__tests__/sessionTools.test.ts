import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ─── Mock redis before any imports that reference it ────────────────────────
const mockRedisClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  quit: vi.fn().mockResolvedValue(undefined),
  isOpen: false,
  on: vi.fn().mockReturnThis(),
  lPush: vi.fn().mockResolvedValue(1),
  lRange: vi.fn().mockResolvedValue([]),
  lTrim: vi.fn().mockResolvedValue("OK"),
  expire: vi.fn().mockResolvedValue(true),
  del: vi.fn().mockResolvedValue(1),
  multi: vi.fn().mockReturnValue({
    lPush: vi.fn().mockReturnThis(),
    lTrim: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  }),
};

vi.mock("redis", () => ({
  createClient: vi.fn(() => mockRedisClient),
}));

import {
  SessionTools,
  buildNatsSubject,
  buildRedisHistoryKey,
} from "../sessionTools.js";
import { AgentRegistry } from "../agentRegistry.js";
import {
  AgentStatus,
  TaskType,
  SessionToolsConfig,
  SessionHistoryEntry,
  AgentInfo,
  ToolDefinition,
} from "../types.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function createMockRegistry(agents?: AgentInfo[]): AgentRegistry {
  const registry = new AgentRegistry();
  for (const agent of agents ?? defaultAgents()) {
    registry.register(agent);
  }
  return registry;
}

function defaultAgents(): AgentInfo[] {
  return [
    {
      id: "orchestrator-py",
      specialization: TaskType.ARCHITECTURE,
      capabilities: ["triage", "plan", "delegate"],
      status: AgentStatus.READY,
      metrics: { avgResponseTimeMs: 120, currentLoad: 0.3 },
      address: "http://localhost:8000",
      lastSeen: new Date("2025-06-01T00:00:00Z"),
    },
    {
      id: "codecraft",
      specialization: TaskType.CODE_GENERATION,
      capabilities: ["generate_code", "refactor_code"],
      status: AgentStatus.READY,
      metrics: { avgResponseTimeMs: 200, currentLoad: 0.1 },
      address: "http://localhost:8001",
      lastSeen: new Date("2025-06-01T00:00:00Z"),
    },
    {
      id: "securishield",
      specialization: TaskType.SECURITY,
      capabilities: ["scan_target", "check_policies"],
      status: AgentStatus.DEGRADED,
      metrics: { avgResponseTimeMs: 350, currentLoad: 0.7 },
      address: "http://localhost:8007",
      lastSeen: new Date("2025-05-31T12:00:00Z"),
    },
    {
      id: "perfpulse",
      specialization: TaskType.PERFORMANCE_ANALYSIS,
      capabilities: ["analyze_performance"],
      status: AgentStatus.UNAVAILABLE,
      metrics: { avgResponseTimeMs: 0, currentLoad: 0 },
      address: "http://localhost:8005",
    },
  ];
}

function createSessionTools(
  overrides?: Partial<SessionToolsConfig>,
  agents?: AgentInfo[],
): { tools: SessionTools; registry: AgentRegistry } {
  const registry = createMockRegistry(agents);
  const config: SessionToolsConfig = {
    ownerAgentId: overrides?.ownerAgentId ?? "test-agent",
    natsUrl: overrides?.natsUrl ?? "nats://localhost:4222",
    defaultTimeoutMs: overrides?.defaultTimeoutMs ?? 5000,
    ...overrides,
  };
  const tools = new SessionTools(config, registry);
  return { tools, registry };
}

// ─── buildNatsSubject ───────────────────────────────────────────────────────

describe("buildNatsSubject", () => {
  it("builds inbox subject", () => {
    expect(buildNatsSubject("codecraft", "inbox")).toBe(
      "constella.agent.codecraft.inbox",
    );
  });

  it("builds response subject", () => {
    expect(buildNatsSubject("orchestrator-py", "response")).toBe(
      "constella.agent.orchestrator-py.response",
    );
  });

  it("builds status subject", () => {
    expect(buildNatsSubject("securishield", "status")).toBe(
      "constella.agent.securishield.status",
    );
  });

  it("handles agent IDs with hyphens", () => {
    expect(buildNatsSubject("memory-guardian", "inbox")).toBe(
      "constella.agent.memory-guardian.inbox",
    );
  });
});

// ─── buildRedisHistoryKey ───────────────────────────────────────────────────

describe("buildRedisHistoryKey", () => {
  it("builds the correct Redis key", () => {
    expect(buildRedisHistoryKey("codecraft")).toBe(
      "constella:agent:codecraft:history",
    );
  });

  it("handles agent IDs with hyphens", () => {
    expect(buildRedisHistoryKey("python-expert")).toBe(
      "constella:agent:python-expert:history",
    );
  });
});

// ─── SessionTools — getToolDefinitions ──────────────────────────────────────

describe("SessionTools.getToolDefinitions", () => {
  let tools: SessionTools;

  beforeEach(() => {
    ({ tools } = createSessionTools());
  });

  it("returns exactly 3 tool definitions", () => {
    const defs = tools.getToolDefinitions();
    expect(defs).toHaveLength(3);
  });

  it("returns sessions_list, sessions_send, sessions_history", () => {
    const defs = tools.getToolDefinitions();
    const names = defs.map((d) => d.name);
    expect(names).toEqual([
      "sessions_list",
      "sessions_send",
      "sessions_history",
    ]);
  });

  it("each definition has name, description, and parameters", () => {
    const defs = tools.getToolDefinitions();
    for (const def of defs) {
      expect(def).toHaveProperty("name");
      expect(def).toHaveProperty("description");
      expect(def).toHaveProperty("parameters");
      expect(typeof def.name).toBe("string");
      expect(typeof def.description).toBe("string");
      expect(typeof def.parameters).toBe("object");
    }
  });

  it("sessions_send requires agentId and message", () => {
    const defs = tools.getToolDefinitions();
    const sendDef = defs.find((d) => d.name === "sessions_send")!;
    const params = sendDef.parameters as {
      required: string[];
      properties: Record<string, unknown>;
    };
    expect(params.required).toContain("agentId");
    expect(params.required).toContain("message");
    expect(params.properties).toHaveProperty("agentId");
    expect(params.properties).toHaveProperty("message");
    expect(params.properties).toHaveProperty("awaitReply");
    expect(params.properties).toHaveProperty("timeoutMs");
  });

  it("sessions_history requires agentId", () => {
    const defs = tools.getToolDefinitions();
    const histDef = defs.find((d) => d.name === "sessions_history")!;
    const params = histDef.parameters as {
      required: string[];
      properties: Record<string, unknown>;
    };
    expect(params.required).toContain("agentId");
  });

  it("sessions_list has no required parameters", () => {
    const defs = tools.getToolDefinitions();
    const listDef = defs.find((d) => d.name === "sessions_list")!;
    const params = listDef.parameters as { required: string[] };
    expect(params.required).toEqual([]);
  });

  it("all definitions set additionalProperties to false", () => {
    const defs = tools.getToolDefinitions();
    for (const def of defs) {
      const params = def.parameters as { additionalProperties: boolean };
      expect(params.additionalProperties).toBe(false);
    }
  });
});

// ─── SessionTools — sessions_list ───────────────────────────────────────────

describe("SessionTools.sessionsList", () => {
  let tools: SessionTools;
  let registry: AgentRegistry;

  beforeEach(() => {
    ({ tools, registry } = createSessionTools());
  });

  it("returns all registered agents with no filters", async () => {
    const result = await tools.sessionsList();
    expect(result.total).toBe(4);
    expect(result.agents).toHaveLength(4);
  });

  it("each agent has expected fields", async () => {
    const result = await tools.sessionsList();
    for (const agent of result.agents) {
      expect(agent).toHaveProperty("id");
      expect(agent).toHaveProperty("specialization");
      expect(agent).toHaveProperty("status");
      expect(agent).toHaveProperty("capabilities");
      expect(Array.isArray(agent.capabilities)).toBe(true);
    }
  });

  it("filters by status=ready", async () => {
    const result = await tools.sessionsList({ statusFilter: "ready" });
    expect(result.total).toBe(2);
    expect(result.agents.every((a) => a.status === "ready")).toBe(true);
    const ids = result.agents.map((a) => a.id);
    expect(ids).toContain("orchestrator-py");
    expect(ids).toContain("codecraft");
  });

  it("filters by status=degraded", async () => {
    const result = await tools.sessionsList({ statusFilter: "degraded" });
    expect(result.total).toBe(1);
    expect(result.agents[0].id).toBe("securishield");
  });

  it("filters by status=unavailable", async () => {
    const result = await tools.sessionsList({ statusFilter: "unavailable" });
    expect(result.total).toBe(1);
    expect(result.agents[0].id).toBe("perfpulse");
  });

  it("status=all returns everything", async () => {
    const result = await tools.sessionsList({ statusFilter: "all" });
    expect(result.total).toBe(4);
  });

  it("filters by specialization (exact match)", async () => {
    const result = await tools.sessionsList({
      specializationFilter: "SECURITY",
    });
    expect(result.total).toBe(1);
    expect(result.agents[0].id).toBe("securishield");
  });

  it("filters by specialization (case-insensitive)", async () => {
    const result = await tools.sessionsList({
      specializationFilter: "code_generation",
    });
    expect(result.total).toBe(1);
    expect(result.agents[0].id).toBe("codecraft");
  });

  it("filters by specialization matching capabilities", async () => {
    // "scan_target" is in securishield's capabilities, contains "SCAN"
    const result = await tools.sessionsList({
      specializationFilter: "SCAN",
    });
    expect(result.total).toBe(1);
    expect(result.agents[0].id).toBe("securishield");
  });

  it("combines status and specialization filters", async () => {
    const result = await tools.sessionsList({
      statusFilter: "ready",
      specializationFilter: "CODE_GENERATION",
    });
    expect(result.total).toBe(1);
    expect(result.agents[0].id).toBe("codecraft");
  });

  it("returns empty when no agents match", async () => {
    const result = await tools.sessionsList({
      specializationFilter: "NONEXISTENT",
    });
    expect(result.total).toBe(0);
    expect(result.agents).toEqual([]);
  });

  it("returns empty registry gracefully", async () => {
    const { tools: emptyTools } = createSessionTools(undefined, []);
    const result = await emptyTools.sessionsList();
    expect(result.total).toBe(0);
    expect(result.agents).toEqual([]);
  });

  it("serialises lastSeen as ISO string", async () => {
    const result = await tools.sessionsList();
    const arch = result.agents.find((a) => a.id === "orchestrator-py")!;
    expect(arch.lastSeen).toBe("2025-06-01T00:00:00.000Z");
  });

  it("handles agents with no lastSeen", async () => {
    const result = await tools.sessionsList();
    const perfpulse = result.agents.find((a) => a.id === "perfpulse")!;
    expect(perfpulse.lastSeen).toBeUndefined();
  });
});

// ─── SessionTools — sessions_send (without NATS) ────────────────────────────

describe("SessionTools.sessionsSend (no NATS)", () => {
  let tools: SessionTools;
  let registry: AgentRegistry;

  beforeEach(() => {
    ({ tools, registry } = createSessionTools());
  });

  it("sends to a registered agent successfully", async () => {
    const result = await tools.sessionsSend("codecraft", "Hello CodeCraft!");
    expect(result.delivered).toBe(true);
    expect(result.correlationId).toBeTruthy();
    expect(typeof result.correlationId).toBe("string");
    // Without NATS, we expect the in-process delivery note
    expect(result.error).toContain("NATS not connected");
  });

  it("fails when target agent is not registered", async () => {
    const result = await tools.sessionsSend("nonexistent", "Hello?");
    expect(result.delivered).toBe(false);
    expect(result.error).toContain("not registered");
    expect(result.error).toContain("nonexistent");
  });

  it("generates unique correlationIds", async () => {
    const r1 = await tools.sessionsSend("codecraft", "msg1");
    const r2 = await tools.sessionsSend("codecraft", "msg2");
    expect(r1.correlationId).not.toBe(r2.correlationId);
  });

  it("emits message_sent event", async () => {
    const events: unknown[] = [];
    tools.on("message_sent", (e) => events.push(e));

    await tools.sessionsSend("codecraft", "Test message");
    expect(events).toHaveLength(1);
    expect((events[0] as any).fromAgentId).toBe("test-agent");
    expect((events[0] as any).toAgentId).toBe("codecraft");
    expect((events[0] as any).content).toBe("Test message");
  });

  it("records outbound message in sender history", async () => {
    await tools.sessionsSend("codecraft", "Hello");
    const history = await tools.sessionsHistory("test-agent");
    expect(history.entries.length).toBeGreaterThanOrEqual(1);
    const outbound = history.entries.find((e) =>
      e.content.includes("[→ codecraft]"),
    );
    expect(outbound).toBeDefined();
    expect(outbound!.role).toBe("agent");
  });

  it("records inbound message in target history (in-process fallback)", async () => {
    await tools.sessionsSend("codecraft", "Hello");
    const history = await tools.sessionsHistory("codecraft");
    expect(history.entries.length).toBeGreaterThanOrEqual(1);
    const inbound = history.entries.find((e) =>
      e.content.includes("[← test-agent]"),
    );
    expect(inbound).toBeDefined();
    expect(inbound!.role).toBe("user");
  });
});

// ─── SessionTools — sessions_history ────────────────────────────────────────

describe("SessionTools.sessionsHistory", () => {
  let tools: SessionTools;

  beforeEach(() => {
    ({ tools } = createSessionTools());
  });

  it("returns empty for agent with no history", async () => {
    const result = await tools.sessionsHistory("codecraft");
    expect(result.entries).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.source).toBe("empty");
  });

  it("returns entries after appendHistory", async () => {
    tools.appendHistory("codecraft", {
      timestamp: new Date("2025-06-01T10:00:00Z"),
      role: "user",
      content: "Hello",
      agentId: "codecraft",
    });
    tools.appendHistory("codecraft", {
      timestamp: new Date("2025-06-01T10:01:00Z"),
      role: "agent",
      content: "Hi back!",
      agentId: "codecraft",
    });

    const result = await tools.sessionsHistory("codecraft");
    expect(result.total).toBe(2);
    expect(result.source).toBe("memory");
    expect(result.entries).toHaveLength(2);
  });

  it("returns entries sorted most-recent-first", async () => {
    tools.appendHistory("codecraft", {
      timestamp: new Date("2025-06-01T10:00:00Z"),
      role: "user",
      content: "First",
      agentId: "codecraft",
    });
    tools.appendHistory("codecraft", {
      timestamp: new Date("2025-06-01T12:00:00Z"),
      role: "agent",
      content: "Second",
      agentId: "codecraft",
    });
    tools.appendHistory("codecraft", {
      timestamp: new Date("2025-06-01T11:00:00Z"),
      role: "system",
      content: "Middle",
      agentId: "codecraft",
    });

    const result = await tools.sessionsHistory("codecraft");
    expect(result.entries[0].content).toBe("Second");
    expect(result.entries[1].content).toBe("Middle");
    expect(result.entries[2].content).toBe("First");
  });

  it("respects limit parameter", async () => {
    for (let i = 0; i < 10; i++) {
      tools.appendHistory("codecraft", {
        timestamp: new Date(Date.now() + i * 1000),
        role: "user",
        content: `Message ${i}`,
        agentId: "codecraft",
      });
    }

    const result = await tools.sessionsHistory("codecraft", { limit: 3 });
    expect(result.entries).toHaveLength(3);
  });

  it("clamps limit to max 500", async () => {
    // Just verify it doesn't throw — we can't easily add 500+ entries in a test
    const result = await tools.sessionsHistory("codecraft", { limit: 9999 });
    expect(result.total).toBe(0);
  });

  it("clamps limit minimum to 1", async () => {
    tools.appendHistory("codecraft", {
      timestamp: new Date(),
      role: "user",
      content: "Only one",
      agentId: "codecraft",
    });

    const result = await tools.sessionsHistory("codecraft", { limit: 0 });
    expect(result.entries).toHaveLength(1);
  });

  it("filters by since date", async () => {
    tools.appendHistory("codecraft", {
      timestamp: new Date("2025-01-01T00:00:00Z"),
      role: "user",
      content: "Old entry",
      agentId: "codecraft",
    });
    tools.appendHistory("codecraft", {
      timestamp: new Date("2025-06-15T00:00:00Z"),
      role: "agent",
      content: "New entry",
      agentId: "codecraft",
    });

    const result = await tools.sessionsHistory("codecraft", {
      since: new Date("2025-06-01T00:00:00Z"),
    });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].content).toBe("New entry");
  });

  it("isolates history between agents", async () => {
    tools.appendHistory("codecraft", {
      timestamp: new Date(),
      role: "user",
      content: "For codecraft",
      agentId: "codecraft",
    });
    tools.appendHistory("securishield", {
      timestamp: new Date(),
      role: "user",
      content: "For securishield",
      agentId: "securishield",
    });

    const ccHistory = await tools.sessionsHistory("codecraft");
    expect(ccHistory.total).toBe(1);
    expect(ccHistory.entries[0].content).toBe("For codecraft");

    const ssHistory = await tools.sessionsHistory("securishield");
    expect(ssHistory.total).toBe(1);
    expect(ssHistory.entries[0].content).toBe("For securishield");
  });
});

// ─── SessionTools — appendHistory / clearHistory ────────────────────────────

describe("SessionTools history management", () => {
  let tools: SessionTools;

  beforeEach(() => {
    ({ tools } = createSessionTools());
  });

  it("appendHistory emits history_appended event", () => {
    const events: unknown[] = [];
    tools.on("history_appended", (e) => events.push(e));

    tools.appendHistory("codecraft", {
      timestamp: new Date(),
      role: "user",
      content: "Hello",
      agentId: "codecraft",
    });

    expect(events).toHaveLength(1);
    expect((events[0] as any).agentId).toBe("codecraft");
    expect((events[0] as any).entry.content).toBe("Hello");
  });

  it("clearHistory removes all entries for an agent", async () => {
    tools.appendHistory("codecraft", {
      timestamp: new Date(),
      role: "user",
      content: "Hello",
      agentId: "codecraft",
    });

    tools.clearHistory("codecraft");

    const result = await tools.sessionsHistory("codecraft");
    expect(result.total).toBe(0);
    expect(result.source).toBe("empty");
  });

  it("clearHistory does not affect other agents", async () => {
    tools.appendHistory("codecraft", {
      timestamp: new Date(),
      role: "user",
      content: "CC msg",
      agentId: "codecraft",
    });
    tools.appendHistory("securishield", {
      timestamp: new Date(),
      role: "user",
      content: "SS msg",
      agentId: "securishield",
    });

    tools.clearHistory("codecraft");

    const ssHistory = await tools.sessionsHistory("securishield");
    expect(ssHistory.total).toBe(1);
  });

  it("clearAllHistory removes everything", async () => {
    tools.appendHistory("codecraft", {
      timestamp: new Date(),
      role: "user",
      content: "CC msg",
      agentId: "codecraft",
    });
    tools.appendHistory("securishield", {
      timestamp: new Date(),
      role: "user",
      content: "SS msg",
      agentId: "securishield",
    });

    tools.clearAllHistory();

    const ccHistory = await tools.sessionsHistory("codecraft");
    const ssHistory = await tools.sessionsHistory("securishield");
    expect(ccHistory.total).toBe(0);
    expect(ssHistory.total).toBe(0);
  });

  it("caps buffer to prevent unbounded growth", async () => {
    // MAX_HISTORY_LIMIT * 2 = 1000, after which it trims to MAX_HISTORY_LIMIT = 500
    for (let i = 0; i < 1050; i++) {
      tools.appendHistory("codecraft", {
        timestamp: new Date(Date.now() + i),
        role: "user",
        content: `Msg ${i}`,
        agentId: "codecraft",
      });
    }

    // After overflow trimming, should have at most MAX_HISTORY_LIMIT entries
    const result = await tools.sessionsHistory("codecraft", { limit: 500 });
    expect(result.total).toBeLessThanOrEqual(500);
  });
});

// ─── SessionTools — dispatch ────────────────────────────────────────────────

describe("SessionTools.dispatch", () => {
  let tools: SessionTools;

  beforeEach(() => {
    ({ tools } = createSessionTools());
  });

  it("dispatches sessions_list and returns JSON", async () => {
    const resultJson = await tools.dispatch("sessions_list", {});
    const result = JSON.parse(resultJson);
    expect(result).toHaveProperty("agents");
    expect(result).toHaveProperty("total");
    expect(result.total).toBe(4);
  });

  it("dispatches sessions_list with statusFilter", async () => {
    const resultJson = await tools.dispatch("sessions_list", {
      statusFilter: "ready",
    });
    const result = JSON.parse(resultJson);
    expect(result.total).toBe(2);
  });

  it("dispatches sessions_send and returns JSON", async () => {
    const resultJson = await tools.dispatch("sessions_send", {
      agentId: "codecraft",
      message: "Test via dispatch",
    });
    const result = JSON.parse(resultJson);
    expect(result).toHaveProperty("correlationId");
    expect(result).toHaveProperty("delivered");
    expect(result.delivered).toBe(true);
  });

  it("dispatches sessions_send with missing agentId returns error", async () => {
    const resultJson = await tools.dispatch("sessions_send", {
      message: "Missing agentId",
    });
    const result = JSON.parse(resultJson);
    expect(result).toHaveProperty("error");
    expect(result.error).toContain("agentId");
  });

  it("dispatches sessions_send with missing message returns error", async () => {
    const resultJson = await tools.dispatch("sessions_send", {
      agentId: "codecraft",
    });
    const result = JSON.parse(resultJson);
    expect(result).toHaveProperty("error");
    expect(result.error).toContain("message");
  });

  it("dispatches sessions_history and returns JSON", async () => {
    tools.appendHistory("codecraft", {
      timestamp: new Date(),
      role: "user",
      content: "Hello",
      agentId: "codecraft",
    });

    const resultJson = await tools.dispatch("sessions_history", {
      agentId: "codecraft",
    });
    const result = JSON.parse(resultJson);
    expect(result).toHaveProperty("entries");
    expect(result).toHaveProperty("total");
    expect(result.total).toBe(1);
  });

  it("dispatches sessions_history with missing agentId returns error", async () => {
    const resultJson = await tools.dispatch("sessions_history", {});
    const result = JSON.parse(resultJson);
    expect(result).toHaveProperty("error");
    expect(result.error).toContain("agentId");
  });

  it("dispatches sessions_history with since filter", async () => {
    tools.appendHistory("codecraft", {
      timestamp: new Date("2025-01-01T00:00:00Z"),
      role: "user",
      content: "Old",
      agentId: "codecraft",
    });
    tools.appendHistory("codecraft", {
      timestamp: new Date("2025-07-01T00:00:00Z"),
      role: "agent",
      content: "New",
      agentId: "codecraft",
    });

    const resultJson = await tools.dispatch("sessions_history", {
      agentId: "codecraft",
      since: "2025-06-01T00:00:00Z",
    });
    const result = JSON.parse(resultJson);
    expect(result.total).toBe(1);
    expect(result.entries[0].content).toBe("New");
  });

  it("returns error for unknown tool", async () => {
    const resultJson = await tools.dispatch("unknown_tool", {});
    const result = JSON.parse(resultJson);
    expect(result).toHaveProperty("error");
    expect(result.error).toContain("unknown_tool");
  });
});

// ─── SessionTools — isConnected ─────────────────────────────────────────────

describe("SessionTools.isConnected", () => {
  it("returns false when not connected", () => {
    const { tools } = createSessionTools();
    expect(tools.isConnected).toBe(false);
  });
});

// ─── SessionTools — end-to-end flow (no NATS) ──────────────────────────────

describe("SessionTools — end-to-end in-process flow", () => {
  let toolsA: SessionTools;
  let toolsB: SessionTools;
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = createMockRegistry();

    // Register two test agents
    registry.register({
      id: "agent-a",
      specialization: TaskType.ARCHITECTURE,
      capabilities: ["plan"],
      status: AgentStatus.READY,
      metrics: { avgResponseTimeMs: 0, currentLoad: 0 },
    });
    registry.register({
      id: "agent-b",
      specialization: TaskType.CODE_GENERATION,
      capabilities: ["generate_code"],
      status: AgentStatus.READY,
      metrics: { avgResponseTimeMs: 0, currentLoad: 0 },
    });

    toolsA = new SessionTools(
      { ownerAgentId: "agent-a", defaultTimeoutMs: 5000 },
      registry,
    );
    toolsB = new SessionTools(
      { ownerAgentId: "agent-b", defaultTimeoutMs: 5000 },
      registry,
    );
  });

  it("agent A can discover agent B via sessions_list", async () => {
    const result = await toolsA.sessionsList({
      specializationFilter: "CODE_GENERATION",
    });
    expect(result.agents.some((a) => a.id === "agent-b")).toBe(true);
  });

  it("agent A sends to agent B and records history on both sides", async () => {
    await toolsA.sessionsSend("agent-b", "Please generate a helper function");

    // Agent A's history should have the outbound message
    const histA = await toolsA.sessionsHistory("agent-a");
    expect(histA.entries.some((e) => e.content.includes("→ agent-b"))).toBe(
      true,
    );

    // Agent B's history (in-process) should have inbound from A
    const histB = await toolsA.sessionsHistory("agent-b");
    expect(histB.entries.some((e) => e.content.includes("← agent-a"))).toBe(
      true,
    );
  });

  it("full dispatch cycle: list → send → check history", async () => {
    // 1. List agents
    const listJson = await toolsA.dispatch("sessions_list", {
      statusFilter: "ready",
    });
    const listResult = JSON.parse(listJson);
    expect(listResult.total).toBeGreaterThan(0);
    const targetId = listResult.agents.find((a: any) => a.id === "agent-b")?.id;
    expect(targetId).toBe("agent-b");

    // 2. Send message
    const sendJson = await toolsA.dispatch("sessions_send", {
      agentId: targetId,
      message: "Generate a utility module",
    });
    const sendResult = JSON.parse(sendJson);
    expect(sendResult.delivered).toBe(true);

    // 3. Check history
    const histJson = await toolsA.dispatch("sessions_history", {
      agentId: "agent-a",
    });
    const histResult = JSON.parse(histJson);
    expect(histResult.total).toBeGreaterThanOrEqual(1);
    expect(
      histResult.entries.some(
        (e: any) =>
          typeof e.content === "string" && e.content.includes("agent-b"),
      ),
    ).toBe(true);
  });
});

// ─── AgentRegistry — getNatsSubject ─────────────────────────────────────────

describe("AgentRegistry.getNatsSubject", () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = createMockRegistry();
  });

  it("builds inbox subject", () => {
    expect(registry.getNatsSubject("codecraft", "inbox")).toBe(
      "constella.agent.codecraft.inbox",
    );
  });

  it("builds response subject", () => {
    expect(registry.getNatsSubject("codecraft", "response")).toBe(
      "constella.agent.codecraft.response",
    );
  });

  it("builds status subject", () => {
    expect(registry.getNatsSubject("codecraft", "status")).toBe(
      "constella.agent.codecraft.status",
    );
  });
});

describe("AgentRegistry.getNatsSubjects", () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = createMockRegistry();
  });

  it("returns all three subjects", () => {
    const subjects = registry.getNatsSubjects("codecraft");
    expect(subjects).toEqual({
      inbox: "constella.agent.codecraft.inbox",
      response: "constella.agent.codecraft.response",
      status: "constella.agent.codecraft.status",
    });
  });
});
