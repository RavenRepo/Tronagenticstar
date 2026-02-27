"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Clock,
  Code2,
  CpuIcon,
  FileSearch,
  Flame,
  GaugeCircle,
  Globe,
  Loader2,
  LucideIcon,
  MessageSquare,
  RefreshCw,
  Search,
  SendHorizonal,
  Server,
  Shield,
  Sparkles,
  Terminal,
  Workflow,
  XCircle,
  Zap,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AgentStatus = "healthy" | "degraded" | "unreachable" | "loading";

interface AgentHealth {
  id: string;
  name: string;
  description: string;
  port: number;
  icon: LucideIcon;
  color: string;
  status: AgentStatus;
  latencyMs: number | null;
  details: string | null;
  capabilities: string[];
  llmConfigured: boolean;
}

interface PlatformStats {
  totalAgents: number;
  healthyAgents: number;
  degradedAgents: number;
  unreachableAgents: number;
  lastChecked: Date | null;
}

interface QuickAction {
  label: string;
  description: string;
  icon: LucideIcon;
  agentId: string;
  taskType: string;
  color: string;
}

interface TaskExecution {
  id: string;
  agentId: string;
  taskType: string;
  status: "running" | "completed" | "failed";
  startedAt: Date;
  completedAt: Date | null;
  durationMs: number | null;
  resultPreview: string | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Agent definitions
// ---------------------------------------------------------------------------

const AGENTS: Omit<AgentHealth, "status" | "latencyMs" | "details" | "capabilities" | "llmConfigured">[] = [
  {
    id: "codecraft",
    name: "CodeCraft",
    description: "Code generation, refactoring, and optimization",
    port: 8012,
    icon: Code2,
    color: "from-blue-500 to-cyan-400",
  },
  {
    id: "securishield",
    name: "SecuriShield",
    description: "Security scanning and vulnerability detection",
    port: 8011,
    icon: Shield,
    color: "from-red-500 to-orange-400",
  },
  {
    id: "designforge",
    name: "DesignForge",
    description: "Architecture analysis and diagram generation",
    port: 8010,
    icon: BrainCircuit,
    color: "from-purple-500 to-pink-400",
  },
  {
    id: "perfpulse",
    name: "PerfPulse",
    description: "Performance optimization and profiling",
    port: 8013,
    icon: Zap,
    color: "from-yellow-500 to-amber-400",
  },
  {
    id: "evaluator",
    name: "Evaluator",
    description: "Code quality assessment and testing",
    port: 8014,
    icon: GaugeCircle,
    color: "from-green-500 to-emerald-400",
  },
  {
    id: "expressops",
    name: "ExpressOps",
    description: "Express.js and Node.js backend specialist",
    port: 8015,
    icon: Server,
    color: "from-lime-500 to-green-400",
  },
  {
    id: "mobilefirstops",
    name: "MobileFirstOps",
    description: "React Native and Flutter mobile development",
    port: 8016,
    icon: Globe,
    color: "from-sky-500 to-indigo-400",
  },
  {
    id: "database-agent",
    name: "Database Agent",
    description: "Database design, schema, and query optimization",
    port: 8017,
    icon: CpuIcon,
    color: "from-teal-500 to-cyan-400",
  },
  {
    id: "soc2-compliance",
    name: "SOC2 Compliance",
    description: "Enterprise compliance verification and auditing",
    port: 8020,
    icon: FileSearch,
    color: "from-slate-500 to-gray-400",
  },
];

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: "Generate Code",
    description: "Create production-ready code from a prompt",
    icon: Code2,
    agentId: "codecraft",
    taskType: "generate_code",
    color: "bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20",
  },
  {
    label: "Security Scan",
    description: "Scan code for vulnerabilities",
    icon: Shield,
    agentId: "securishield",
    taskType: "scan_code",
    color: "bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20",
  },
  {
    label: "Architecture Diagram",
    description: "Generate system architecture diagrams",
    icon: BrainCircuit,
    agentId: "designforge",
    taskType: "generate_diagram",
    color: "bg-purple-500/10 text-purple-400 border-purple-500/20 hover:bg-purple-500/20",
  },
  {
    label: "Code Review",
    description: "Get a comprehensive design review",
    icon: Search,
    agentId: "designforge",
    taskType: "design_review",
    color: "bg-pink-500/10 text-pink-400 border-pink-500/20 hover:bg-pink-500/20",
  },
  {
    label: "Write Tests",
    description: "Auto-generate test suites for your code",
    icon: CheckCircle2,
    agentId: "codecraft",
    taskType: "write_tests",
    color: "bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20",
  },
  {
    label: "Fix Bug",
    description: "Analyze and fix bugs in your code",
    icon: Flame,
    agentId: "codecraft",
    taskType: "fix_bug",
    color: "bg-orange-500/10 text-orange-400 border-orange-500/20 hover:bg-orange-500/20",
  },
];

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL || "http://localhost:3000";

function agentUrl(port: number): string {
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    return `/api/agents`;
  }
  return `http://localhost:${port}`;
}

async function fetchAgentHealth(agent: (typeof AGENTS)[number]): Promise<AgentHealth> {
  const base: AgentHealth = {
    ...agent,
    status: "loading",
    latencyMs: null,
    details: null,
    capabilities: [],
    llmConfigured: false,
  };

  try {
    const start = performance.now();
    const url = `http://localhost:${agent.port}/health`;
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    const latencyMs = Math.round(performance.now() - start);

    if (!resp.ok) {
      return { ...base, status: "degraded", latencyMs, details: `HTTP ${resp.status}` };
    }

    const data = await resp.json();
    const status: AgentStatus =
      data.status === "ok" || data.status === "healthy" ? "healthy" : "degraded";

    let capabilities: string[] = [];
    try {
      const capResp = await fetch(`http://localhost:${agent.port}/capabilities`, {
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      });
      if (capResp.ok) {
        const capData = await capResp.json();
        capabilities = capData.capabilities || [];
      }
    } catch {
      // non-critical
    }

    return {
      ...base,
      status,
      latencyMs,
      details: data.details || null,
      capabilities,
      llmConfigured: data.llm_configured ?? false,
    };
  } catch {
    return { ...base, status: "unreachable", latencyMs: null, details: "Connection refused" };
  }
}

async function executeQuickAction(
  action: QuickAction,
  prompt: string,
): Promise<{ success: boolean; result?: any; error?: string }> {
  const agentDef = AGENTS.find((a) => a.id === action.agentId);
  if (!agentDef) return { success: false, error: "Agent not found" };

  const taskId = `dash-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const params: Record<string, any> = {};

  if (action.taskType === "generate_code") {
    params.prompt = prompt;
    params.language = "python";
    params.style = "clean";
  } else if (action.taskType === "scan_code") {
    params.code = prompt;
    params.language = "python";
    params.severity_threshold = "LOW";
    params.include_remediation = true;
  } else if (action.taskType === "generate_diagram") {
    params.system_name = prompt;
    params.diagram_type = "c4_context";
    params.diagram_format = "mermaid";
  } else if (action.taskType === "design_review") {
    params.code = prompt;
    params.detail_level = "standard";
  } else if (action.taskType === "write_tests") {
    params.code = prompt;
    params.language = "python";
  } else if (action.taskType === "fix_bug") {
    params.code = prompt;
    params.language = "python";
    params.bug_description = "Please analyze and fix any issues";
  } else {
    params.prompt = prompt;
  }

  try {
    const resp = await fetch(`http://localhost:${agentDef.port}/execute_task`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task_id: taskId,
        task_type: action.taskType,
        parameters: params,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({ detail: resp.statusText }));
      return { success: false, error: errData.detail || `HTTP ${resp.status}` };
    }

    const data = await resp.json();
    return { success: true, result: data };
  } catch (err: any) {
    return { success: false, error: err.message || "Request failed" };
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: AgentStatus }) {
  const config = {
    healthy: {
      icon: CheckCircle2,
      label: "Healthy",
      classes: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
      dot: "bg-emerald-400",
    },
    degraded: {
      icon: AlertTriangle,
      label: "Degraded",
      classes: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
      dot: "bg-yellow-400",
    },
    unreachable: {
      icon: XCircle,
      label: "Offline",
      classes: "bg-red-500/10 text-red-400 border-red-500/30",
      dot: "bg-red-400",
    },
    loading: {
      icon: Loader2,
      label: "Checking...",
      classes: "bg-gray-500/10 text-text-secondary border-gray-500/30",
      dot: "bg-gray-400",
    },
  }[status];

  const Icon = config.icon;

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

function AgentCard({
  agent,
  onSelect,
}: {
  agent: AgentHealth;
  onSelect: (agent: AgentHealth) => void;
}) {
  const Icon = agent.icon;

  return (
    <button
      onClick={() => onSelect(agent)}
      className="group relative flex flex-col glass-panel p-5 text-left focus:outline-none focus:ring-1 focus:ring-brand/50 overflow-hidden"
    >
      {/* Animated glowing border effect on hover */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[radial-gradient(ellipse_100%_100%_at_50%_-20%,rgba(0,153,255,0.1),transparent)] pointer-events-none" />
      <div
        className={`absolute -top-px left-[10%] h-px w-[80%] bg-gradient-to-r from-transparent via-${agent.color.split('-')[1]}-500/50 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
      />

      <div className="flex items-start justify-between relative z-10">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${agent.color} shadow-lg ring-1 ring-white/10`}
        >
          <Icon className="h-6 w-6 text-white" />
        </div>
        <StatusBadge status={agent.status} />
      </div>

      <h3 className="mt-5 text-base font-semibold text-text-primary tracking-tight relative z-10">{agent.name}</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-text-secondary line-clamp-2 relative z-10">{agent.description}</p>

      <div className="mt-5 flex items-center gap-4 text-xs text-text-tertiary relative z-10">
        {agent.latencyMs !== null && (
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            <span className="font-mono">{agent.latencyMs}ms</span>
          </span>
        )}
        {agent.capabilities.length > 0 && (
          <span className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            <span className="font-mono">{agent.capabilities.length} tasks</span>
          </span>
        )}
        <span className="ml-auto font-mono text-text-secondary bg-bg-primary/50 px-2 py-0.5 rounded border border-border/50">:{agent.port}</span>
      </div>
    </button>
  );
}

function StatsBar({ stats }: { stats: PlatformStats }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {[
        {
          label: "Total Agents",
          value: stats.totalAgents,
          icon: Bot,
          color: "text-blue-400",
          bg: "bg-blue-500/10",
        },
        {
          label: "Healthy Agents",
          value: stats.healthyAgents,
          icon: CheckCircle2,
          color: "text-emerald-400",
          bg: "bg-emerald-500/10",
        },
        {
          label: "Degraded Status",
          value: stats.degradedAgents,
          icon: AlertTriangle,
          color: "text-yellow-400",
          bg: "bg-yellow-500/10",
        },
        {
          label: "Offline Fleet",
          value: stats.unreachableAgents,
          icon: XCircle,
          color: "text-red-400",
          bg: "bg-red-500/10",
        },
      ].map((stat) => {
        const Icon = stat.icon;
        return (
          <div
            key={stat.label}
            className="flex flex-col gap-3 glass-panel p-5 relative overflow-hidden group"
          >
             {/* Subtle ambient gradient on hover */}
             <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.03),transparent)] pointer-events-none" />
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${stat.bg} ring-1 ring-white/5`}>
              <Icon className={`h-5 w-5 ${stat.color}`} />
            </div>
            <div className="mt-1">
              <p className="text-3xl font-bold text-text-primary tracking-tight font-mono">{stat.value}</p>
              <p className="text-xs text-text-tertiary mt-1 font-medium tracking-wide uppercase">{stat.label}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function QuickActionCard({
  action,
  onClick,
}: {
  action: QuickAction;
  onClick: (action: QuickAction) => void;
}) {
  const Icon = action.icon;

  return (
    <button
      onClick={() => onClick(action)}
      className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all ${action.color} focus:outline-none focus:ring-2 focus:ring-blue-500/40`}
    >
      <Icon className="h-5 w-5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-medium">{action.label}</p>
        <p className="truncate text-xs opacity-60">{action.description}</p>
      </div>
      <ArrowRight className="ml-auto h-4 w-4 flex-shrink-0 opacity-40" />
    </button>
  );
}

function AgentDetailPanel({
  agent,
  onClose,
}: {
  agent: AgentHealth;
  onClose: () => void;
}) {
  const Icon = agent.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl border border-border-light bg-bg-primary p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-text-tertiary hover:text-text-primary"
        >
          <XCircle className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-4">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${agent.color} shadow-lg`}
          >
            <Icon className="h-6 w-6 text-text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-text-primary">{agent.name}</h2>
            <p className="text-sm text-text-secondary">{agent.description}</p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {/* Status */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-bg-secondary px-4 py-3">
            <span className="text-sm text-text-secondary">Status</span>
            <StatusBadge status={agent.status} />
          </div>

          {/* Port */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-bg-secondary px-4 py-3">
            <span className="text-sm text-text-secondary">Port</span>
            <span className="font-mono text-sm text-text-primary">{agent.port}</span>
          </div>

          {/* Latency */}
          {agent.latencyMs !== null && (
            <div className="flex items-center justify-between rounded-lg border border-border bg-bg-secondary px-4 py-3">
              <span className="text-sm text-text-secondary">Latency</span>
              <span className="font-mono text-sm text-text-primary">{agent.latencyMs}ms</span>
            </div>
          )}

          {/* LLM */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-bg-secondary px-4 py-3">
            <span className="text-sm text-text-secondary">LLM Provider</span>
            <span className={`text-sm font-medium ${agent.llmConfigured ? "text-emerald-400" : "text-yellow-400"}`}>
              {agent.llmConfigured ? "Connected" : "Not initialized"}
            </span>
          </div>

          {/* Capabilities */}
          {agent.capabilities.length > 0 && (
            <div className="rounded-lg border border-border bg-bg-secondary px-4 py-3">
              <p className="mb-2 text-sm text-text-secondary">Capabilities</p>
              <div className="flex flex-wrap gap-1.5">
                {agent.capabilities.map((cap) => (
                  <span
                    key={cap}
                    className="rounded-md border border-border-light bg-bg-hover px-2 py-0.5 font-mono text-xs text-text-secondary"
                  >
                    {cap}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Details */}
          {agent.details && (
            <div className="rounded-lg border border-border bg-bg-secondary px-4 py-3">
              <p className="text-sm text-text-secondary">Details</p>
              <p className="mt-1 text-sm text-text-secondary">{agent.details}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TaskModal({
  action,
  onClose,
}: {
  action: QuickAction;
  onClose: () => void;
}) {
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<TaskExecution | null>(null);

  const Icon = action.icon;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || running) return;

    const taskId = `dash-${Date.now()}`;
    const now = new Date();

    setRunning(true);
    setResult({
      id: taskId,
      agentId: action.agentId,
      taskType: action.taskType,
      status: "running",
      startedAt: now,
      completedAt: null,
      durationMs: null,
      resultPreview: null,
      error: null,
    });

    const response = await executeQuickAction(action, input.trim());
    const duration = Date.now() - now.getTime();

    if (response.success) {
      const resultData = response.result;
      let preview = "";

      try {
        const r = resultData?.result || resultData;
        if (r.generated_code) preview = r.generated_code;
        else if (r.refactored_code) preview = r.refactored_code;
        else if (r.fixed_code) preview = r.fixed_code;
        else if (r.test_code) preview = r.test_code;
        else if (r.diagram_code) preview = r.diagram_code;
        else if (r.executive_summary) preview = r.executive_summary;
        else if (r.vulnerabilities) preview = `Found ${r.vulnerabilities.length} vulnerabilities`;
        else preview = JSON.stringify(r, null, 2).slice(0, 2000);
      } catch {
        preview = JSON.stringify(resultData, null, 2).slice(0, 2000);
      }

      setResult({
        id: taskId,
        agentId: action.agentId,
        taskType: action.taskType,
        status: "completed",
        startedAt: now,
        completedAt: new Date(),
        durationMs: duration,
        resultPreview: preview.slice(0, 4000),
        error: null,
      });
    } else {
      setResult({
        id: taskId,
        agentId: action.agentId,
        taskType: action.taskType,
        status: "failed",
        startedAt: now,
        completedAt: new Date(),
        durationMs: duration,
        resultPreview: null,
        error: response.error || "Unknown error",
      });
    }

    setRunning(false);
  };

  const needsCodeInput = ["scan_code", "design_review", "write_tests", "fix_bug"].includes(
    action.taskType,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative flex w-full max-w-2xl flex-col rounded-2xl border border-border-light bg-bg-primary shadow-2xl" style={{ maxHeight: "90vh" }}>
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-6 py-4">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${action.color.split(" ")[0]}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-text-primary">{action.label}</h2>
            <p className="text-xs text-text-secondary">{action.description}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto text-text-tertiary hover:text-text-primary"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {!result ? (
            <form onSubmit={handleSubmit}>
              <label className="mb-2 block text-sm font-medium text-text-secondary">
                {needsCodeInput ? "Paste your code below" : "Describe what you need"}
              </label>
              <textarea
                className="w-full rounded-lg border border-border-light bg-bg-secondary px-4 py-3 font-mono text-sm text-text-primary placeholder-gray-600 focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
                rows={needsCodeInput ? 12 : 4}
                placeholder={
                  needsCodeInput
                    ? "def example():\n    # paste your code here\n    pass"
                    : "e.g. Write a REST API endpoint for user authentication..."
                }
                value={input}
                onChange={(e) => setInput(e.target.value)}
                autoFocus
              />
              <button
                type="submit"
                disabled={!input.trim() || running}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600"
              >
                {running ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <SendHorizonal className="h-4 w-4" />
                    Execute
                  </>
                )}
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              {/* Status banner */}
              <div
                className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${
                  result.status === "running"
                    ? "border-blue-500/30 bg-blue-500/10 text-blue-400"
                    : result.status === "completed"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : "border-red-500/30 bg-red-500/10 text-red-400"
                }`}
              >
                {result.status === "running" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : result.status === "completed" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                <span className="text-sm font-medium">
                  {result.status === "running"
                    ? "Executing task..."
                    : result.status === "completed"
                      ? `Completed in ${result.durationMs}ms`
                      : "Task failed"}
                </span>
              </div>

              {/* Error */}
              {result.error && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
                  <p className="text-sm text-red-400">{result.error}</p>
                </div>
              )}

              {/* Result preview */}
              {result.resultPreview && (
                <div className="rounded-lg border border-border bg-bg-secondary">
                  <div className="flex items-center justify-between border-b border-border px-4 py-2">
                    <span className="text-xs font-medium text-text-secondary">Result</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(result.resultPreview || "");
                      }}
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      Copy
                    </button>
                  </div>
                  <pre className="max-h-80 overflow-auto px-4 py-3 font-mono text-xs leading-relaxed text-text-secondary">
                    {result.resultPreview}
                  </pre>
                </div>
              )}

              {/* Run another */}
              {result.status !== "running" && (
                <button
                  onClick={() => {
                    setResult(null);
                    setInput("");
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-border-light bg-bg-secondary px-4 py-2.5 text-sm text-text-secondary transition-colors hover:bg-bg-hover"
                >
                  <RefreshCw className="h-4 w-4" />
                  Run another task
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard Page
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Dashboard Sub-components (Bento)
// ---------------------------------------------------------------------------

function TopologyMap({ agents }: { agents: AgentHealth[] }) {
  return (
    <div className="relative w-full h-full min-h-[350px] flex items-center justify-center overflow-hidden mt-2">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,153,255,0.08)_0%,transparent_60%)] animate-pulse-slow pointer-events-none"></div>
      
      {/* Central Node */}
      <div className="relative z-10 flex flex-col items-center justify-center p-5 glass-panel border-brand/40 shadow-[0_0_30px_rgba(0,153,255,0.3)] animate-pulse-slow pointer-events-none">
        <Server className="w-8 h-8 text-brand" />
        <span className="text-xs font-bold mt-3 text-text-primary tracking-widest uppercase">Orchestrator</span>
      </div>

      {/* Surrounding Nodes */}
      {agents.slice(0, 8).map((agent, i) => {
         const angle = (i / Math.min(8, agents.length)) * Math.PI * 2;
         const radius = 140; // px
         const x = Math.cos(angle) * radius;
         const y = Math.sin(angle) * radius;
         const Icon = agent.icon;
         const isActive = agent.status === "healthy";
         
         return (
           <React.Fragment key={agent.id}>
             <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
               <line 
                 x1="50%" y1="50%" 
                 x2={`calc(50% + ${x}px)`} y2={`calc(50% + ${y}px)`} 
                 stroke={isActive ? "hsl(var(--color-brand))" : "hsl(var(--color-border))"} 
                 strokeWidth="1.5" 
                 strokeDasharray={isActive ? "4 4" : "none"}
                 className={isActive ? "animate-[border-beam_20s_linear_infinite]" : ""}
                 opacity={isActive ? "0.6" : "0.3"}
               />
             </svg>
             
             <div 
               className={`absolute z-10 flex h-12 w-12 items-center justify-center rounded-xl glass-panel transition-all hover:scale-110 cursor-pointer ${isActive ? "border-brand-light/40 shadow-[0_0_15px_rgba(0,153,255,0.2)]" : "border-border/40 opacity-50"}`}
               style={{ transform: `translate(${x}px, ${y}px)` }}
               title={agent.name}
             >
               <Icon className={`w-5 h-5 ${agent.color.includes('red') ? 'text-red-400' : isActive ? "text-text-primary" : "text-text-tertiary"}`} />
             </div>
           </React.Fragment>
         );
      })}
    </div>
  );
}

function LiveExecutionStream() {
  const [logs, setLogs] = useState<{id: number, text: string, type: 'info'|'success'|'warn'}[]>([]);
  
  useEffect(() => {
    const messages = [
      "SecuriShield: Dependency scan completed. 0 criticals.",
      "CodeCraft: Refactoring main loop in auth.ts",
      "Orchestrator: Routing payload to CodeCraft.",
      "DesignForge: Syncing C4 diagram with latest commit.",
      "PerfPulse: Memory usage stabilized at 42%",
      "Evaluator: E2E test suite passed (12ms).",
      "Database Agent: Optimizing indices for Users table.",
      "ExpressOps: Restarting worker processes.",
      "Orchestrator: Health check verified. All systems nominal."
    ];
    let id = 0;
    const interval = setInterval(() => {
      const msg = messages[Math.floor(Math.random() * messages.length)];
      setLogs(prev => {
        const logType = Math.random() > 0.8 ? 'success' : 'info';
        const next = [...prev, { id: id++, text: msg, type: logType as 'success' | 'info' }];
        if (next.length > 7) return next.slice(next.length - 7);
        return next;
      });
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex-1 w-full bg-[#030303]/80 border border-border/30 rounded-xl p-5 font-mono text-xs overflow-hidden relative shadow-inner mt-2">
       <div className="flex gap-2 mb-4 opacity-50">
         <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div>
         <div className="w-2.5 h-2.5 rounded-full bg-yellow-500"></div>
         <div className="w-2.5 h-2.5 rounded-full bg-green-500"></div>
       </div>
       <div className="space-y-2.5 flex flex-col justify-end h-[calc(100%-2rem)]">
         {logs.map((log) => (
           <div key={log.id} className="animate-in fade-in slide-in-from-bottom-2 duration-300 flex gap-3">
             <span className="text-text-tertiary/50 shrink-0">[{new Date().toLocaleTimeString([], {hour12:false})}]</span>
             <span className={log.type === 'success' ? 'text-emerald-400' : 'text-blue-300'}>{log.text}</span>
           </div>
         ))}
         {logs.length === 0 && <span className="text-text-tertiary/50 animate-pulse">Establishing secure connection to swarm...</span>}
       </div>
    </div>
  );
}

export default function DashboardPage() {

  const [agents, setAgents] = useState<AgentHealth[]>(
    AGENTS.map((a) => ({
      ...a,
      status: "loading" as AgentStatus,
      latencyMs: null,
      details: null,
      capabilities: [],
      llmConfigured: false,
    })),
  );
  const [stats, setStats] = useState<PlatformStats>({
    totalAgents: AGENTS.length,
    healthyAgents: 0,
    degradedAgents: 0,
    unreachableAgents: 0,
    lastChecked: null,
  });
  const [selectedAgent, setSelectedAgent] = useState<AgentHealth | null>(null);
  const [activeAction, setActiveAction] = useState<QuickAction | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const checkAllHealth = useCallback(async () => {
    setRefreshing(true);
    const results = await Promise.all(AGENTS.map(fetchAgentHealth));
    setAgents(results);

    const newStats: PlatformStats = {
      totalAgents: results.length,
      healthyAgents: results.filter((a) => a.status === "healthy").length,
      degradedAgents: results.filter((a) => a.status === "degraded").length,
      unreachableAgents: results.filter((a) => a.status === "unreachable").length,
      lastChecked: new Date(),
    };
    setStats(newStats);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    checkAllHealth();

    // Auto-refresh every 30 seconds
    const interval = setInterval(checkAllHealth, 30_000);
    return () => clearInterval(interval);
  }, [checkAllHealth]);

  return (
    <div className="min-h-screen text-text-primary pb-12">
      {/* Main content */}
      <main className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
        
        {/* WAR ROOM BENTO GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
          
          {/* Left Column (8 cols) */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            <StatsBar stats={stats} />
            
            <section className="flex-1 glass-panel p-6 relative group overflow-hidden flex flex-col min-h-[450px]">
               <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2 tracking-wide uppercase">
                 <Workflow className="w-4 h-4 text-brand"/> Swarm Topology
               </h2>
               <TopologyMap agents={agents} />
            </section>
          </div>

          {/* Right Column (4 cols) */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            <section className="flex-1 glass-panel p-6 flex flex-col min-h-[450px]">
              <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2 mb-2 tracking-wide uppercase">
                <Terminal className="w-4 h-4 text-brand"/> Thought Log
              </h2>
              <LiveExecutionStream />
            </section>
          </div>
        </div>

        {/* Quick Actions Array */}
        <section className="mb-10">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand" />
            <h2 className="text-sm font-semibold text-text-primary tracking-wide uppercase">Command Shortcuts</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {QUICK_ACTIONS.map((action) => (
              <QuickActionCard
                key={`${action.agentId}-${action.taskType}`}
                action={action}
                onClick={setActiveAction}
              />
            ))}
          </div>
        </section>

        {/* Agent Fleet Grid */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-brand" />
              <h2 className="text-sm font-semibold text-text-primary tracking-wide uppercase">Active Fleet</h2>
            </div>
            <p className="text-xs text-brand font-mono bg-brand/10 px-2 py-1 rounded">
              {stats.healthyAgents}/{stats.totalAgents} ONLINE
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} onSelect={setSelectedAgent} />
            ))}
          </div>
        </section>

      </main>

      {/* Modals */}
      {selectedAgent && (
        <AgentDetailPanel agent={selectedAgent} onClose={() => setSelectedAgent(null)} />
      )}
      {activeAction && (
        <TaskModal action={activeAction} onClose={() => setActiveAction(null)} />
      )}
    </div>
  );
}
