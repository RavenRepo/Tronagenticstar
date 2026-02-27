"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bot,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Code2,
  CpuIcon,
  FileSearch,
  GaugeCircle,
  Globe,
  Loader2,
  RefreshCw,
  Search,
  SendHorizonal,
  Server,
  Shield,
  Sparkles,
  XCircle,
  Zap,
  LucideIcon,
  Copy,
  Check,
  Terminal,
  Cpu,
  BarChart3,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AgentStatus = "healthy" | "degraded" | "unreachable" | "loading";

interface AgentDef {
  id: string;
  name: string;
  description: string;
  port: number;
  icon: LucideIcon;
  color: string;
  taskTypes: string[];
}

interface AgentHealth extends AgentDef {
  status: AgentStatus;
  latencyMs: number | null;
  details: string | null;
  capabilities: string[];
  llmConfigured: boolean;
  version: string | null;
  uptime: string | null;
}

interface TaskResult {
  task_id: string;
  status: string;
  result: Record<string, unknown>;
  confidence_score?: number;
  execution_time_ms?: number;
}

// ---------------------------------------------------------------------------
// Agent Registry
// ---------------------------------------------------------------------------

const AGENTS: AgentDef[] = [
  {
    id: "codecraft",
    name: "CodeCraft",
    description: "Code generation, refactoring, and optimization",
    port: 8012,
    icon: Code2,
    color: "from-blue-500 to-cyan-400",
    taskTypes: ["generate_code", "refactor_code", "explain_code", "optimize_code", "write_tests", "fix_bug"],
  },
  {
    id: "securishield",
    name: "SecuriShield",
    description: "Security scanning and vulnerability detection",
    port: 8011,
    icon: Shield,
    color: "from-red-500 to-orange-400",
    taskTypes: ["scan_code", "scan_dependencies", "scan_infrastructure", "threat_model"],
  },
  {
    id: "designforge",
    name: "DesignForge",
    description: "Architecture analysis and diagram generation",
    port: 8010,
    icon: BrainCircuit,
    color: "from-purple-500 to-pink-400",
    taskTypes: ["generate_diagram", "analyze_architecture", "suggest_patterns", "design_review"],
  },
  {
    id: "perfpulse",
    name: "PerfPulse",
    description: "Performance optimization and profiling",
    port: 8013,
    icon: Zap,
    color: "from-yellow-500 to-amber-400",
    taskTypes: ["analyze_performance", "optimize_performance"],
  },
  {
    id: "evaluator",
    name: "Evaluator",
    description: "Code quality assessment and testing",
    port: 8014,
    icon: GaugeCircle,
    color: "from-green-500 to-emerald-400",
    taskTypes: ["evaluate_quality", "check_standards"],
  },
  {
    id: "expressops",
    name: "ExpressOps",
    description: "Express.js and Node.js backend specialist",
    port: 8015,
    icon: Server,
    color: "from-lime-500 to-green-400",
    taskTypes: ["generate_express_app", "optimize_middleware"],
  },
  {
    id: "mobilefirstops",
    name: "MobileFirstOps",
    description: "React Native and Flutter mobile development",
    port: 8016,
    icon: Globe,
    color: "from-sky-500 to-indigo-400",
    taskTypes: ["generate_mobile_app", "optimize_mobile"],
  },
  {
    id: "database-agent",
    name: "Database Agent",
    description: "Database design, schema, and query optimization",
    port: 8017,
    icon: CpuIcon,
    color: "from-teal-500 to-cyan-400",
    taskTypes: ["design_schema", "optimize_query", "generate_migration"],
  },
  {
    id: "soc2-compliance",
    name: "SOC2 Compliance",
    description: "Enterprise compliance verification and auditing",
    port: 8020,
    icon: FileSearch,
    color: "from-slate-500 to-gray-400",
    taskTypes: ["compliance_check", "audit_report", "evidence_collection"],
  },
];

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:3000";

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

function agentUrl(port: number): string {
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    return `${GATEWAY_URL}`;
  }
  return `http://localhost:${port}`;
}

async function fetchAgentHealth(agent: AgentDef): Promise<AgentHealth> {
  const base: AgentHealth = {
    ...agent,
    status: "unreachable",
    latencyMs: null,
    details: null,
    capabilities: [],
    llmConfigured: false,
    version: null,
    uptime: null,
  };

  try {
    const start = Date.now();
    const url = agentUrl(agent.port);
    const resp = await fetch(`${url}/health`, {
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    const latencyMs = Date.now() - start;

    if (!resp.ok) {
      return { ...base, status: "degraded", latencyMs, details: `HTTP ${resp.status}` };
    }

    const data = await resp.json();
    const status: AgentStatus =
      data.status === "ok" || data.status === "healthy" ? "healthy" : "degraded";

    let capabilities: string[] = [];
    let llmConfigured = false;
    let version: string | null = null;
    let uptime: string | null = null;

    // Extract from health response
    if (data.capabilities) capabilities = data.capabilities;
    if (data.version) version = data.version;
    if (data.uptime_seconds) {
      const s = Math.floor(data.uptime_seconds);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      uptime = h > 0 ? `${h}h ${m}m` : `${m}m`;
    }

    // Try capabilities endpoint
    try {
      const capResp = await fetch(`${url}/capabilities`, {
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      });
      if (capResp.ok) {
        const capData = await capResp.json();
        if (capData.supported_tasks) capabilities = capData.supported_tasks;
        else if (capData.capabilities) capabilities = capData.capabilities;
        if (capData.llm_configured || capData.llm_provider) llmConfigured = true;
        if (capData.version) version = capData.version;
      }
    } catch {
      /* capabilities endpoint optional */
    }

    return {
      ...base,
      status,
      latencyMs,
      details: data.status || "ok",
      capabilities,
      llmConfigured,
      version,
      uptime,
    };
  } catch {
    return base;
  }
}

// ---------------------------------------------------------------------------
// UI Components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: AgentStatus }) {
  const config = {
    healthy: {
      label: "Healthy",
      classes: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
      dot: "bg-emerald-400",
    },
    degraded: {
      label: "Degraded",
      classes: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
      dot: "bg-yellow-400",
    },
    unreachable: {
      label: "Offline",
      classes: "bg-red-500/10 text-red-400 border-red-500/30",
      dot: "bg-red-400",
    },
    loading: {
      label: "Checking…",
      classes: "bg-gray-500/10 text-gray-400 border-gray-500/30",
      dot: "bg-gray-400",
    },
  }[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${config.classes}`}
    >
      {status === "loading" ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      )}
      {config.label}
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="rounded p-1 text-gray-500 transition-colors hover:bg-white/[0.06] hover:text-gray-300"
      title="Copy"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Agent Detail Drawer
// ---------------------------------------------------------------------------

function AgentDrawer({
  agent,
  onClose,
}: {
  agent: AgentHealth;
  onClose: () => void;
}) {
  const Icon = agent.icon;
  const [activeTab, setActiveTab] = useState<"overview" | "tasks" | "execute">("overview");
  const [taskType, setTaskType] = useState(agent.taskTypes[0] || "");
  const [taskInput, setTaskInput] = useState("");
  const [executing, setExecuting] = useState(false);
  const [taskResult, setTaskResult] = useState<TaskResult | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);

  const handleExecute = async () => {
    if (!taskType || !taskInput.trim()) return;
    setExecuting(true);
    setTaskResult(null);
    setTaskError(null);

    try {
      const url = agentUrl(agent.port);
      const resp = await fetch(`${url}/execute_task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_id: `task-${Date.now()}`,
          task_type: taskType,
          parameters: { prompt: taskInput, code: taskInput },
        }),
        signal: AbortSignal.timeout(120_000),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }));
        setTaskError(err.detail || `HTTP ${resp.status}`);
      } else {
        const data = await resp.json();
        setTaskResult(data);
      }
    } catch (err: unknown) {
      setTaskError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setExecuting(false);
    }
  };

  const tabs = [
    { id: "overview" as const, label: "Overview" },
    { id: "tasks" as const, label: "Capabilities" },
    { id: "execute" as const, label: "Execute Task" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="relative z-10 flex h-full w-full max-w-lg flex-col overflow-hidden border-l border-white/[0.06] bg-[#0c0e14] shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-4 border-b border-white/[0.06] px-6 py-5">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${agent.color} shadow-lg`}
          >
            <Icon className="h-6 w-6 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h2 className="truncate text-lg font-bold text-white">{agent.name}</h2>
              <StatusBadge status={agent.status} />
            </div>
            <p className="text-sm text-gray-400">{agent.description}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-white/[0.06] hover:text-gray-300"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/[0.06]">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-b-2 border-blue-500 text-white"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "overview" && (
            <div className="space-y-5">
              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Cpu className="h-3.5 w-3.5" />
                    Port
                  </div>
                  <p className="mt-1 font-mono text-lg font-bold text-white">{agent.port}</p>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Clock className="h-3.5 w-3.5" />
                    Latency
                  </div>
                  <p className="mt-1 text-lg font-bold text-white">
                    {agent.latencyMs !== null ? `${agent.latencyMs}ms` : "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Activity className="h-3.5 w-3.5" />
                    Uptime
                  </div>
                  <p className="mt-1 text-lg font-bold text-white">{agent.uptime || "—"}</p>
                </div>
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <BarChart3 className="h-3.5 w-3.5" />
                    Version
                  </div>
                  <p className="mt-1 text-lg font-bold text-white">{agent.version || "—"}</p>
                </div>
              </div>

              {/* LLM Status */}
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <h3 className="text-sm font-semibold text-white">LLM Integration</h3>
                <div className="mt-2 flex items-center gap-2">
                  <Bot className={`h-4 w-4 ${agent.llmConfigured ? "text-emerald-400" : "text-gray-600"}`} />
                  <span className={`text-sm ${agent.llmConfigured ? "text-emerald-400" : "text-gray-500"}`}>
                    {agent.llmConfigured ? "LLM Provider Connected" : "No LLM provider configured"}
                  </span>
                </div>
              </div>

              {/* Endpoints */}
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <h3 className="mb-3 text-sm font-semibold text-white">Endpoints</h3>
                <div className="space-y-2">
                  {[
                    { label: "Health", path: `/health` },
                    { label: "Capabilities", path: `/capabilities` },
                    { label: "Execute Task", path: `/execute_task` },
                  ].map((ep) => {
                    const fullUrl = `${agentUrl(agent.port)}${ep.path}`;
                    return (
                      <div key={ep.label} className="flex items-center justify-between">
                        <span className="text-xs text-gray-400">{ep.label}</span>
                        <div className="flex items-center gap-1">
                          <code className="rounded bg-white/[0.04] px-2 py-0.5 font-mono text-xs text-gray-300">
                            {fullUrl}
                          </code>
                          <CopyButton text={fullUrl} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Details */}
              {agent.details && (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                  <h3 className="mb-2 text-sm font-semibold text-white">Health Details</h3>
                  <pre className="whitespace-pre-wrap break-words font-mono text-xs text-gray-400">
                    {agent.details}
                  </pre>
                </div>
              )}
            </div>
          )}

          {activeTab === "tasks" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">
                This agent supports <span className="font-semibold text-white">{agent.taskTypes.length}</span>{" "}
                task types and exposes{" "}
                <span className="font-semibold text-white">{agent.capabilities.length}</span> capabilities.
              </p>

              <div>
                <h3 className="mb-3 text-sm font-semibold text-white">Task Types</h3>
                <div className="space-y-2">
                  {agent.taskTypes.map((tt) => (
                    <div
                      key={tt}
                      className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3"
                    >
                      <Terminal className="h-4 w-4 shrink-0 text-gray-500" />
                      <code className="font-mono text-sm text-gray-200">{tt}</code>
                    </div>
                  ))}
                </div>
              </div>

              {agent.capabilities.length > 0 && (
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-white">Capabilities</h3>
                  <div className="flex flex-wrap gap-2">
                    {agent.capabilities.map((cap) => (
                      <span
                        key={cap}
                        className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs text-gray-300"
                      >
                        {cap}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "execute" && (
            <div className="space-y-4">
              {/* Task type selector */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">Task Type</label>
                <div className="relative">
                  <select
                    value={taskType}
                    onChange={(e) => setTaskType(e.target.value)}
                    className="w-full appearance-none rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 pr-10 font-mono text-sm text-gray-200 outline-none transition-colors focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30"
                  >
                    {agent.taskTypes.map((tt) => (
                      <option key={tt} value={tt} className="bg-zinc-900">
                        {tt}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                </div>
              </div>

              {/* Input */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-400">Prompt / Code</label>
                <textarea
                  value={taskInput}
                  onChange={(e) => setTaskInput(e.target.value)}
                  placeholder="Enter your prompt or paste code here…"
                  rows={8}
                  className="w-full resize-none rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-3 font-mono text-sm text-gray-200 placeholder-gray-600 outline-none transition-colors focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30"
                />
              </div>

              {/* Execute button */}
              <button
                onClick={handleExecute}
                disabled={executing || !taskInput.trim() || agent.status === "unreachable"}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {executing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Executing…
                  </>
                ) : (
                  <>
                    <SendHorizonal className="h-4 w-4" />
                    Execute Task
                  </>
                )}
              </button>

              {agent.status === "unreachable" && (
                <p className="text-xs text-red-400">Agent is offline — cannot execute tasks.</p>
              )}

              {/* Error */}
              {taskError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
                  <p className="text-sm font-medium text-red-400">Error</p>
                  <p className="mt-1 font-mono text-xs text-red-300">{taskError}</p>
                </div>
              )}

              {/* Result */}
              {taskResult && (
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-medium text-emerald-400">Result</p>
                    {taskResult.execution_time_ms && (
                      <span className="text-xs text-gray-500">{taskResult.execution_time_ms.toFixed(0)}ms</span>
                    )}
                  </div>
                  {taskResult.confidence_score !== undefined && (
                    <p className="mb-2 text-xs text-gray-400">
                      Confidence: <span className="text-white">{(taskResult.confidence_score * 100).toFixed(0)}%</span>
                    </p>
                  )}
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/30 p-3 font-mono text-xs text-gray-300">
                    {JSON.stringify(taskResult.result, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter Bar
// ---------------------------------------------------------------------------

function FilterBar({
  filter,
  setFilter,
  search,
  setSearch,
  agentCounts,
}: {
  filter: AgentStatus | "all";
  setFilter: (f: AgentStatus | "all") => void;
  search: string;
  setSearch: (s: string) => void;
  agentCounts: Record<string, number>;
}) {
  const filters: { id: AgentStatus | "all"; label: string; color: string }[] = [
    { id: "all", label: "All", color: "text-gray-300" },
    { id: "healthy", label: "Healthy", color: "text-emerald-400" },
    { id: "degraded", label: "Degraded", color: "text-yellow-400" },
    { id: "unreachable", label: "Offline", color: "text-red-400" },
  ];

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Filter pills */}
      <div className="flex gap-2">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === f.id
                ? "bg-white/[0.08] text-white"
                : "text-gray-500 hover:bg-white/[0.04] hover:text-gray-300"
            }`}
          >
            {f.label}
            <span className="ml-1.5 opacity-60">
              {f.id === "all"
                ? agentCounts.total
                : agentCounts[f.id] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search agents…"
          className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] py-2 pl-9 pr-4 text-sm text-gray-200 placeholder-gray-600 outline-none transition-colors focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 sm:w-64"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent Card
// ---------------------------------------------------------------------------

function AgentCard({
  agent,
  onSelect,
}: {
  agent: AgentHealth;
  onSelect: (a: AgentHealth) => void;
}) {
  const Icon = agent.icon;

  return (
    <button
      onClick={() => onSelect(agent)}
      className="group relative flex flex-col rounded-xl border border-white/[0.06] bg-white/[0.02] p-5 text-left transition-all hover:border-white/[0.12] hover:bg-white/[0.04] hover:shadow-lg hover:shadow-black/20 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
    >
      {/* Gradient glow */}
      <div
        className={`absolute -top-px left-6 h-px w-16 bg-gradient-to-r ${agent.color} opacity-0 transition-opacity group-hover:opacity-60`}
      />

      <div className="flex items-start justify-between">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${agent.color} shadow-lg`}
        >
          <Icon className="h-5 w-5 text-white" />
        </div>
        <StatusBadge status={agent.status} />
      </div>

      <h3 className="mt-4 text-sm font-semibold text-white">{agent.name}</h3>
      <p className="mt-1 text-xs leading-relaxed text-gray-400">{agent.description}</p>

      <div className="mt-4 flex items-center gap-3 text-xs text-gray-500">
        {agent.latencyMs !== null && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {agent.latencyMs}ms
          </span>
        )}
        <span className="flex items-center gap-1">
          <Sparkles className="h-3 w-3" />
          {agent.taskTypes.length} tasks
        </span>
        {agent.llmConfigured && (
          <span className="flex items-center gap-1 text-emerald-500">
            <Bot className="h-3 w-3" />
            LLM
          </span>
        )}
        <span className="ml-auto font-mono">:{agent.port}</span>
      </div>

      <div className="mt-3 flex items-center gap-1 text-xs font-medium text-blue-400 opacity-0 transition-opacity group-hover:opacity-100">
        Open details <ChevronRight className="h-3 w-3" />
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentHealth[]>(
    AGENTS.map((a) => ({
      ...a,
      status: "loading" as AgentStatus,
      latencyMs: null,
      details: null,
      capabilities: [],
      llmConfigured: false,
      version: null,
      uptime: null,
    })),
  );
  const [selected, setSelected] = useState<AgentHealth | null>(null);
  const [filter, setFilter] = useState<AgentStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const checkAll = useCallback(async () => {
    setRefreshing(true);
    const results = await Promise.all(AGENTS.map(fetchAgentHealth));
    setAgents(results);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    checkAll();
    const interval = setInterval(checkAll, 30_000);
    return () => clearInterval(interval);
  }, [checkAll]);

  const filtered = agents.filter((a) => {
    if (filter !== "all" && a.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        a.name.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const counts = {
    total: agents.length,
    healthy: agents.filter((a) => a.status === "healthy").length,
    degraded: agents.filter((a) => a.status === "degraded").length,
    unreachable: agents.filter((a) => a.status === "unreachable").length,
  };

  return (
    <div className="min-h-screen bg-[#090b10] text-gray-100">
      {/* Header */}
      <header className="border-b border-white/[0.06] bg-[#0c0e14]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">Agents</h1>
            <p className="text-xs text-gray-500">
              {counts.total} agents &middot; {counts.healthy} healthy &middot; {counts.degraded} degraded &middot;{" "}
              {counts.unreachable} offline
            </p>
          </div>
          <button
            onClick={checkAll}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:bg-white/[0.06] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Filter bar */}
        <FilterBar
          filter={filter}
          setFilter={setFilter}
          search={search}
          setSearch={setSearch}
          agentCounts={counts}
        />

        {/* Agent Grid */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((agent) => (
            <AgentCard key={agent.id} agent={agent} onSelect={setSelected} />
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="mt-12 text-center">
            <Bot className="mx-auto h-12 w-12 text-gray-700" />
            <p className="mt-3 text-sm text-gray-500">No agents match your filters.</p>
          </div>
        )}
      </main>

      {/* Detail Drawer */}
      {selected && <AgentDrawer agent={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
