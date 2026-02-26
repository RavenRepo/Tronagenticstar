/**
 * Constella Dashboard — API Client Library
 * =========================================
 * Typed client for communicating with the Constella API Gateway,
 * Orchestrator, and individual agent services from the Next.js dashboard.
 *
 * All requests are proxied through Next.js rewrites (see next.config.ts)
 * so the browser never talks directly to backend services — this avoids
 * CORS issues and lets us inject auth headers in one place.
 *
 * Usage:
 *   import { api } from "@/lib/api";
 *
 *   const health = await api.getHealth();
 *   const agents = await api.listAgents();
 *   const result = await api.executeTask("codecraft", { ... });
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HealthStatus {
  status: "healthy" | "ok" | "degraded" | "unhealthy";
  service?: string;
  version?: string;
  timestamp?: string;
  agents_available?: number;
  uptime_seconds?: number;
  details?: string;
}

export interface AgentInfo {
  id: string;
  name: string;
  url: string;
  capabilities: string[];
  timeout?: number;
  status?: "active" | "inactive" | "error" | "unknown";
}

export interface AgentCapabilities {
  agent_id: string;
  agent_type: string;
  task_type: string;
  capabilities: string[];
  version?: string;
}

export interface AgentHealth {
  status: string;
  details?: string;
  version?: string;
  llm_configured?: boolean;
}

export interface TaskParameters {
  prompt?: string;
  code?: string;
  language?: string;
  style?: string;
  max_lines?: number;
  framework?: string;
  refactor_type?: string;
  optimization_target?: string;
  bug_description?: string;
  test_framework?: string;
  coverage_target?: string;
  detail_level?: string;
  include_comments?: boolean;
  include_docstrings?: boolean;
  include_type_hints?: boolean;
  system_name?: string;
  diagram_type?: string;
  diagram_format?: string;
  description?: string;
  requirements?: string[];
  constraints?: string[];
  problem_domain?: string;
  tech_stack?: string[];
  scale_requirements?: string;
  architecture_description?: string;
  current_patterns?: string[];
  include_tradeoffs?: boolean;
  severity_threshold?: string;
  include_remediation?: boolean;
  scan_depth?: string;
  config?: string;
  config_type?: string;
  dependencies?: Record<string, string>;
  target?: string;
  [key: string]: unknown;
}

export interface TaskRequest {
  task_id: string;
  task_type: string;
  parameters: TaskParameters;
  context?: Array<{ content: string; tags?: string }>;
}

export interface TaskResultMetrics {
  processing_time_ms: number;
  tokens_used?: number | null;
  llm_cost_usd?: number | null;
}

export interface TaskResult {
  task_id: string;
  status: "completed" | "failed" | "running" | "queued";
  result: Record<string, unknown>;
  metrics: TaskResultMetrics;
  error?: string;
}

export interface AnalysisRequest {
  code: string;
  project_context?: string;
  analysis_type: "architecture" | "security" | "quality" | "comprehensive";
  priority?: "low" | "normal" | "high" | "urgent";
}

export interface AnalysisResponse {
  request_id: string;
  status: string;
  results: Record<string, unknown>;
  execution_time_ms: number;
  agents_used: string[];
  timestamp: string;
}

export interface LLMMetrics {
  cost_today_usd: number;
  provider_health: Record<
    string,
    {
      success_count: number;
      failure_count: number;
      is_available: boolean;
      last_error?: string | null;
    }
  >;
  rate_limits: Record<string, unknown>;
  error?: string;
  status?: string;
}

export interface GatewayStatusResponse {
  status: string;
  version: string;
  environment: string;
  timestamp: string;
  uptime: number;
  services: Array<{
    name: string;
    url: string;
    timeout: number;
    healthPath: string;
  }>;
}

export interface SearchResult {
  score: number;
  payload: {
    content: string;
    source_path: string;
    language?: string;
    chunk_index?: number;
    total_chunks?: number;
    tags?: string[];
    [key: string]: unknown;
  };
}

export interface ApiError {
  status: number;
  message: string;
  detail?: string;
  requestId?: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 30_000;
const LLM_TASK_TIMEOUT_MS = 120_000;

/**
 * Agent metadata used by the dashboard for display and routing.
 * Agent URLs here are the proxied paths through the Next.js rewrite layer;
 * actual backend URLs are configured in next.config.ts.
 */
export const AGENT_CATALOG: Record<
  string,
  {
    displayName: string;
    description: string;
    icon: string;
    color: string;
    taskTypes: string[];
    port: number;
  }
> = {
  codecraft: {
    displayName: "CodeCraft",
    description: "Code generation, refactoring, optimization, and testing",
    icon: "Code",
    color: "#3b82f6",
    taskTypes: [
      "generate_code",
      "refactor_code",
      "explain_code",
      "optimize_code",
      "write_tests",
      "fix_bug",
    ],
    port: 8012,
  },
  securishield: {
    displayName: "SecuriShield",
    description: "Security scanning, vulnerability detection, and compliance",
    icon: "Shield",
    color: "#ef4444",
    taskTypes: [
      "scan_code",
      "scan_dependencies",
      "scan_infrastructure",
      "threat_model",
    ],
    port: 8011,
  },
  designforge: {
    displayName: "DesignForge",
    description: "Architecture analysis, diagram generation, and design patterns",
    icon: "Layout",
    color: "#8b5cf6",
    taskTypes: [
      "generate_diagram",
      "analyze_architecture",
      "suggest_patterns",
      "evaluate_design",
      "generate_c4_model",
      "design_review",
    ],
    port: 8010,
  },
  perfpulse: {
    displayName: "PerfPulse",
    description: "Performance profiling and optimization recommendations",
    icon: "Gauge",
    color: "#f59e0b",
    taskTypes: ["analyze_performance", "optimize_performance"],
    port: 8013,
  },
  evaluator: {
    displayName: "Evaluator",
    description: "Code quality assessment and technical debt analysis",
    icon: "CheckCircle",
    color: "#10b981",
    taskTypes: ["evaluate_quality", "check_standards"],
    port: 8014,
  },
  expressops: {
    displayName: "ExpressOps",
    description: "Express.js / Node.js backend generation and optimization",
    icon: "Server",
    color: "#6366f1",
    taskTypes: ["generate_express_app", "optimize_middleware"],
    port: 8015,
  },
  mobilefirstops: {
    displayName: "MobileFirstOps",
    description: "React Native & Flutter mobile app generation",
    icon: "Smartphone",
    color: "#ec4899",
    taskTypes: ["generate_mobile_app", "optimize_mobile"],
    port: 8016,
  },
  "database-agent": {
    displayName: "Database Agent",
    description: "Schema design, migration, and query optimization",
    icon: "Database",
    color: "#14b8a6",
    taskTypes: ["design_schema", "optimize_query", "generate_migration"],
    port: 8017,
  },
  "soc2-compliance": {
    displayName: "SOC2 Compliance",
    description: "SOC2 audit, compliance verification, and evidence collection",
    icon: "FileCheck",
    color: "#64748b",
    taskTypes: ["compliance_check", "audit_report", "evidence_collection"],
    port: 8020,
  },
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Get stored auth token from localStorage (set by login page). */
function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("constella_auth_token");
}

/** Store auth token. */
export function setAuthToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("constella_auth_token", token);
}

/** Clear auth token. */
export function clearAuthToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("constella_auth_token");
}

/** Build standard request headers including auth if available. */
function buildHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Request-ID": generateRequestId(),
  };

  const token = getAuthToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (extra) {
    Object.assign(headers, extra);
  }

  return headers;
}

/** Generate a short unique request ID for tracing. */
function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `dash-${timestamp}-${random}`;
}

/** Generate a unique task ID. */
export function generateTaskId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `task-${timestamp}-${random}`;
}

/**
 * Core fetch wrapper with timeout, error handling, and response parsing.
 * Throws `ApiError` on non-2xx responses.
 */
async function request<T>(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        ...buildHeaders(),
        ...(fetchOptions.headers as Record<string, string> | undefined),
      },
    });

    if (!response.ok) {
      let detail: string | undefined;
      try {
        const errorBody = await response.json();
        detail =
          errorBody.detail ||
          errorBody.error ||
          errorBody.message ||
          JSON.stringify(errorBody);
      } catch {
        detail = await response.text().catch(() => undefined);
      }

      const apiError: ApiError = {
        status: response.status,
        message: `HTTP ${response.status}: ${response.statusText}`,
        detail,
        requestId: response.headers.get("x-request-id") || undefined,
      };

      throw apiError;
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as unknown as T;
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      const apiError: ApiError = {
        status: 408,
        message: `Request timed out after ${timeoutMs}ms`,
        detail: url,
      };
      throw apiError;
    }

    // If it's already an ApiError, re-throw
    if (
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      "message" in error
    ) {
      throw error;
    }

    // Network error or other unknown error
    const apiError: ApiError = {
      status: 0,
      message:
        error instanceof Error
          ? error.message
          : "An unknown network error occurred",
      detail: url,
    };
    throw apiError;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Convenience GET. */
async function get<T>(
  url: string,
  options?: { timeoutMs?: number }
): Promise<T> {
  return request<T>(url, { method: "GET", ...options });
}

/** Convenience POST with JSON body. */
async function post<T>(
  url: string,
  body: unknown,
  options?: { timeoutMs?: number }
): Promise<T> {
  return request<T>(url, {
    method: "POST",
    body: JSON.stringify(body),
    ...options,
  });
}

// ---------------------------------------------------------------------------
// API Client — Gateway
// ---------------------------------------------------------------------------

export const gateway = {
  /** Get gateway health status (public, no auth). */
  async getHealth(): Promise<HealthStatus> {
    return get<HealthStatus>("/api/health", { timeoutMs: 10_000 });
  },

  /** Get gateway platform status (requires auth). */
  async getStatus(): Promise<GatewayStatusResponse> {
    return get<GatewayStatusResponse>("/api/gateway/status");
  },

  /** Get Prometheus metrics (text format). */
  async getMetrics(): Promise<string> {
    const response = await fetch("/api/metrics", {
      headers: buildHeaders(),
    });
    return response.text();
  },

  /** List all agents through the gateway. */
  async listAgents(): Promise<{
    success: boolean;
    data: { agents: AgentInfo[]; totalCount: number; timestamp: string };
  }> {
    return get("/api/gateway/agents");
  },

  /** Get agent details through the gateway. */
  async getAgent(agentId: string): Promise<{
    success: boolean;
    data: AgentInfo;
  }> {
    return get(`/api/gateway/agents/${encodeURIComponent(agentId)}`);
  },

  /** Get agent status through the gateway. */
  async getAgentStatus(agentId: string): Promise<{
    success: boolean;
    data: Record<string, unknown>;
  }> {
    return get(
      `/api/gateway/agents/${encodeURIComponent(agentId)}/status`,
      { timeoutMs: 10_000 }
    );
  },

  /** Execute an agent task through the gateway. */
  async executeAgentTask(
    agentId: string,
    action: string,
    parameters: Record<string, unknown>,
    metadata?: Record<string, unknown>
  ): Promise<{
    success: boolean;
    data: {
      status: string;
      result: Record<string, unknown>;
      executionTime: number;
    };
  }> {
    return post(
      `/api/gateway/agents/${encodeURIComponent(agentId)}/execute`,
      {
        action,
        parameters,
        metadata,
      },
      { timeoutMs: LLM_TASK_TIMEOUT_MS }
    );
  },
};

// ---------------------------------------------------------------------------
// API Client — Orchestrator (direct)
// ---------------------------------------------------------------------------

export const orchestrator = {
  /** Get orchestrator health. */
  async getHealth(): Promise<HealthStatus> {
    return get<HealthStatus>("/api/orchestrator/health", { timeoutMs: 10_000 });
  },

  /** List orchestrator's registered agents. */
  async listAgents(): Promise<{
    agents: Record<string, AgentInfo>;
    total: number;
    timestamp: string;
  }> {
    return get("/api/agents");
  },

  /** Run comprehensive analysis (multi-agent). */
  async analyze(req: AnalysisRequest): Promise<AnalysisResponse> {
    return post<AnalysisResponse>("/api/analyze", req, {
      timeoutMs: LLM_TASK_TIMEOUT_MS,
    });
  },

  /** Execute a specific agent action through the orchestrator. */
  async executeAgent(
    agentName: string,
    action: string,
    parameters: Record<string, unknown>,
    timeoutSeconds = 60
  ): Promise<{
    status: string;
    agent: string;
    action: string;
    result: Record<string, unknown>;
    timestamp: string;
  }> {
    return post(
      `/api/orchestrator/agents/${encodeURIComponent(agentName)}/execute`,
      {
        agent_name: agentName,
        action,
        parameters,
        timeout_seconds: timeoutSeconds,
      },
      { timeoutMs: (timeoutSeconds + 10) * 1000 }
    );
  },
};

// ---------------------------------------------------------------------------
// API Client — Direct Agent Communication
// ---------------------------------------------------------------------------

/**
 * Direct communication with individual agent services.
 * Uses the agent's port to build URLs. In production, these go through
 * Nginx → Docker network; in dev, they may be direct localhost calls.
 *
 * For the dashboard, we typically go through the gateway, but these are
 * useful for health checks and LLM metrics without gateway overhead.
 */
export const agents = {
  /** Check health of a specific agent by name. */
  async getHealth(
    agentName: string,
    baseUrl?: string
  ): Promise<AgentHealth> {
    const url = baseUrl || agentDirectUrl(agentName);
    return get<AgentHealth>(`${url}/health`, { timeoutMs: 10_000 });
  },

  /** Get capabilities of a specific agent. */
  async getCapabilities(
    agentName: string,
    baseUrl?: string
  ): Promise<AgentCapabilities> {
    const url = baseUrl || agentDirectUrl(agentName);
    return get<AgentCapabilities>(`${url}/capabilities`);
  },

  /** Execute a task directly on an agent (bypassing gateway). */
  async executeTask(
    agentName: string,
    taskType: string,
    parameters: TaskParameters,
    context?: Array<{ content: string; tags?: string }>,
    baseUrl?: string
  ): Promise<TaskResult> {
    const url = baseUrl || agentDirectUrl(agentName);
    const taskRequest: TaskRequest = {
      task_id: generateTaskId(),
      task_type: taskType,
      parameters,
      context,
    };
    return post<TaskResult>(`${url}/execute_task`, taskRequest, {
      timeoutMs: LLM_TASK_TIMEOUT_MS,
    });
  },

  /** Get LLM usage metrics from an agent (CodeCraft, SecuriShield, DesignForge). */
  async getLLMMetrics(
    agentName: string,
    baseUrl?: string
  ): Promise<LLMMetrics> {
    const url = baseUrl || agentDirectUrl(agentName);
    return get<LLMMetrics>(`${url}/llm-metrics`);
  },

  /** Check health of all known agents in parallel. */
  async healthCheckAll(): Promise<
    Record<string, { healthy: boolean; status: string; latencyMs: number }>
  > {
    const results: Record<
      string,
      { healthy: boolean; status: string; latencyMs: number }
    > = {};

    const checks = Object.keys(AGENT_CATALOG).map(async (name) => {
      const start = performance.now();
      try {
        const health = await agents.getHealth(name);
        const latencyMs = Math.round(performance.now() - start);
        results[name] = {
          healthy: health.status === "ok" || health.status === "healthy",
          status: health.status,
          latencyMs,
        };
      } catch {
        const latencyMs = Math.round(performance.now() - start);
        results[name] = {
          healthy: false,
          status: "unreachable",
          latencyMs,
        };
      }
    });

    await Promise.allSettled(checks);
    return results;
  },

  /** Gather LLM metrics from all core agents (CodeCraft, SecuriShield, DesignForge). */
  async gatherLLMMetrics(): Promise<Record<string, LLMMetrics>> {
    const coreAgents = ["codecraft", "securishield", "designforge"];
    const results: Record<string, LLMMetrics> = {};

    const fetches = coreAgents.map(async (name) => {
      try {
        results[name] = await agents.getLLMMetrics(name);
      } catch {
        results[name] = {
          cost_today_usd: 0,
          provider_health: {},
          rate_limits: {},
          error: "unavailable",
          status: "error",
        };
      }
    });

    await Promise.allSettled(fetches);
    return results;
  },
};

// ---------------------------------------------------------------------------
// API Client — Embedding & Retriever (RAG)
// ---------------------------------------------------------------------------

export const rag = {
  /** Generate an embedding for a text. */
  async embed(text: string): Promise<{ embedding: number[] }> {
    const result = await post<TaskResult>(
      `/api/orchestrator/embedding/execute_task`,
      {
        task_id: generateTaskId(),
        task_type: "generate_embedding",
        parameters: { text },
      },
      { timeoutMs: 15_000 }
    );
    return result.result as { embedding: number[] };
  },

  /** Search the knowledge base with a natural language query. */
  async search(
    query: string,
    topK = 5
  ): Promise<{ results: string[] }> {
    const result = await post<TaskResult>(
      `/api/orchestrator/retriever/execute_task`,
      {
        task_id: generateTaskId(),
        task_type: "retrieve_memories",
        parameters: { query, top_k: topK },
      },
      { timeoutMs: 15_000 }
    );
    return result.result as { results: string[] };
  },

  /** Index a memory into the knowledge base. */
  async indexMemory(
    id: string,
    content: string,
    metadata?: Record<string, unknown>,
    relatedIds?: string[]
  ): Promise<{ indexed: string }> {
    const result = await post<TaskResult>(
      `/api/orchestrator/retriever/execute_task`,
      {
        task_id: generateTaskId(),
        task_type: "index_memory",
        parameters: { id, content, metadata, related_ids: relatedIds },
      },
      { timeoutMs: 15_000 }
    );
    return result.result as { indexed: string };
  },
};

// ---------------------------------------------------------------------------
// Helper: build a direct URL for an agent
// ---------------------------------------------------------------------------

/**
 * Build the URL for direct agent communication.
 * In the browser, this uses the Next.js rewrite proxy.
 * On the server (SSR), this could use the Docker network hostname.
 */
function agentDirectUrl(agentName: string): string {
  const catalog = AGENT_CATALOG[agentName];
  if (!catalog) {
    throw new Error(`Unknown agent: ${agentName}. Known agents: ${Object.keys(AGENT_CATALOG).join(", ")}`);
  }

  // In the browser, use the Next.js proxy (requests go to /api/orchestrator/...)
  // For direct agent calls, we fall back to localhost:{port} in development.
  if (typeof window !== "undefined") {
    // Browser: use localhost with agent port for direct calls
    const gatewayUrl =
      process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:3000";

    // If we're running against a production domain, use the gateway proxy
    if (!gatewayUrl.includes("localhost")) {
      return gatewayUrl;
    }

    // In dev, talk directly to the agent
    return `http://localhost:${catalog.port}`;
  }

  // Server-side: use Docker network hostnames
  return `http://${agentName.replace("-", "")}:${catalog.port}`;
}

// ---------------------------------------------------------------------------
// SWR Fetcher
// ---------------------------------------------------------------------------

/**
 * Generic fetcher for use with SWR.
 *
 * Usage:
 *   const { data, error } = useSWR("/api/health", fetcher);
 */
export async function fetcher<T>(url: string): Promise<T> {
  return get<T>(url);
}

/**
 * SWR fetcher with auth headers pre-applied.
 */
export async function authFetcher<T>(url: string): Promise<T> {
  return get<T>(url);
}

// ---------------------------------------------------------------------------
// Convenience: Unified API export
// ---------------------------------------------------------------------------

export const api = {
  // Gateway (through Next.js proxy)
  getHealth: gateway.getHealth,
  getStatus: gateway.getStatus,
  getMetrics: gateway.getMetrics,
  listAgents: gateway.listAgents,
  getAgent: gateway.getAgent,
  getAgentStatus: gateway.getAgentStatus,
  executeAgentTask: gateway.executeAgentTask,

  // Orchestrator
  orchestratorHealth: orchestrator.getHealth,
  orchestratorAnalyze: orchestrator.analyze,
  orchestratorListAgents: orchestrator.listAgents,
  orchestratorExecuteAgent: orchestrator.executeAgent,

  // Direct agent access
  agentHealth: agents.getHealth,
  agentCapabilities: agents.getCapabilities,
  agentExecuteTask: agents.executeTask,
  agentLLMMetrics: agents.getLLMMetrics,
  healthCheckAll: agents.healthCheckAll,
  gatherLLMMetrics: agents.gatherLLMMetrics,

  // RAG
  embed: rag.embed,
  search: rag.search,
  indexMemory: rag.indexMemory,

  // Auth
  setAuthToken,
  clearAuthToken,
  generateTaskId,

  // Sub-namespaces for granular access
  gateway,
  orchestrator,
  agents,
  rag,
};

export default api;
