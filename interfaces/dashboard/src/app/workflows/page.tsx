"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Code2,
  Filter,
  Loader2,
  LucideIcon,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Timer,
  Workflow,
  XCircle,
  Zap,
  BrainCircuit,
  Shield,
  GaugeCircle,
  Server,
  Globe,
  CpuIcon,
  FileSearch,
  LayoutList,
  GitBranch,
  BarChart3,
  SendHorizonal,
  X,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WorkflowStatus =
  | "running"
  | "completed"
  | "failed"
  | "queued"
  | "cancelled";
type StepStatus = "running" | "completed" | "failed" | "pending" | "skipped";

interface WorkflowStep {
  id: string;
  agentId: string;
  agentName: string;
  agentIcon: LucideIcon;
  agentColor: string;
  taskType: string;
  status: StepStatus;
  durationMs: number | null;
  result: string | null;
  error: string | null;
  startedAt: string | null;
}

interface WorkflowExecution {
  id: string;
  name: string;
  description: string;
  status: WorkflowStatus;
  steps: WorkflowStep[];
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  totalDurationMs: number | null;
  triggeredBy: string;
  input: string;
}

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  color: string;
  steps: { agentId: string; taskType: string }[];
  category: string;
}

// ---------------------------------------------------------------------------
// Agent icon map
// ---------------------------------------------------------------------------

const AGENT_ICON_MAP: Record<
  string,
  { icon: LucideIcon; color: string; name: string }
> = {
  codecraft: {
    icon: Code2,
    color: "from-blue-500 to-cyan-400",
    name: "CodeCraft",
  },
  securishield: {
    icon: Shield,
    color: "from-red-500 to-orange-400",
    name: "SecuriShield",
  },
  designforge: {
    icon: BrainCircuit,
    color: "from-purple-500 to-pink-400",
    name: "DesignForge",
  },
  perfpulse: {
    icon: Zap,
    color: "from-yellow-500 to-amber-400",
    name: "PerfPulse",
  },
  evaluator: {
    icon: GaugeCircle,
    color: "from-green-500 to-emerald-400",
    name: "Evaluator",
  },
  expressops: {
    icon: Server,
    color: "from-lime-500 to-green-400",
    name: "ExpressOps",
  },
  mobilefirstops: {
    icon: Globe,
    color: "from-sky-500 to-indigo-400",
    name: "MobileFirstOps",
  },
  "database-agent": {
    icon: CpuIcon,
    color: "from-teal-500 to-cyan-400",
    name: "Database Agent",
  },
  "soc2-compliance": {
    icon: FileSearch,
    color: "from-slate-500 to-gray-400",
    name: "SOC2 Compliance",
  },
  orchestrator: {
    icon: Workflow,
    color: "from-indigo-500 to-blue-400",
    name: "Orchestrator",
  },
};

function getAgentMeta(agentId: string) {
  return (
    AGENT_ICON_MAP[agentId] || {
      icon: Bot,
      color: "from-gray-500 to-gray-400",
      name: agentId,
    }
  );
}

// ---------------------------------------------------------------------------
// Workflow Templates
// ---------------------------------------------------------------------------

const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "feature-dev",
    name: "Feature Development",
    description:
      "Full feature lifecycle — design, code, security scan, quality check",
    icon: Sparkles,
    color: "from-blue-600 to-violet-600",
    category: "Development",
    steps: [
      { agentId: "designforge", taskType: "analyze_architecture" },
      { agentId: "codecraft", taskType: "generate_code" },
      { agentId: "securishield", taskType: "scan_code" },
      { agentId: "evaluator", taskType: "evaluate_quality" },
    ],
  },
  {
    id: "security-audit",
    name: "Security Audit",
    description: "Comprehensive security scan with compliance verification",
    icon: Shield,
    color: "from-red-600 to-orange-500",
    category: "Security",
    steps: [
      { agentId: "securishield", taskType: "scan_code" },
      { agentId: "securishield", taskType: "scan_dependencies" },
      { agentId: "soc2-compliance", taskType: "compliance_check" },
    ],
  },
  {
    id: "code-review",
    name: "Code Review Pipeline",
    description:
      "Automated code review with quality, security, and performance analysis",
    icon: Code2,
    color: "from-emerald-600 to-teal-500",
    category: "Quality",
    steps: [
      { agentId: "evaluator", taskType: "evaluate_quality" },
      { agentId: "securishield", taskType: "scan_code" },
      { agentId: "perfpulse", taskType: "analyze_performance" },
    ],
  },
  {
    id: "api-build",
    name: "Build REST API",
    description: "Generate Express.js API with database schema and tests",
    icon: Server,
    color: "from-lime-600 to-green-500",
    category: "Development",
    steps: [
      { agentId: "database-agent", taskType: "design_schema" },
      { agentId: "expressops", taskType: "generate_express_app" },
      { agentId: "codecraft", taskType: "write_tests" },
      { agentId: "securishield", taskType: "scan_code" },
    ],
  },
  {
    id: "perf-optimize",
    name: "Performance Optimization",
    description: "Profile, analyze, and optimize code performance",
    icon: Zap,
    color: "from-yellow-600 to-amber-500",
    category: "Performance",
    steps: [
      { agentId: "perfpulse", taskType: "analyze_performance" },
      { agentId: "codecraft", taskType: "optimize_code" },
      { agentId: "evaluator", taskType: "evaluate_quality" },
    ],
  },
  {
    id: "mobile-app",
    name: "Mobile App Scaffold",
    description:
      "Generate mobile app with architecture review and security hardening",
    icon: Globe,
    color: "from-sky-600 to-indigo-500",
    category: "Development",
    steps: [
      { agentId: "designforge", taskType: "analyze_architecture" },
      { agentId: "mobilefirstops", taskType: "generate_mobile_app" },
      { agentId: "securishield", taskType: "scan_code" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Mock data generator
// ---------------------------------------------------------------------------

function generateMockExecutions(): WorkflowExecution[] {
  const now = new Date();

  const makeStep = (
    agentId: string,
    taskType: string,
    status: StepStatus,
    durationMs: number | null,
    error?: string | null,
  ): WorkflowStep => {
    const meta = getAgentMeta(agentId);
    return {
      id: `step-${agentId}-${Math.random().toString(36).slice(2, 8)}`,
      agentId,
      agentName: meta.name,
      agentIcon: meta.icon,
      agentColor: meta.color,
      taskType,
      status,
      durationMs,
      result: status === "completed" ? "Task completed successfully" : null,
      error: error || null,
      startedAt:
        status !== "pending"
          ? new Date(now.getTime() - (durationMs || 0)).toISOString()
          : null,
    };
  };

  return [
    {
      id: "wf-001",
      name: "Feature Development",
      description: "Add JWT authentication with RBAC",
      status: "running",
      triggeredBy: "Manual",
      input:
        "Add JWT authentication with role-based access control to the Express API",
      createdAt: new Date(now.getTime() - 120_000).toISOString(),
      startedAt: new Date(now.getTime() - 115_000).toISOString(),
      completedAt: null,
      totalDurationMs: null,
      steps: [
        makeStep("designforge", "analyze_architecture", "completed", 3200),
        makeStep("codecraft", "generate_code", "completed", 8400),
        makeStep("securishield", "scan_code", "running", null),
        makeStep("evaluator", "evaluate_quality", "pending", null),
      ],
    },
    {
      id: "wf-002",
      name: "Security Audit",
      description: "Full codebase security scan — sprint 14",
      status: "completed",
      triggeredBy: "Scheduled",
      input: "Run comprehensive security audit on the entire codebase",
      createdAt: new Date(now.getTime() - 3_600_000).toISOString(),
      startedAt: new Date(now.getTime() - 3_595_000).toISOString(),
      completedAt: new Date(now.getTime() - 3_540_000).toISOString(),
      totalDurationMs: 55_000,
      steps: [
        makeStep("securishield", "scan_code", "completed", 18200),
        makeStep("securishield", "scan_dependencies", "completed", 12400),
        makeStep("soc2-compliance", "compliance_check", "completed", 22800),
      ],
    },
    {
      id: "wf-003",
      name: "Code Review Pipeline",
      description: "PR #247 — refactor user service",
      status: "failed",
      triggeredBy: "Git Hook",
      input: "Review PR #247 changes to src/services/user.ts",
      createdAt: new Date(now.getTime() - 7_200_000).toISOString(),
      startedAt: new Date(now.getTime() - 7_195_000).toISOString(),
      completedAt: new Date(now.getTime() - 7_160_000).toISOString(),
      totalDurationMs: 35_000,
      steps: [
        makeStep("evaluator", "evaluate_quality", "completed", 9800),
        makeStep(
          "securishield",
          "scan_code",
          "failed",
          14200,
          "Timeout: agent did not respond within 30s",
        ),
        makeStep("perfpulse", "analyze_performance", "skipped", null),
      ],
    },
    {
      id: "wf-004",
      name: "Build REST API",
      description: "Generate inventory management API endpoints",
      status: "completed",
      triggeredBy: "Manual",
      input: "Build a REST API for inventory management with CRUD operations",
      createdAt: new Date(now.getTime() - 14_400_000).toISOString(),
      startedAt: new Date(now.getTime() - 14_395_000).toISOString(),
      completedAt: new Date(now.getTime() - 14_300_000).toISOString(),
      totalDurationMs: 95_000,
      steps: [
        makeStep("database-agent", "design_schema", "completed", 15600),
        makeStep("expressops", "generate_express_app", "completed", 28400),
        makeStep("codecraft", "write_tests", "completed", 22000),
        makeStep("securishield", "scan_code", "completed", 18200),
      ],
    },
    {
      id: "wf-005",
      name: "Performance Optimization",
      description: "Optimize database query layer — N+1 fixes",
      status: "queued",
      triggeredBy: "Manual",
      input: "Analyze and fix N+1 query issues in the ORM layer",
      createdAt: new Date(now.getTime() - 30_000).toISOString(),
      startedAt: null,
      completedAt: null,
      totalDurationMs: null,
      steps: [
        makeStep("perfpulse", "analyze_performance", "pending", null),
        makeStep("codecraft", "optimize_code", "pending", null),
        makeStep("evaluator", "evaluate_quality", "pending", null),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = ms / 1000;
  if (secs < 60) return `${secs.toFixed(1)}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = Math.floor(secs % 60);
  return `${mins}m ${remainSecs}s`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Status UI helpers
// ---------------------------------------------------------------------------

const WORKFLOW_STATUS_CONFIG: Record<
  WorkflowStatus,
  { label: string; classes: string; dot: string; icon: LucideIcon }
> = {
  running: {
    label: "Running",
    classes: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    dot: "bg-blue-400 animate-pulse",
    icon: Loader2,
  },
  completed: {
    label: "Completed",
    classes: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    dot: "bg-emerald-400",
    icon: CheckCircle2,
  },
  failed: {
    label: "Failed",
    classes: "bg-red-500/10 text-red-400 border-red-500/30",
    dot: "bg-red-400",
    icon: XCircle,
  },
  queued: {
    label: "Queued",
    classes: "bg-gray-500/10 text-text-secondary border-gray-500/30",
    dot: "bg-gray-400",
    icon: Clock,
  },
  cancelled: {
    label: "Cancelled",
    classes: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    dot: "bg-yellow-400",
    icon: Pause,
  },
};

const STEP_STATUS_CONFIG: Record<
  StepStatus,
  { label: string; color: string; bgColor: string; icon: LucideIcon }
> = {
  running: {
    label: "Running",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    icon: Loader2,
  },
  completed: {
    label: "Done",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    icon: CheckCircle2,
  },
  failed: {
    label: "Failed",
    color: "text-red-400",
    bgColor: "bg-red-500/10",
    icon: XCircle,
  },
  pending: {
    label: "Pending",
    color: "text-text-tertiary",
    bgColor: "bg-gray-500/10",
    icon: Clock,
  },
  skipped: {
    label: "Skipped",
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/10",
    icon: AlertTriangle,
  },
};

function WorkflowStatusBadge({ status }: { status: WorkflowStatus }) {
  const cfg = WORKFLOW_STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${cfg.classes}`}
    >
      {status === "running" ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      )}
      {cfg.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Pipeline Visualization
// ---------------------------------------------------------------------------

function PipelineView({ steps }: { steps: WorkflowStep[] }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {steps.map((step, i) => {
        const cfg = STEP_STATUS_CONFIG[step.status];
        const StepIcon = step.agentIcon;
        const StatusIcon = cfg.icon;

        return (
          <React.Fragment key={step.id}>
            {/* Step node */}
            <div className="group relative flex flex-col items-center gap-1.5 shrink-0">
              <div
                className={`relative flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${step.agentColor} shadow-lg ring-2 ring-offset-2 ring-offset-[#090b10] ${
                  step.status === "running"
                    ? "ring-blue-500/60"
                    : step.status === "completed"
                      ? "ring-emerald-500/40"
                      : step.status === "failed"
                        ? "ring-red-500/40"
                        : "ring-white/[0.06]"
                }`}
              >
                <StepIcon className="h-5 w-5 text-text-primary" />
                {/* Status indicator */}
                <div
                  className={`absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full ${cfg.bgColor} ring-2 ring-[#090b10]`}
                >
                  <StatusIcon
                    className={`h-2.5 w-2.5 ${cfg.color} ${step.status === "running" ? "animate-spin" : ""}`}
                  />
                </div>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-medium text-text-secondary max-w-[80px] truncate">
                  {step.agentName}
                </p>
                <p className="text-[9px] text-text-tertiary max-w-[80px] truncate">
                  {step.taskType}
                </p>
                {step.durationMs !== null && (
                  <p className="text-[9px] text-text-tertiary">
                    {formatDuration(step.durationMs)}
                  </p>
                )}
              </div>

              {/* Hover tooltip */}
              <div className="pointer-events-none absolute -top-20 left-1/2 z-20 -translate-x-1/2 scale-90 rounded-lg border border-border-light bg-bg-primary px-3 py-2 opacity-0 shadow-xl transition-all group-hover:scale-100 group-hover:opacity-100">
                <p className="whitespace-nowrap text-xs font-medium text-text-primary">
                  {step.agentName}
                </p>
                <p className="whitespace-nowrap text-[10px] text-text-secondary">
                  {step.taskType}
                </p>
                {step.error && (
                  <p className="mt-1 max-w-[200px] text-[10px] text-red-400 break-words">
                    {step.error}
                  </p>
                )}
              </div>
            </div>

            {/* Connector arrow */}
            {i < steps.length - 1 && (
              <div className="flex shrink-0 items-center px-1">
                <div
                  className={`h-px w-6 ${
                    steps[i + 1].status === "pending" ||
                    steps[i + 1].status === "skipped"
                      ? "bg-gray-700 border-dashed"
                      : "bg-gradient-to-r from-gray-600 to-gray-500"
                  }`}
                />
                <ChevronRight className="h-3 w-3 shrink-0 text-text-tertiary -ml-1" />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workflow Card
// ---------------------------------------------------------------------------

function WorkflowCard({
  execution,
  onSelect,
}: {
  execution: WorkflowExecution;
  onSelect: (e: WorkflowExecution) => void;
}) {
  const completedSteps = execution.steps.filter(
    (s) => s.status === "completed",
  ).length;
  const progressPct = (completedSteps / execution.steps.length) * 100;

  return (
    <button
      onClick={() => onSelect(execution)}
      className="group w-full rounded-xl border border-border bg-bg-secondary p-5 text-left transition-all hover:border-border-light hover:bg-bg-hover hover:shadow-lg hover:shadow-black/20 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-text-primary">
              {execution.name}
            </h3>
            <WorkflowStatusBadge status={execution.status} />
          </div>
          <p className="mt-1 truncate text-xs text-text-secondary">
            {execution.description}
          </p>
        </div>
        <span className="shrink-0 font-mono text-[10px] text-text-tertiary">
          {execution.id}
        </span>
      </div>

      {/* Pipeline visualization */}
      <div className="mt-4">
        <PipelineView steps={execution.steps} />
      </div>

      {/* Progress bar */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-[10px] text-text-tertiary">
          <span>
            {completedSteps} / {execution.steps.length} steps
          </span>
          <span>{Math.round(progressPct)}%</span>
        </div>
        <div className="mt-1 h-1 w-full rounded-full bg-bg-hover">
          <div
            className={`h-1 rounded-full transition-all ${
              execution.status === "failed"
                ? "bg-red-500"
                : execution.status === "completed"
                  ? "bg-emerald-500"
                  : "bg-blue-500"
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center gap-4 text-[11px] text-text-tertiary">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {timeAgo(execution.createdAt)}
        </span>
        {execution.totalDurationMs && (
          <span className="flex items-center gap-1">
            <Timer className="h-3 w-3" />
            {formatDuration(execution.totalDurationMs)}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Activity className="h-3 w-3" />
          {execution.triggeredBy}
        </span>
        <span className="ml-auto flex items-center gap-1 text-blue-400 opacity-0 transition-opacity group-hover:opacity-100">
          View details <ChevronRight className="h-3 w-3" />
        </span>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Workflow Detail Panel
// ---------------------------------------------------------------------------

function WorkflowDetailPanel({
  execution,
  onClose,
}: {
  execution: WorkflowExecution;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-10 flex h-full w-full max-w-2xl flex-col overflow-hidden border-l border-border bg-bg-primary shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <Workflow className="h-5 w-5 shrink-0 text-blue-400" />
              <h2 className="truncate text-lg font-bold text-text-primary">
                {execution.name}
              </h2>
              <WorkflowStatusBadge status={execution.status} />
            </div>
            <p className="mt-1 text-sm text-text-secondary">
              {execution.description}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-secondary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Meta cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              {
                label: "ID",
                value: execution.id,
                icon: GitBranch,
              },
              {
                label: "Triggered by",
                value: execution.triggeredBy,
                icon: Activity,
              },
              {
                label: "Duration",
                value: execution.totalDurationMs
                  ? formatDuration(execution.totalDurationMs)
                  : "In progress…",
                icon: Timer,
              },
              {
                label: "Created",
                value: timeAgo(execution.createdAt),
                icon: Clock,
              },
            ].map((item) => {
              const ItemIcon = item.icon;
              return (
                <div
                  key={item.label}
                  className="rounded-xl border border-border bg-bg-secondary p-3"
                >
                  <div className="flex items-center gap-1.5 text-[10px] text-text-tertiary">
                    <ItemIcon className="h-3 w-3" />
                    {item.label}
                  </div>
                  <p className="mt-1 truncate text-sm font-semibold text-text-primary">
                    {item.value}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Input */}
          <div className="mt-5 rounded-xl border border-border bg-bg-secondary p-4">
            <h3 className="mb-2 text-xs font-semibold text-text-secondary">
              Input Prompt
            </h3>
            <p className="text-sm leading-relaxed text-text-primary">
              {execution.input}
            </p>
          </div>

          {/* Pipeline */}
          <div className="mt-5 rounded-xl border border-border bg-bg-secondary p-4">
            <h3 className="mb-4 text-xs font-semibold text-text-secondary">
              Pipeline
            </h3>
            <PipelineView steps={execution.steps} />
          </div>

          {/* Step list */}
          <div className="mt-5">
            <h3 className="mb-3 text-xs font-semibold text-text-secondary">
              Step Details
            </h3>
            <div className="space-y-3">
              {execution.steps.map((step, idx) => {
                const cfg = STEP_STATUS_CONFIG[step.status];
                const StepIcon = step.agentIcon;
                const StatusIcon = cfg.icon;

                return (
                  <div
                    key={step.id}
                    className={`rounded-xl border p-4 transition-colors ${
                      step.status === "running"
                        ? "border-blue-500/30 bg-blue-500/5"
                        : step.status === "failed"
                          ? "border-red-500/20 bg-red-500/5"
                          : "border-border bg-bg-secondary"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Step number */}
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border-light bg-bg-secondary text-xs font-bold text-text-secondary">
                        {idx + 1}
                      </div>

                      {/* Agent icon */}
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${step.agentColor} shadow`}
                      >
                        <StepIcon className="h-4 w-4 text-text-primary" />
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-text-primary">
                            {step.agentName}
                          </p>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${cfg.bgColor} ${cfg.color}`}
                          >
                            <StatusIcon
                              className={`h-2.5 w-2.5 ${step.status === "running" ? "animate-spin" : ""}`}
                            />
                            {cfg.label}
                          </span>
                        </div>
                        <p className="mt-0.5 font-mono text-xs text-text-tertiary">
                          {step.taskType}
                        </p>

                        {step.durationMs !== null && (
                          <p className="mt-1 text-xs text-text-tertiary">
                            Duration:{" "}
                            <span className="text-text-secondary">
                              {formatDuration(step.durationMs)}
                            </span>
                          </p>
                        )}

                        {step.result && (
                          <p className="mt-1.5 text-xs text-emerald-400/80">
                            {step.result}
                          </p>
                        )}

                        {step.error && (
                          <div className="mt-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
                            <p className="font-mono text-xs text-red-300">
                              {step.error}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create Workflow Modal
// ---------------------------------------------------------------------------

function CreateWorkflowModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (template: WorkflowTemplate, input: string) => void;
}) {
  const [selectedTemplate, setSelectedTemplate] =
    useState<WorkflowTemplate | null>(null);
  const [input, setInput] = useState("");

  const categories = Array.from(
    new Set(WORKFLOW_TEMPLATES.map((t) => t.category)),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-2xl border border-border-light bg-bg-primary shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-blue-400" />
            <h2 className="text-lg font-bold text-text-primary">Create Workflow</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-secondary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-6">
          {!selectedTemplate ? (
            <>
              <p className="mb-4 text-sm text-text-secondary">
                Choose a workflow template to get started.
              </p>
              {categories.map((cat) => (
                <div key={cat} className="mb-5">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    {cat}
                  </h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {WORKFLOW_TEMPLATES.filter((t) => t.category === cat).map(
                      (tmpl) => {
                        const TmplIcon = tmpl.icon;
                        return (
                          <button
                            key={tmpl.id}
                            onClick={() => setSelectedTemplate(tmpl)}
                            className="flex items-start gap-3 rounded-xl border border-border bg-bg-secondary p-4 text-left transition-all hover:border-border-light hover:bg-bg-hover focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                          >
                            <div
                              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${tmpl.color} shadow-lg`}
                            >
                              <TmplIcon className="h-5 w-5 text-text-primary" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-text-primary">
                                {tmpl.name}
                              </p>
                              <p className="mt-0.5 text-xs text-text-secondary">
                                {tmpl.description}
                              </p>
                              <p className="mt-1.5 text-[10px] text-text-tertiary">
                                {tmpl.steps.length} steps &middot;{" "}
                                {tmpl.steps
                                  .map((s) => getAgentMeta(s.agentId).name)
                                  .join(" → ")}
                              </p>
                            </div>
                          </button>
                        );
                      },
                    )}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <>
              {/* Selected template header */}
              <button
                onClick={() => setSelectedTemplate(null)}
                className="mb-4 flex items-center gap-1 text-xs text-text-secondary transition-colors hover:text-text-primary"
              >
                ← Back to templates
              </button>

              <div className="mb-4 flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${selectedTemplate.color} shadow-lg`}
                >
                  {React.createElement(selectedTemplate.icon, {
                    className: "h-5 w-5 text-text-primary",
                  })}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">
                    {selectedTemplate.name}
                  </h3>
                  <p className="text-xs text-text-secondary">
                    {selectedTemplate.description}
                  </p>
                </div>
              </div>

              {/* Pipeline preview */}
              <div className="mb-4 rounded-xl border border-border bg-bg-secondary p-4">
                <h4 className="mb-3 text-xs font-semibold text-text-secondary">
                  Pipeline Steps
                </h4>
                <div className="flex items-center gap-2 overflow-x-auto">
                  {selectedTemplate.steps.map((step, i) => {
                    const meta = getAgentMeta(step.agentId);
                    const Icon = meta.icon;
                    return (
                      <React.Fragment key={i}>
                        <div className="flex shrink-0 flex-col items-center gap-1">
                          <div
                            className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${meta.color} shadow`}
                          >
                            <Icon className="h-4 w-4 text-text-primary" />
                          </div>
                          <span className="max-w-[70px] truncate text-[10px] text-text-secondary">
                            {meta.name}
                          </span>
                        </div>
                        {i < selectedTemplate.steps.length - 1 && (
                          <ArrowRight className="h-4 w-4 shrink-0 text-text-tertiary" />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>

              {/* Input */}
              <div className="mb-4">
                <label className="mb-1.5 block text-xs font-medium text-text-secondary">
                  Describe what you want to build or analyze
                </label>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="e.g., Add JWT authentication with role-based access control…"
                  rows={4}
                  className="w-full resize-none rounded-lg border border-border-light bg-bg-secondary px-4 py-3 text-sm text-text-primary placeholder-gray-600 outline-none transition-colors focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30"
                  autoFocus
                />
              </div>

              {/* Submit */}
              <button
                onClick={() => {
                  if (input.trim()) onCreate(selectedTemplate, input);
                }}
                disabled={!input.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-text-primary shadow-lg transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Play className="h-4 w-4" />
                Launch Workflow
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function WorkflowsPage() {
  const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
  const [selected, setSelected] = useState<WorkflowExecution | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<WorkflowStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const loadExecutions = useCallback(() => {
    setRefreshing(true);
    // In production this would call the orchestrator API
    setTimeout(() => {
      setExecutions(generateMockExecutions());
      setRefreshing(false);
    }, 400);
  }, []);

  useEffect(() => {
    loadExecutions();
  }, [loadExecutions]);

  const handleCreate = (template: WorkflowTemplate, input: string) => {
    const now = new Date();
    const newExec: WorkflowExecution = {
      id: `wf-${Date.now().toString(36)}`,
      name: template.name,
      description: input.slice(0, 80),
      status: "queued",
      triggeredBy: "Manual",
      input,
      createdAt: now.toISOString(),
      startedAt: null,
      completedAt: null,
      totalDurationMs: null,
      steps: template.steps.map((s) => {
        const meta = getAgentMeta(s.agentId);
        return {
          id: `step-${Math.random().toString(36).slice(2, 8)}`,
          agentId: s.agentId,
          agentName: meta.name,
          agentIcon: meta.icon,
          agentColor: meta.color,
          taskType: s.taskType,
          status: "pending" as StepStatus,
          durationMs: null,
          result: null,
          error: null,
          startedAt: null,
        };
      }),
    };

    setExecutions((prev) => [newExec, ...prev]);
    setShowCreate(false);
  };

  const filtered = executions.filter((e) => {
    if (filter !== "all" && e.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const counts = {
    total: executions.length,
    running: executions.filter((e) => e.status === "running").length,
    completed: executions.filter((e) => e.status === "completed").length,
    failed: executions.filter((e) => e.status === "failed").length,
    queued: executions.filter((e) => e.status === "queued").length,
  };

  const statusFilters: { id: WorkflowStatus | "all"; label: string }[] = [
    { id: "all", label: `All (${counts.total})` },
    { id: "running", label: `Running (${counts.running})` },
    { id: "completed", label: `Completed (${counts.completed})` },
    { id: "failed", label: `Failed (${counts.failed})` },
    { id: "queued", label: `Queued (${counts.queued})` },
  ];

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      {/* Header */}
      <header className="border-b border-border bg-bg-primary">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-text-primary">
              Workflows
            </h1>
            <p className="text-xs text-text-tertiary">
              Multi-agent orchestration pipelines &middot; {counts.running}{" "}
              running
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadExecutions}
              disabled={refreshing}
              className="flex items-center gap-1.5 rounded-lg border border-border-light bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover disabled:opacity-50"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 px-3 py-1.5 text-xs font-semibold text-text-primary shadow-lg transition-all hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              New Workflow
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Stats bar */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            {
              label: "Total",
              value: counts.total,
              icon: LayoutList,
              color: "text-blue-400",
              bg: "bg-blue-500/10",
            },
            {
              label: "Running",
              value: counts.running,
              icon: Loader2,
              color: "text-blue-400",
              bg: "bg-blue-500/10",
            },
            {
              label: "Completed",
              value: counts.completed,
              icon: CheckCircle2,
              color: "text-emerald-400",
              bg: "bg-emerald-500/10",
            },
            {
              label: "Failed",
              value: counts.failed,
              icon: XCircle,
              color: "text-red-400",
              bg: "bg-red-500/10",
            },
          ].map((stat) => {
            const StatIcon = stat.icon;
            return (
              <div
                key={stat.label}
                className="flex items-center gap-3 rounded-xl border border-border bg-bg-secondary px-4 py-3"
              >
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-lg ${stat.bg}`}
                >
                  <StatIcon className={`h-4 w-4 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-xl font-bold text-text-primary">{stat.value}</p>
                  <p className="text-xs text-text-tertiary">{stat.label}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Filters */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2 overflow-x-auto">
            {statusFilters.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  filter === f.id
                    ? "bg-bg-hover text-text-primary"
                    : "text-text-tertiary hover:bg-bg-hover hover:text-text-secondary"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search workflows…"
              className="w-full rounded-lg border border-border-light bg-bg-secondary py-2 pl-9 pr-4 text-sm text-text-primary placeholder-gray-600 outline-none transition-colors focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30 sm:w-64"
            />
          </div>
        </div>

        {/* Executions list */}
        <div className="mt-6 space-y-4">
          {filtered.map((exec) => (
            <WorkflowCard
              key={exec.id}
              execution={exec}
              onSelect={setSelected}
            />
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="mt-16 text-center">
            <Workflow className="mx-auto h-12 w-12 text-gray-700" />
            <p className="mt-3 text-sm text-text-tertiary">
              {executions.length === 0
                ? 'No workflows yet. Click "New Workflow" to create one.'
                : "No workflows match your filters."}
            </p>
          </div>
        )}
      </main>

      {/* Detail Panel */}
      {selected && (
        <WorkflowDetailPanel
          execution={selected}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Create Modal */}
      {showCreate && (
        <CreateWorkflowModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}
