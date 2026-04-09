// ─── Unit Tests for SwarmOrchestrator ────────────────────────────────────────
//
// Tests the LLM-driven multi-agent intelligence layer:
//   - Planning: LLM produces execution plans from natural language
//   - Execution: Plans are executed via FrameworkRouter (parallel + sequential)
//   - Synthesis: Multiple agent results are combined into a coherent answer
//   - Fallback: Heuristic planning when LLM is unavailable
//   - Edge cases: Empty plans, unknown agents, timeouts, partial failures
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  SwarmOrchestrator,
  SwarmOrchestratorConfig,
  ExecutionPlan,
} from "../swarmOrchestrator.js";
import { FrameworkRouter } from "../frameworkRouter.js";
import { AgentRegistry } from "../agentRegistry.js";
import { MemoryBankManager } from "../memoryBank.js";
import { TaskType, AgentStatus } from "../types.js";

// ─── Mocks ──────────────────────────────────────────────────────────────────

// Mock the LLM manager so we control what the "brain" thinks
const mockCompletion = vi.fn();

vi.mock("@constella/llm-core", () => ({
  createLLMManager: vi.fn().mockReturnValue({
    completion: (...args: any[]) => mockCompletion(...args),
  }),
  AGENT_CONFIGS: {
    ARCHITECTURE: { quality: "high", costPriority: "medium" },
    SECURITY: { quality: "high", costPriority: "high" },
    QUALITY: { quality: "balanced", costPriority: "medium" },
  },
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function createTestConfig(
  overrides: Partial<SwarmOrchestratorConfig> = {},
): SwarmOrchestratorConfig {
  return {
    llmApiKeys: { openai: "sk-test-key-for-unit-tests" },
    maxAgentCalls: 5,
    pipelineTimeoutMs: 10000,
    useMemoryContext: false, // Disable memory for cleaner tests
    ...overrides,
  };
}

function createTestRegistry(): AgentRegistry {
  const registry = new AgentRegistry();

  registry.register({
    id: "architecture-agent-001",
    specialization: TaskType.ARCHITECTURE,
    capabilities: [
      "analyze_architecture",
      "generate_c4_model",
      "suggest_patterns",
    ],
    status: AgentStatus.READY,
    metrics: {
      avgResponseTimeMs: 100,
      currentLoad: 0.1,
      healthStatus: "healthy",
      lastActivity: new Date(),
    },
    lastSeen: new Date(),
  } as any);

  registry.register({
    id: "security-agent-001",
    specialization: TaskType.SECURITY,
    capabilities: ["security_scan", "policy_check", "vulnerability_assessment"],
    status: AgentStatus.READY,
    metrics: {
      avgResponseTimeMs: 150,
      currentLoad: 0.2,
      healthStatus: "healthy",
      lastActivity: new Date(),
    },
    lastSeen: new Date(),
  } as any);

  registry.register({
    id: "quality-agent-001",
    specialization: TaskType.QUALITY,
    capabilities: ["code_quality_check", "run_tests", "analyze_coverage"],
    status: AgentStatus.READY,
    metrics: {
      avgResponseTimeMs: 80,
      currentLoad: 0.15,
      healthStatus: "healthy",
      lastActivity: new Date(),
    },
    lastSeen: new Date(),
  } as any);

  return registry;
}

function createTestRouter(registry: AgentRegistry): FrameworkRouter {
  const router = new FrameworkRouter(registry);

  // Register mock local agents that return predictable results
  router.registerLocalAgent("architecture-agent-001", {
    execute: vi.fn().mockResolvedValue({
      analysis: "The system follows a clean microservice architecture.",
      components: ["API Gateway", "Auth Service", "Data Layer"],
      recommendations: ["Add circuit breakers", "Implement CQRS"],
      complexity_score: 7.5,
    }),
  });

  router.registerLocalAgent("security-agent-001", {
    execute: vi.fn().mockResolvedValue({
      scan_results: { high_severity: 1, medium_severity: 3, low_severity: 5 },
      vulnerabilities: [
        {
          type: "SQL Injection",
          severity: "high",
          location: "user-service/login.ts",
        },
      ],
      compliance_score: 0.72,
    }),
  });

  router.registerLocalAgent("quality-agent-001", {
    execute: vi.fn().mockResolvedValue({
      quality_metrics: {
        maintainability_index: 78,
        cyclomatic_complexity: 12,
        code_duplication: "3.2%",
      },
      overall_score: 8.1,
      recommendations: [
        "Reduce function length in auth module",
        "Add missing JSDoc",
      ],
    }),
  });

  return router;
}

function createTestMemoryBank(): MemoryBankManager {
  const mb = new MemoryBankManager();
  // queryContext and storeMemory exist on the real class; we just use it as-is
  return mb;
}

/**
 * Helper to make the mock LLM return a specific plan JSON.
 */
function mockPlannerResponse(plan: ExecutionPlan): void {
  mockCompletion.mockResolvedValueOnce({
    content: JSON.stringify(plan),
    finishReason: "stop",
    usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
    model: "test-model",
  });
}

/**
 * Helper to make the mock LLM return a synthesis string.
 */
function mockSynthesisResponse(text: string): void {
  mockCompletion.mockResolvedValueOnce({
    content: text,
    finishReason: "stop",
    usage: { promptTokens: 200, completionTokens: 400, totalTokens: 600 },
    model: "test-model",
  });
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe("SwarmOrchestrator", () => {
  let swarm: SwarmOrchestrator;
  let registry: AgentRegistry;
  let router: FrameworkRouter;
  let memoryBank: MemoryBankManager;

  beforeEach(() => {
    vi.clearAllMocks();

    registry = createTestRegistry();
    router = createTestRouter(registry);
    memoryBank = createTestMemoryBank();
    swarm = new SwarmOrchestrator(
      createTestConfig(),
      router,
      registry,
      memoryBank,
    );
  });

  // ── Constructor ─────────────────────────────────────────────────────────

  describe("constructor", () => {
    it("should instantiate with valid configuration", () => {
      expect(swarm).toBeDefined();
      expect(swarm).toBeInstanceOf(SwarmOrchestrator);
    });

    it("should accept custom configuration values", () => {
      const custom = new SwarmOrchestrator(
        createTestConfig({ maxAgentCalls: 10, pipelineTimeoutMs: 60000 }),
        router,
        registry,
        memoryBank,
      );
      expect(custom).toBeDefined();
    });
  });

  // ── Agent Catalog ───────────────────────────────────────────────────────

  describe("getAgentCatalog", () => {
    it("should return the static agent catalog", () => {
      const catalog = swarm.getAgentCatalog();
      expect(catalog).toHaveProperty("architecture-agent-001");
      expect(catalog).toHaveProperty("security-agent-001");
      expect(catalog).toHaveProperty("quality-agent-001");
    });

    it("should include task types and actions for each agent", () => {
      const catalog = swarm.getAgentCatalog();
      const arch = catalog["architecture-agent-001"];
      expect(arch.taskType).toBe(TaskType.ARCHITECTURE);
      expect(arch.actions).toContain("analyze_architecture");
      expect(arch.description).toBeTruthy();
    });
  });

  describe("registerAgentInCatalog", () => {
    it("should add a new agent to the catalog at runtime", () => {
      swarm.registerAgentInCatalog("custom-agent-001", {
        taskType: TaskType.DEVOPS,
        actions: ["deploy", "rollback"],
        description: "Handles deployments and rollbacks",
      });

      const catalog = swarm.getAgentCatalog();
      expect(catalog).toHaveProperty("custom-agent-001");
      expect(catalog["custom-agent-001"].actions).toContain("deploy");
    });
  });

  // ── Single-Agent Planning ───────────────────────────────────────────────

  describe("chat — single-agent plan", () => {
    it("should route a simple architecture question to the architecture agent", async () => {
      // Mock: planner returns a single-step plan
      mockPlannerResponse({
        summary: "Analyze architecture for the user's API",
        steps: [
          {
            agentId: "architecture-agent-001",
            taskType: TaskType.ARCHITECTURE,
            action: "analyze_architecture",
            parameters: {
              action: "analyze_architecture",
              description: "Express API",
            },
            reason: "User asked about architecture",
          },
        ],
        complexity: "simple",
        confidence: 0.9,
      });

      // Mock: synthesis LLM call
      mockSynthesisResponse(
        "Based on the architecture analysis, your Express API follows a clean pattern. " +
          "Consider adding circuit breakers for resilience.",
      );

      const result = await swarm.chat(
        "Analyze the architecture of my Express API",
      );

      expect(result.success).toBe(true);
      expect(result.agentsUsed).toContain("architecture-agent-001");
      expect(result.plan.steps).toHaveLength(1);
      expect(result.plan.complexity).toBe("simple");
      expect(result.stepResults).toHaveLength(1);
      expect(result.stepResults[0].success).toBe(true);
      expect(result.answer).toContain("circuit breakers");
      expect(result.totalDurationMs).toBeGreaterThan(0);
    });

    it("should route a security question to the security agent", async () => {
      mockPlannerResponse({
        summary: "Scan for vulnerabilities",
        steps: [
          {
            agentId: "security-agent-001",
            taskType: TaskType.SECURITY,
            action: "security_scan",
            parameters: { action: "security_scan", target: "auth module" },
            reason: "User needs security scanning",
          },
        ],
        complexity: "simple",
        confidence: 0.85,
      });

      mockSynthesisResponse(
        "The security scan found 1 high-severity SQL injection vulnerability in login.ts.",
      );

      const result = await swarm.chat(
        "Scan my auth module for vulnerabilities",
      );

      expect(result.success).toBe(true);
      expect(result.agentsUsed).toContain("security-agent-001");
      expect(result.stepResults[0].success).toBe(true);
      expect(result.answer).toContain("SQL injection");
    });
  });

  // ── Multi-Agent Planning ──────────────────────────────────────────────

  describe("chat — multi-agent plan", () => {
    it("should call multiple agents in parallel when there are no dependencies", async () => {
      mockPlannerResponse({
        summary: "Architecture review + security scan in parallel",
        steps: [
          {
            agentId: "architecture-agent-001",
            taskType: TaskType.ARCHITECTURE,
            action: "analyze_architecture",
            parameters: {
              action: "analyze_architecture",
              description: "Full API review",
            },
            reason: "Architecture assessment needed",
          },
          {
            agentId: "security-agent-001",
            taskType: TaskType.SECURITY,
            action: "security_scan",
            parameters: { action: "security_scan", target: "Full API" },
            reason: "Security assessment needed",
          },
        ],
        complexity: "multi-agent",
        confidence: 0.88,
      });

      mockSynthesisResponse(
        "Combined analysis: Your API architecture is sound but has a critical SQL injection vulnerability. " +
          "Fix the vulnerability first, then consider adding circuit breakers.",
      );

      const result = await swarm.chat(
        "Review my API for both architecture quality and security vulnerabilities",
      );

      expect(result.success).toBe(true);
      expect(result.agentsUsed).toHaveLength(2);
      expect(result.agentsUsed).toContain("architecture-agent-001");
      expect(result.agentsUsed).toContain("security-agent-001");
      expect(result.plan.complexity).toBe("multi-agent");
      expect(result.stepResults).toHaveLength(2);
      expect(result.stepResults.every((r: any) => r.success)).toBe(true);
      expect(result.answer).toContain("SQL injection");
    });

    it("should respect step dependencies (sequential execution)", async () => {
      mockPlannerResponse({
        summary:
          "First analyze quality, then review architecture based on findings",
        steps: [
          {
            agentId: "quality-agent-001",
            taskType: TaskType.QUALITY,
            action: "code_quality_check",
            parameters: {
              action: "code_quality_check",
              language: "typescript",
            },
            reason: "Get quality metrics first",
          },
          {
            agentId: "architecture-agent-001",
            taskType: TaskType.ARCHITECTURE,
            action: "analyze_architecture",
            parameters: {
              action: "analyze_architecture",
              description: "Based on quality results",
            },
            reason: "Architecture review informed by quality metrics",
            dependsOn: 0,
          },
        ],
        complexity: "multi-agent",
        confidence: 0.82,
      });

      mockSynthesisResponse(
        "Quality analysis shows a maintainability index of 78. " +
          "The architecture follows a clean pattern but has areas for improvement.",
      );

      const result = await swarm.chat(
        "Check my code quality and then review the architecture based on the findings",
      );

      expect(result.success).toBe(true);
      expect(result.stepResults).toHaveLength(2);

      // Both should succeed — the second waited for the first
      expect(result.stepResults[0].agentId).toBe("quality-agent-001");
      expect(result.stepResults[0].success).toBe(true);
      expect(result.stepResults[1].agentId).toBe("architecture-agent-001");
      expect(result.stepResults[1].success).toBe(true);
    });

    it("should handle three agents (security + architecture + quality)", async () => {
      mockPlannerResponse({
        summary:
          "Full platform review: security, architecture, and code quality",
        steps: [
          {
            agentId: "security-agent-001",
            taskType: TaskType.SECURITY,
            action: "security_scan",
            parameters: { action: "security_scan", target: "entire platform" },
            reason: "Security first",
          },
          {
            agentId: "architecture-agent-001",
            taskType: TaskType.ARCHITECTURE,
            action: "analyze_architecture",
            parameters: {
              action: "analyze_architecture",
              description: "platform",
            },
            reason: "Architecture review",
          },
          {
            agentId: "quality-agent-001",
            taskType: TaskType.QUALITY,
            action: "code_quality_check",
            parameters: {
              action: "code_quality_check",
              language: "typescript",
            },
            reason: "Code quality check",
          },
        ],
        complexity: "research",
        confidence: 0.9,
      });

      mockSynthesisResponse(
        "Comprehensive review complete across all three domains.",
      );

      const result = await swarm.chat("Do a full review of my platform");

      expect(result.success).toBe(true);
      expect(result.agentsUsed).toHaveLength(3);
      expect(result.stepResults).toHaveLength(3);
      expect(result.plan.complexity).toBe("research");
    });
  });

  // ── Empty Plan ────────────────────────────────────────────────────────

  describe("chat — empty plan", () => {
    it("should return the summary when the planner produces no steps", async () => {
      mockPlannerResponse({
        summary:
          "I don't have an agent that can help with cooking recipes. " +
          "I specialize in software architecture, security, and code quality.",
        steps: [],
        complexity: "simple",
        confidence: 0.1,
      });

      const result = await swarm.chat("How do I make pasta carbonara?");

      expect(result.success).toBe(true);
      expect(result.stepResults).toHaveLength(0);
      expect(result.agentsUsed).toHaveLength(0);
      expect(result.answer).toContain("cooking recipes");
    });
  });

  // ── LLM Planning Failure / Heuristic Fallback ─────────────────────────

  describe("chat — heuristic fallback", () => {
    it("should fall back to keyword heuristics when LLM planning fails", async () => {
      // Planner call throws
      mockCompletion.mockRejectedValueOnce(
        new Error("LLM provider unavailable"),
      );

      // Synthesis call still works
      mockSynthesisResponse(
        "Based on the security scan, there are vulnerabilities to address.",
      );

      const result = await swarm.chat(
        "Check my code for security vulnerabilities",
      );

      expect(result.success).toBe(true);
      expect(result.plan.confidence).toBeLessThanOrEqual(0.5);
      // Heuristic should pick security agent based on "security" keyword
      expect(result.agentsUsed).toContain("security-agent-001");
    });

    it("should use architecture agent as default fallback for unrecognised requests", async () => {
      mockCompletion.mockRejectedValueOnce(new Error("LLM unavailable"));

      mockSynthesisResponse(
        "Here is an architectural perspective on your request.",
      );

      const result = await swarm.chat("Tell me about something random");

      expect(result.success).toBe(true);
      // Default heuristic should route to architecture agent
      expect(result.agentsUsed).toContain("architecture-agent-001");
    });

    it("should detect multiple keyword domains and create a multi-agent heuristic plan", async () => {
      mockCompletion.mockRejectedValueOnce(new Error("LLM unavailable"));

      mockSynthesisResponse("Combined security and quality analysis.");

      const result = await swarm.chat(
        "Run a security audit and code quality review",
      );

      expect(result.success).toBe(true);
      expect(result.agentsUsed.length).toBeGreaterThanOrEqual(2);
      expect(result.plan.complexity).toBe("multi-agent");
    });
  });

  // ── Malformed LLM Responses ───────────────────────────────────────────

  describe("chat — malformed planner responses", () => {
    it("should handle LLM returning non-JSON text", async () => {
      mockCompletion.mockResolvedValueOnce({
        content: "I think you should analyze the architecture. Let me help.",
        finishReason: "stop",
        usage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 },
        model: "test",
      });

      // Since parsing fails → empty plan → returns summary
      const result = await swarm.chat("Analyze my API");

      expect(result.success).toBe(true);
      expect(result.plan.confidence).toBe(0);
      expect(result.stepResults).toHaveLength(0);
    });

    it("should handle LLM returning JSON wrapped in markdown code fences", async () => {
      const plan: ExecutionPlan = {
        summary: "Architecture analysis",
        steps: [
          {
            agentId: "architecture-agent-001",
            taskType: TaskType.ARCHITECTURE,
            action: "analyze_architecture",
            parameters: { action: "analyze_architecture", description: "test" },
            reason: "User request",
          },
        ],
        complexity: "simple",
        confidence: 0.85,
      };

      mockCompletion.mockResolvedValueOnce({
        content: "```json\n" + JSON.stringify(plan) + "\n```",
        finishReason: "stop",
        usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
        model: "test",
      });

      mockSynthesisResponse("Architecture looks good.");

      const result = await swarm.chat("Analyze my system");

      expect(result.success).toBe(true);
      expect(result.plan.steps).toHaveLength(1);
      expect(result.agentsUsed).toContain("architecture-agent-001");
    });

    it("should strip unknown agent IDs from the plan", async () => {
      mockPlannerResponse({
        summary: "Plan with hallucinated agent",
        steps: [
          {
            agentId: "nonexistent-agent-999",
            taskType: TaskType.ARCHITECTURE,
            action: "do_magic",
            parameters: { action: "do_magic" },
            reason: "LLM hallucinated this agent",
          },
          {
            agentId: "security-agent-001",
            taskType: TaskType.SECURITY,
            action: "security_scan",
            parameters: { action: "security_scan", target: "api" },
            reason: "Valid agent",
          },
        ],
        complexity: "multi-agent",
        confidence: 0.7,
      });

      mockSynthesisResponse("Security scan results.");

      const result = await swarm.chat("Do something complex");

      // The hallucinated agent should be stripped, only security agent remains
      expect(result.plan.steps).toHaveLength(1);
      expect(result.agentsUsed).toContain("security-agent-001");
      expect(result.agentsUsed).not.toContain("nonexistent-agent-999");
    });
  });

  // ── Agent Execution Failures ──────────────────────────────────────────

  describe("chat — partial agent failures", () => {
    it("should succeed overall if at least one agent succeeds", async () => {
      // Make security agent throw
      const securityExecute = vi
        .fn()
        .mockRejectedValue(new Error("Agent offline"));
      (router as any).localAgents.set("security-agent-001", {
        execute: securityExecute,
      });

      mockPlannerResponse({
        summary: "Architecture + security scan",
        steps: [
          {
            agentId: "architecture-agent-001",
            taskType: TaskType.ARCHITECTURE,
            action: "analyze_architecture",
            parameters: { action: "analyze_architecture", description: "test" },
            reason: "Architecture check",
          },
          {
            agentId: "security-agent-001",
            taskType: TaskType.SECURITY,
            action: "security_scan",
            parameters: { action: "security_scan", target: "test" },
            reason: "Security check",
          },
        ],
        complexity: "multi-agent",
        confidence: 0.85,
      });

      mockSynthesisResponse(
        "Architecture analysis succeeded. Security scan failed but here is what we know.",
      );

      const result = await swarm.chat("Review architecture and security");

      // Overall success because at least one agent succeeded
      expect(result.success).toBe(true);
      expect(result.stepResults).toHaveLength(2);

      const archResult = result.stepResults.find(
        (r: any) => r.agentId === "architecture-agent-001",
      );
      const secResult = result.stepResults.find(
        (r: any) => r.agentId === "security-agent-001",
      );

      expect(archResult?.success).toBe(true);
      expect(secResult?.success).toBe(false);
      expect(secResult?.error).toContain("Agent offline");
    });

    it("should report success=false if ALL agents fail", async () => {
      // Make all agents throw
      (router as any).localAgents.set("architecture-agent-001", {
        execute: vi.fn().mockRejectedValue(new Error("Arch offline")),
      });
      (router as any).localAgents.set("security-agent-001", {
        execute: vi.fn().mockRejectedValue(new Error("Sec offline")),
      });

      mockPlannerResponse({
        summary: "Both agents",
        steps: [
          {
            agentId: "architecture-agent-001",
            taskType: TaskType.ARCHITECTURE,
            action: "analyze_architecture",
            parameters: { action: "analyze_architecture", description: "x" },
            reason: "a",
          },
          {
            agentId: "security-agent-001",
            taskType: TaskType.SECURITY,
            action: "security_scan",
            parameters: { action: "security_scan", target: "x" },
            reason: "b",
          },
        ],
        complexity: "multi-agent",
        confidence: 0.8,
      });

      mockSynthesisResponse("Both agents failed. Unable to produce results.");

      const result = await swarm.chat("Full review");

      expect(result.success).toBe(false);
      expect(result.stepResults.every((r: any) => r.success === false)).toBe(
        true,
      );
    });
  });

  // ── Synthesis Fallback ────────────────────────────────────────────────

  describe("chat — synthesis failure", () => {
    it("should return raw results when synthesis LLM call fails", async () => {
      mockPlannerResponse({
        summary: "Architecture analysis",
        steps: [
          {
            agentId: "architecture-agent-001",
            taskType: TaskType.ARCHITECTURE,
            action: "analyze_architecture",
            parameters: { action: "analyze_architecture", description: "test" },
            reason: "User request",
          },
        ],
        complexity: "simple",
        confidence: 0.9,
      });

      // Synthesis call fails
      mockCompletion.mockRejectedValueOnce(new Error("Synthesis LLM failed"));

      const result = await swarm.chat("Analyze my architecture");

      expect(result.success).toBe(true);
      // Should still have an answer — the raw fallback
      expect(result.answer).toBeTruthy();
      expect(result.answer.length).toBeGreaterThan(0);
    });
  });

  // ── Pipeline Timeout ──────────────────────────────────────────────────

  describe("chat — pipeline timeout", () => {
    it("should return an error result when the pipeline times out", async () => {
      // Create swarm with very short timeout
      const fastSwarm = new SwarmOrchestrator(
        createTestConfig({ pipelineTimeoutMs: 50 }),
        router,
        registry,
        memoryBank,
      );

      // Make planner take too long
      mockCompletion.mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(resolve, 5000)),
      );

      const result = await fastSwarm.chat("This will time out");

      expect(result.success).toBe(false);
      expect(result.answer).toContain("timed out");
    });
  });

  // ── Max Agent Calls Limit ─────────────────────────────────────────────

  describe("chat — max agent calls enforcement", () => {
    it("should truncate plans that exceed maxAgentCalls", async () => {
      const limitedSwarm = new SwarmOrchestrator(
        createTestConfig({ maxAgentCalls: 1 }),
        router,
        registry,
        memoryBank,
      );

      mockPlannerResponse({
        summary: "Plan with too many steps",
        steps: [
          {
            agentId: "architecture-agent-001",
            taskType: TaskType.ARCHITECTURE,
            action: "analyze_architecture",
            parameters: { action: "analyze_architecture", description: "x" },
            reason: "first",
          },
          {
            agentId: "security-agent-001",
            taskType: TaskType.SECURITY,
            action: "security_scan",
            parameters: { action: "security_scan", target: "x" },
            reason: "second — should be truncated",
          },
          {
            agentId: "quality-agent-001",
            taskType: TaskType.QUALITY,
            action: "code_quality_check",
            parameters: { action: "code_quality_check", language: "ts" },
            reason: "third — should be truncated",
          },
        ],
        complexity: "research",
        confidence: 0.9,
      });

      mockSynthesisResponse("Only the first agent was called.");

      const result = await limitedSwarm.chat("Full review");

      // Only 1 step should have been executed
      expect(result.plan.steps).toHaveLength(1);
      expect(result.stepResults).toHaveLength(1);
      expect(result.agentsUsed).toContain("architecture-agent-001");
    });
  });

  // ── LLM Call Count Verification ───────────────────────────────────────

  describe("LLM call patterns", () => {
    it("should make exactly 2 LLM calls for a single-agent plan (plan + synthesis)", async () => {
      mockPlannerResponse({
        summary: "Single step",
        steps: [
          {
            agentId: "quality-agent-001",
            taskType: TaskType.QUALITY,
            action: "code_quality_check",
            parameters: { action: "code_quality_check", language: "python" },
            reason: "Quality check",
          },
        ],
        complexity: "simple",
        confidence: 0.9,
      });

      mockSynthesisResponse("Quality looks good.");

      await swarm.chat("Check code quality");

      // 1 call for planning + 1 call for synthesis = 2 total
      expect(mockCompletion).toHaveBeenCalledTimes(2);
    });

    it("should make exactly 2 LLM calls for a multi-agent plan (plan + synthesis)", async () => {
      mockPlannerResponse({
        summary: "Two agents",
        steps: [
          {
            agentId: "architecture-agent-001",
            taskType: TaskType.ARCHITECTURE,
            action: "analyze_architecture",
            parameters: { action: "analyze_architecture", description: "x" },
            reason: "a",
          },
          {
            agentId: "security-agent-001",
            taskType: TaskType.SECURITY,
            action: "security_scan",
            parameters: { action: "security_scan", target: "x" },
            reason: "b",
          },
        ],
        complexity: "multi-agent",
        confidence: 0.85,
      });

      mockSynthesisResponse("Combined results.");

      await swarm.chat("Architecture and security review");

      // 1 call for planning + 1 call for synthesis = 2 total
      // (NOT 1 per agent — agents are called via FrameworkRouter, not LLM)
      expect(mockCompletion).toHaveBeenCalledTimes(2);
    });

    it("should make exactly 1 LLM call when plan is empty (no synthesis needed)", async () => {
      mockPlannerResponse({
        summary: "Can't help with that",
        steps: [],
        complexity: "simple",
        confidence: 0.1,
      });

      await swarm.chat("Something unrelated");

      expect(mockCompletion).toHaveBeenCalledTimes(1);
    });
  });

  // ── Event Emission ────────────────────────────────────────────────────

  describe("events", () => {
    it("should emit pipeline_start when chat begins", async () => {
      const listener = vi.fn();
      swarm.on("pipeline_start", listener);

      mockPlannerResponse({
        summary: "Test",
        steps: [],
        complexity: "simple",
        confidence: 0.5,
      });

      await swarm.chat("Hello");

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ userMessage: "Hello" }),
      );
    });

    it("should emit planning_complete with the plan", async () => {
      const listener = vi.fn();
      swarm.on("planning_complete", listener);

      const plan: ExecutionPlan = {
        summary: "Plan emitted",
        steps: [
          {
            agentId: "quality-agent-001",
            taskType: TaskType.QUALITY,
            action: "code_quality_check",
            parameters: { action: "code_quality_check", language: "ts" },
            reason: "test",
          },
        ],
        complexity: "simple",
        confidence: 0.9,
      };

      mockPlannerResponse(plan);
      mockSynthesisResponse("Done.");

      await swarm.chat("Check quality");

      expect(listener).toHaveBeenCalledTimes(1);
      const emittedPlan = listener.mock.calls[0][0].plan;
      expect(emittedPlan.summary).toBe("Plan emitted");
      expect(emittedPlan.steps).toHaveLength(1);
    });

    it("should emit step_start and step_complete for each step", async () => {
      const startListener = vi.fn();
      const completeListener = vi.fn();
      swarm.on("step_start", startListener);
      swarm.on("step_complete", completeListener);

      mockPlannerResponse({
        summary: "Two steps",
        steps: [
          {
            agentId: "architecture-agent-001",
            taskType: TaskType.ARCHITECTURE,
            action: "analyze_architecture",
            parameters: { action: "analyze_architecture", description: "x" },
            reason: "a",
          },
          {
            agentId: "security-agent-001",
            taskType: TaskType.SECURITY,
            action: "security_scan",
            parameters: { action: "security_scan", target: "x" },
            reason: "b",
          },
        ],
        complexity: "multi-agent",
        confidence: 0.85,
      });

      mockSynthesisResponse("Done.");

      await swarm.chat("Review everything");

      expect(startListener).toHaveBeenCalledTimes(2);
      expect(completeListener).toHaveBeenCalledTimes(2);
    });

    it("should emit step_error when an agent fails", async () => {
      const errorListener = vi.fn();
      swarm.on("step_error", errorListener);

      (router as any).localAgents.set("security-agent-001", {
        execute: vi.fn().mockRejectedValue(new Error("Agent crash")),
      });

      mockPlannerResponse({
        summary: "Will fail",
        steps: [
          {
            agentId: "security-agent-001",
            taskType: TaskType.SECURITY,
            action: "security_scan",
            parameters: { action: "security_scan", target: "x" },
            reason: "test",
          },
        ],
        complexity: "simple",
        confidence: 0.8,
      });

      mockSynthesisResponse("Failed.");

      await swarm.chat("Scan security");

      expect(errorListener).toHaveBeenCalledTimes(1);
      expect(errorListener.mock.calls[0][0].error).toContain("Agent crash");
    });

    it("should emit pipeline_complete with summary stats", async () => {
      const listener = vi.fn();
      swarm.on("pipeline_complete", listener);

      mockPlannerResponse({
        summary: "Single step",
        steps: [
          {
            agentId: "quality-agent-001",
            taskType: TaskType.QUALITY,
            action: "code_quality_check",
            parameters: { action: "code_quality_check", language: "ts" },
            reason: "test",
          },
        ],
        complexity: "simple",
        confidence: 0.9,
      });

      mockSynthesisResponse("Done.");

      await swarm.chat("Quality check");

      expect(listener).toHaveBeenCalledTimes(1);
      const stats = listener.mock.calls[0][0];
      expect(stats.agentsUsed).toContain("quality-agent-001");
      expect(stats.successCount).toBe(1);
      expect(stats.stepCount).toBe(1);
      expect(stats.totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it("should emit planning_fallback when LLM planning fails", async () => {
      const listener = vi.fn();
      swarm.on("planning_fallback", listener);

      mockCompletion.mockRejectedValueOnce(new Error("LLM down"));
      mockSynthesisResponse("Fallback result.");

      await swarm.chat("Security review");

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0].error).toContain("LLM down");
    });
  });

  // ── Memory Context ────────────────────────────────────────────────────

  describe("memory context", () => {
    it("should work with useMemoryContext disabled", async () => {
      const noMemorySwarm = new SwarmOrchestrator(
        createTestConfig({ useMemoryContext: false }),
        router,
        registry,
        memoryBank,
      );

      mockPlannerResponse({
        summary: "No memory",
        steps: [],
        complexity: "simple",
        confidence: 0.5,
      });

      const result = await noMemorySwarm.chat("Hello");
      expect(result.success).toBe(true);
    });

    it("should work with useMemoryContext enabled even if memory retrieval fails", async () => {
      const memSwarm = new SwarmOrchestrator(
        createTestConfig({ useMemoryContext: true }),
        router,
        registry,
        memoryBank,
      );

      // Spy on queryContext and make it fail
      vi.spyOn(memoryBank, "queryContext").mockRejectedValueOnce(
        new Error("Redis down"),
      );

      mockPlannerResponse({
        summary: "Memory failed but we proceed",
        steps: [],
        complexity: "simple",
        confidence: 0.5,
      });

      const result = await memSwarm.chat("Hello");
      expect(result.success).toBe(true);
    });
  });

  // ── Result Structure Validation ───────────────────────────────────────

  describe("result structure", () => {
    it("should always return a complete OrchestrationResult structure", async () => {
      mockPlannerResponse({
        summary: "Test structure",
        steps: [
          {
            agentId: "architecture-agent-001",
            taskType: TaskType.ARCHITECTURE,
            action: "analyze_architecture",
            parameters: { action: "analyze_architecture", description: "x" },
            reason: "test",
          },
        ],
        complexity: "simple",
        confidence: 0.9,
      });

      mockSynthesisResponse("Structured response.");

      const result = await swarm.chat("Test");

      // Validate all required fields exist
      expect(result).toHaveProperty("answer");
      expect(result).toHaveProperty("plan");
      expect(result).toHaveProperty("plan.summary");
      expect(result).toHaveProperty("plan.steps");
      expect(result).toHaveProperty("plan.complexity");
      expect(result).toHaveProperty("plan.confidence");
      expect(result).toHaveProperty("stepResults");
      expect(result).toHaveProperty("totalDurationMs");
      expect(result).toHaveProperty("agentsUsed");
      expect(result).toHaveProperty("success");

      // Type checks
      expect(typeof result.answer).toBe("string");
      expect(typeof result.totalDurationMs).toBe("number");
      expect(typeof result.success).toBe("boolean");
      expect(Array.isArray(result.plan.steps)).toBe(true);
      expect(Array.isArray(result.stepResults)).toBe(true);
      expect(Array.isArray(result.agentsUsed)).toBe(true);
    });

    it("should include duration in step results", async () => {
      mockPlannerResponse({
        summary: "Timing test",
        steps: [
          {
            agentId: "quality-agent-001",
            taskType: TaskType.QUALITY,
            action: "code_quality_check",
            parameters: { action: "code_quality_check", language: "ts" },
            reason: "test",
          },
        ],
        complexity: "simple",
        confidence: 0.9,
      });

      mockSynthesisResponse("Done.");

      const result = await swarm.chat("Check quality");

      expect(result.stepResults[0]).toHaveProperty("durationMs");
      expect(result.stepResults[0].durationMs).toBeGreaterThanOrEqual(0);
      expect(result.stepResults[0]).toHaveProperty("stepIndex", 0);
      expect(result.stepResults[0]).toHaveProperty(
        "agentId",
        "quality-agent-001",
      );
      expect(result.stepResults[0]).toHaveProperty(
        "action",
        "code_quality_check",
      );
      expect(result.stepResults[0]).toHaveProperty("success", true);
      expect(result.stepResults[0]).toHaveProperty("result");
    });
  });
});
