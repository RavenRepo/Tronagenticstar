"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  BellRing,
  Bot,
  BrainCircuit,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Code2,
  Copy,
  CpuIcon,
  Database,
  Eye,
  EyeOff,
  FileSearch,
  GaugeCircle,
  Globe,
  Hash,
  Info,
  Key,
  Layers,
  Loader2,
  Lock,
  LucideIcon,
  Mail,
  MessageSquare,
  Monitor,
  Moon,
  Palette,
  Plug,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Server,
  Settings,
  Shield,
  ShieldCheck,
  Sliders,
  Sparkles,
  Sun,
  Terminal,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Unlock,
  Upload,
  User,
  Users,
  Webhook,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActiveTab =
  | "general"
  | "api-keys"
  | "agents"
  | "notifications"
  | "appearance"
  | "integrations";

type ThemeMode = "dark" | "light" | "system";

interface ApiKey {
  id: string;
  name: string;
  provider: string;
  icon: LucideIcon;
  color: string;
  maskedValue: string;
  rawValue: string;
  isConfigured: boolean;
  lastUsed: Date | null;
  status: "active" | "expired" | "invalid" | "unconfigured";
}

interface AgentConfig {
  id: string;
  name: string;
  icon: LucideIcon;
  color: string;
  port: number;
  enabled: boolean;
  llmProvider: string;
  model: string;
  maxTokens: number;
  temperature: number;
  timeout: number;
  retries: number;
  rateLimit: number;
}

interface NotificationChannel {
  id: string;
  name: string;
  type: "email" | "slack" | "webhook" | "in-app";
  icon: LucideIcon;
  color: string;
  enabled: boolean;
  target: string;
}

interface NotificationRule {
  id: string;
  event: string;
  description: string;
  channels: string[];
  enabled: boolean;
  severity: "all" | "warn" | "error" | "critical";
}

interface PlatformSettings {
  instanceName: string;
  instanceUrl: string;
  adminEmail: string;
  logRetentionDays: number;
  maxConcurrentTasks: number;
  taskTimeoutSeconds: number;
  enableTelemetry: boolean;
  enableAutoUpdates: boolean;
  maintenanceMode: boolean;
  debugMode: boolean;
  corsOrigins: string;
  rateLimitGlobal: number;
  sessionTimeoutMinutes: number;
  maxUploadSizeMb: number;
}

interface IntegrationConfig {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  color: string;
  connected: boolean;
  url: string;
  status: "healthy" | "degraded" | "unreachable" | "unconfigured";
  lastCheck: Date | null;
}

// ---------------------------------------------------------------------------
// Default / mock data
// ---------------------------------------------------------------------------

function generateApiKeys(): ApiKey[] {
  return [
    {
      id: "openai",
      name: "OpenAI",
      provider: "openai",
      icon: Sparkles,
      color: "text-emerald-400",
      maskedValue: "sk-proj-****...****f9a2",
      rawValue: "sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxf9a2",
      isConfigured: true,
      lastUsed: new Date(Date.now() - 120_000),
      status: "active",
    },
    {
      id: "anthropic",
      name: "Anthropic",
      provider: "anthropic",
      icon: BrainCircuit,
      color: "text-orange-400",
      maskedValue: "sk-ant-****...****b3e1",
      rawValue: "sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxb3e1",
      isConfigured: true,
      lastUsed: new Date(Date.now() - 3_600_000),
      status: "active",
    },
    {
      id: "gemini",
      name: "Google Gemini",
      provider: "gemini",
      icon: Search,
      color: "text-blue-400",
      maskedValue: "",
      rawValue: "",
      isConfigured: false,
      lastUsed: null,
      status: "unconfigured",
    },
    {
      id: "openrouter",
      name: "OpenRouter",
      provider: "openrouter",
      icon: Globe,
      color: "text-purple-400",
      maskedValue: "sk-or-****...****7d4c",
      rawValue: "sk-or-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx7d4c",
      isConfigured: true,
      lastUsed: new Date(Date.now() - 86_400_000),
      status: "active",
    },
    {
      id: "cohere",
      name: "Cohere",
      provider: "cohere",
      icon: Layers,
      color: "text-teal-400",
      maskedValue: "",
      rawValue: "",
      isConfigured: false,
      lastUsed: null,
      status: "unconfigured",
    },
    {
      id: "huggingface",
      name: "Hugging Face",
      provider: "huggingface",
      icon: Bot,
      color: "text-yellow-400",
      maskedValue: "hf_****...****Q2nR",
      rawValue: "hf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxQ2nR",
      isConfigured: true,
      lastUsed: new Date(Date.now() - 7_200_000),
      status: "expired",
    },
  ];
}

function generateAgentConfigs(): AgentConfig[] {
  return [
    {
      id: "codecraft",
      name: "CodeCraft",
      icon: Code2,
      color: "text-emerald-400",
      port: 8010,
      enabled: true,
      llmProvider: "openai",
      model: "gpt-4o",
      maxTokens: 4096,
      temperature: 0.3,
      timeout: 60,
      retries: 3,
      rateLimit: 100,
    },
    {
      id: "securishield",
      name: "SecuriShield",
      icon: Shield,
      color: "text-red-400",
      port: 8011,
      enabled: true,
      llmProvider: "anthropic",
      model: "claude-sonnet-4-20250514",
      maxTokens: 4096,
      temperature: 0.1,
      timeout: 90,
      retries: 2,
      rateLimit: 50,
    },
    {
      id: "designforge",
      name: "DesignForge",
      icon: Sparkles,
      color: "text-pink-400",
      port: 8012,
      enabled: true,
      llmProvider: "openai",
      model: "gpt-4o",
      maxTokens: 4096,
      temperature: 0.7,
      timeout: 45,
      retries: 3,
      rateLimit: 80,
    },
    {
      id: "perfpulse",
      name: "PerfPulse",
      icon: GaugeCircle,
      color: "text-amber-400",
      port: 8013,
      enabled: true,
      llmProvider: "openai",
      model: "gpt-4o-mini",
      maxTokens: 2048,
      temperature: 0.2,
      timeout: 120,
      retries: 2,
      rateLimit: 60,
    },
    {
      id: "evaluator",
      name: "Evaluator",
      icon: CheckCircle2,
      color: "text-cyan-400",
      port: 8014,
      enabled: true,
      llmProvider: "anthropic",
      model: "claude-sonnet-4-20250514",
      maxTokens: 4096,
      temperature: 0.1,
      timeout: 60,
      retries: 3,
      rateLimit: 100,
    },
    {
      id: "expressops",
      name: "ExpressOps",
      icon: Zap,
      color: "text-yellow-400",
      port: 8015,
      enabled: true,
      llmProvider: "openai",
      model: "gpt-4o-mini",
      maxTokens: 2048,
      temperature: 0.3,
      timeout: 30,
      retries: 3,
      rateLimit: 120,
    },
    {
      id: "mobilefirstops",
      name: "MobileFirstOps",
      icon: CpuIcon,
      color: "text-teal-400",
      port: 8016,
      enabled: false,
      llmProvider: "openai",
      model: "gpt-4o",
      maxTokens: 4096,
      temperature: 0.4,
      timeout: 60,
      retries: 2,
      rateLimit: 60,
    },
    {
      id: "database-agent",
      name: "Database Agent",
      icon: Server,
      color: "text-orange-400",
      port: 8017,
      enabled: true,
      llmProvider: "openrouter",
      model: "anthropic/claude-sonnet-4-20250514",
      maxTokens: 4096,
      temperature: 0.1,
      timeout: 90,
      retries: 2,
      rateLimit: 40,
    },
    {
      id: "soc2-compliance",
      name: "SOC2 Compliance",
      icon: FileSearch,
      color: "text-indigo-400",
      port: 8018,
      enabled: true,
      llmProvider: "anthropic",
      model: "claude-sonnet-4-20250514",
      maxTokens: 4096,
      temperature: 0.0,
      timeout: 120,
      retries: 3,
      rateLimit: 30,
    },
  ];
}

function generateNotificationChannels(): NotificationChannel[] {
  return [
    {
      id: "email-admin",
      name: "Admin Email",
      type: "email",
      icon: Mail,
      color: "text-blue-400",
      enabled: true,
      target: "admin@constella.ai",
    },
    {
      id: "slack-alerts",
      name: "Slack #alerts",
      type: "slack",
      icon: MessageSquare,
      color: "text-green-400",
      enabled: true,
      target: "#platform-alerts",
    },
    {
      id: "webhook-pager",
      name: "PagerDuty Webhook",
      type: "webhook",
      icon: Webhook,
      color: "text-amber-400",
      enabled: false,
      target: "https://events.pagerduty.com/integration/xxx/enqueue",
    },
    {
      id: "in-app",
      name: "In-App Notifications",
      type: "in-app",
      icon: BellRing,
      color: "text-violet-400",
      enabled: true,
      target: "Dashboard toast & bell icon",
    },
  ];
}

function generateNotificationRules(): NotificationRule[] {
  return [
    {
      id: "agent-down",
      event: "Agent Unreachable",
      description: "An agent fails consecutive health checks",
      channels: ["email-admin", "slack-alerts"],
      enabled: true,
      severity: "error",
    },
    {
      id: "task-failed",
      event: "Task Failure",
      description: "A task execution fails after exhausting retries",
      channels: ["slack-alerts", "in-app"],
      enabled: true,
      severity: "error",
    },
    {
      id: "security-finding",
      event: "Security Finding (Critical)",
      description: "SecuriShield detects a critical vulnerability",
      channels: ["email-admin", "slack-alerts", "webhook-pager"],
      enabled: true,
      severity: "critical",
    },
    {
      id: "compliance-drift",
      event: "SOC2 Compliance Drift",
      description: "A SOC2 control falls below compliant status",
      channels: ["email-admin", "slack-alerts"],
      enabled: true,
      severity: "warn",
    },
    {
      id: "perf-degradation",
      event: "Performance Degradation",
      description: "p99 latency exceeds configured thresholds",
      channels: ["slack-alerts", "in-app"],
      enabled: true,
      severity: "warn",
    },
    {
      id: "llm-quota",
      event: "LLM Quota Warning",
      description: "API usage approaching provider rate limits",
      channels: ["in-app"],
      enabled: true,
      severity: "warn",
    },
    {
      id: "workflow-complete",
      event: "Workflow Completed",
      description: "A multi-step workflow finishes successfully",
      channels: ["in-app"],
      enabled: false,
      severity: "all",
    },
    {
      id: "maintenance",
      event: "Maintenance Mode Toggle",
      description: "Platform enters or exits maintenance mode",
      channels: ["email-admin", "slack-alerts"],
      enabled: true,
      severity: "all",
    },
  ];
}

function generateIntegrations(): IntegrationConfig[] {
  return [
    {
      id: "redis",
      name: "Redis",
      description: "In-memory cache and message broker",
      icon: Database,
      color: "text-red-400",
      connected: true,
      url: "localhost:6379",
      status: "healthy",
      lastCheck: new Date(Date.now() - 15_000),
    },
    {
      id: "qdrant",
      name: "Qdrant",
      description: "Vector database for RAG embeddings",
      icon: Activity,
      color: "text-purple-400",
      connected: true,
      url: "localhost:6333",
      status: "healthy",
      lastCheck: new Date(Date.now() - 15_000),
    },
    {
      id: "neo4j",
      name: "Neo4j",
      description: "Knowledge graph database",
      icon: Bot,
      color: "text-green-400",
      connected: true,
      url: "localhost:7474",
      status: "healthy",
      lastCheck: new Date(Date.now() - 15_000),
    },
    {
      id: "nats",
      name: "NATS JetStream",
      description: "Event streaming and messaging",
      icon: MessageSquare,
      color: "text-lime-400",
      connected: true,
      url: "localhost:4222",
      status: "healthy",
      lastCheck: new Date(Date.now() - 15_000),
    },
    {
      id: "grafana",
      name: "Grafana",
      description: "Monitoring and observability dashboards",
      icon: Monitor,
      color: "text-orange-400",
      connected: true,
      url: "localhost:3001",
      status: "healthy",
      lastCheck: new Date(Date.now() - 30_000),
    },
    {
      id: "prometheus",
      name: "Prometheus",
      description: "Metrics collection and alerting",
      icon: Activity,
      color: "text-amber-400",
      connected: true,
      url: "localhost:9090",
      status: "healthy",
      lastCheck: new Date(Date.now() - 30_000),
    },
    {
      id: "github",
      name: "GitHub",
      description: "Source code repository integration",
      icon: Code2,
      color: "text-text-secondary",
      connected: false,
      url: "",
      status: "unconfigured",
      lastCheck: null,
    },
    {
      id: "sentry",
      name: "Sentry",
      description: "Error tracking and monitoring",
      icon: AlertTriangle,
      color: "text-pink-400",
      connected: false,
      url: "",
      status: "unconfigured",
      lastCheck: null,
    },
  ];
}

const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  instanceName: "Constella AI Platform",
  instanceUrl: "http://localhost:3002",
  adminEmail: "admin@constella.ai",
  logRetentionDays: 30,
  maxConcurrentTasks: 20,
  taskTimeoutSeconds: 120,
  enableTelemetry: true,
  enableAutoUpdates: false,
  maintenanceMode: false,
  debugMode: false,
  corsOrigins: "http://localhost:3002,http://localhost:3000",
  rateLimitGlobal: 1000,
  sessionTimeoutMinutes: 60,
  maxUploadSizeMb: 50,
};

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="rounded p-1 text-text-tertiary transition-colors hover:bg-bg-hover hover:text-text-secondary"
      title="Copy to clipboard"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-400" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

function ToggleSwitch({
  enabled,
  onChange,
  disabled,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        enabled ? "bg-blue-600" : "bg-text-tertiary"
      } ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
          enabled ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function SectionCard({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description?: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-bg-primary overflow-hidden">
      <div className="flex items-start gap-3 border-b border-border px-5 py-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bg-hover">
          <Icon className="h-4 w-4 text-text-secondary" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
          {description && (
            <p className="mt-0.5 text-xs text-text-tertiary">{description}</p>
          )}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function FieldRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between py-3 border-b border-border last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs text-text-tertiary">{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  className?: string;
}) {
  return (
    <input
      type={type || "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`rounded-lg border border-border-light bg-bg-secondary px-3 py-1.5 text-sm text-text-primary placeholder-gray-600 outline-none transition-colors focus:border-blue-500/40 focus:bg-bg-hover ${className || "w-full sm:w-64"}`}
    />
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      min={min}
      max={max}
      step={step}
      className="w-28 rounded-lg border border-border-light bg-bg-secondary px-3 py-1.5 text-sm text-text-primary outline-none transition-colors focus:border-blue-500/40 focus:bg-bg-hover tabular-nums"
    />
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    healthy: "bg-emerald-500",
    active: "bg-emerald-500",
    degraded: "bg-amber-500",
    unreachable: "bg-red-500",
    invalid: "bg-red-500",
    expired: "bg-amber-500",
    unconfigured: "bg-gray-600",
  };
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${colors[status] || "bg-gray-600"}`}
    />
  );
}

function timeAgo(date: Date | null): string {
  if (!date) return "Never";
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Tab: General
// ---------------------------------------------------------------------------

function GeneralTab({
  settings,
  onChange,
}: {
  settings: PlatformSettings;
  onChange: (s: PlatformSettings) => void;
}) {
  const update = (partial: Partial<PlatformSettings>) => {
    onChange({ ...settings, ...partial });
  };

  return (
    <div className="space-y-6">
      <SectionCard
        title="Instance Configuration"
        description="Core platform identity and URL settings"
        icon={Settings}
      >
        <div className="space-y-0">
          <FieldRow
            label="Instance Name"
            description="Display name for this Constella deployment"
          >
            <TextInput
              value={settings.instanceName}
              onChange={(v) => update({ instanceName: v })}
            />
          </FieldRow>
          <FieldRow
            label="Instance URL"
            description="Public URL for the dashboard"
          >
            <TextInput
              value={settings.instanceUrl}
              onChange={(v) => update({ instanceUrl: v })}
            />
          </FieldRow>
          <FieldRow
            label="Admin Email"
            description="Primary admin contact email"
          >
            <TextInput
              value={settings.adminEmail}
              onChange={(v) => update({ adminEmail: v })}
              type="email"
            />
          </FieldRow>
        </div>
      </SectionCard>

      <SectionCard
        title="Task Execution"
        description="Control how tasks and workflows are processed"
        icon={Sliders}
      >
        <div className="space-y-0">
          <FieldRow
            label="Max Concurrent Tasks"
            description="Maximum number of tasks running simultaneously"
          >
            <NumberInput
              value={settings.maxConcurrentTasks}
              onChange={(v) => update({ maxConcurrentTasks: v })}
              min={1}
              max={100}
            />
          </FieldRow>
          <FieldRow
            label="Task Timeout (seconds)"
            description="Maximum time a single task can run before cancellation"
          >
            <NumberInput
              value={settings.taskTimeoutSeconds}
              onChange={(v) => update({ taskTimeoutSeconds: v })}
              min={10}
              max={600}
            />
          </FieldRow>
          <FieldRow
            label="Global Rate Limit"
            description="Max API requests per minute across all clients"
          >
            <NumberInput
              value={settings.rateLimitGlobal}
              onChange={(v) => update({ rateLimitGlobal: v })}
              min={10}
              max={10000}
              step={10}
            />
          </FieldRow>
        </div>
      </SectionCard>

      <SectionCard
        title="Security & Access"
        description="Session, CORS, and upload limits"
        icon={Lock}
      >
        <div className="space-y-0">
          <FieldRow
            label="Session Timeout (minutes)"
            description="How long before an idle session expires"
          >
            <NumberInput
              value={settings.sessionTimeoutMinutes}
              onChange={(v) => update({ sessionTimeoutMinutes: v })}
              min={5}
              max={1440}
            />
          </FieldRow>
          <FieldRow
            label="CORS Origins"
            description="Comma-separated list of allowed origins"
          >
            <TextInput
              value={settings.corsOrigins}
              onChange={(v) => update({ corsOrigins: v })}
              className="w-full sm:w-96"
            />
          </FieldRow>
          <FieldRow
            label="Max Upload Size (MB)"
            description="Maximum file upload size for API requests"
          >
            <NumberInput
              value={settings.maxUploadSizeMb}
              onChange={(v) => update({ maxUploadSizeMb: v })}
              min={1}
              max={500}
            />
          </FieldRow>
        </div>
      </SectionCard>

      <SectionCard
        title="Data & Logging"
        description="Log retention and telemetry configuration"
        icon={Database}
      >
        <div className="space-y-0">
          <FieldRow
            label="Log Retention (days)"
            description="How long to keep log data before auto-purge"
          >
            <NumberInput
              value={settings.logRetentionDays}
              onChange={(v) => update({ logRetentionDays: v })}
              min={1}
              max={365}
            />
          </FieldRow>
          <FieldRow
            label="Anonymous Telemetry"
            description="Send anonymous usage statistics to improve the platform"
          >
            <ToggleSwitch
              enabled={settings.enableTelemetry}
              onChange={(v) => update({ enableTelemetry: v })}
            />
          </FieldRow>
          <FieldRow
            label="Debug Mode"
            description="Enable verbose logging and debug endpoints (not for production)"
          >
            <ToggleSwitch
              enabled={settings.debugMode}
              onChange={(v) => update({ debugMode: v })}
            />
          </FieldRow>
        </div>
      </SectionCard>

      <SectionCard
        title="Maintenance"
        description="System-wide toggles and update settings"
        icon={Terminal}
      >
        <div className="space-y-0">
          <FieldRow
            label="Maintenance Mode"
            description="Disables task execution and shows a maintenance page to users"
          >
            <div className="flex items-center gap-3">
              {settings.maintenanceMode && (
                <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-400 border border-amber-500/20">
                  Active
                </span>
              )}
              <ToggleSwitch
                enabled={settings.maintenanceMode}
                onChange={(v) => update({ maintenanceMode: v })}
              />
            </div>
          </FieldRow>
          <FieldRow
            label="Auto Updates"
            description="Automatically apply platform updates during maintenance windows"
          >
            <ToggleSwitch
              enabled={settings.enableAutoUpdates}
              onChange={(v) => update({ enableAutoUpdates: v })}
            />
          </FieldRow>
        </div>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: API Keys
// ---------------------------------------------------------------------------

function ApiKeysTab({
  keys,
  onChange,
}: {
  keys: ApiKey[];
  onChange: (keys: ApiKey[]) => void;
}) {
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const toggleReveal = (id: string) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const startEdit = (key: ApiKey) => {
    setEditingKey(key.id);
    setEditValue(key.rawValue);
  };

  const saveEdit = (id: string) => {
    const updated = keys.map((k) => {
      if (k.id === id) {
        const hasValue = editValue.trim().length > 0;
        return {
          ...k,
          rawValue: editValue.trim(),
          maskedValue: hasValue
            ? `${editValue.trim().slice(0, 6)}****...****${editValue.trim().slice(-4)}`
            : "",
          isConfigured: hasValue,
          status: hasValue ? ("active" as const) : ("unconfigured" as const),
        };
      }
      return k;
    });
    onChange(updated);
    setEditingKey(null);
    setEditValue("");
    toast.success(`API key for ${keys.find((k) => k.id === id)?.name} saved`);
  };

  const removeKey = (id: string) => {
    const updated = keys.map((k) => {
      if (k.id === id) {
        return {
          ...k,
          rawValue: "",
          maskedValue: "",
          isConfigured: false,
          status: "unconfigured" as const,
          lastUsed: null,
        };
      }
      return k;
    });
    onChange(updated);
    toast.success(`API key for ${keys.find((k) => k.id === id)?.name} removed`);
  };

  return (
    <div className="space-y-6">
      <SectionCard
        title="LLM Provider API Keys"
        description="Manage API keys for language model providers used by agents"
        icon={Key}
      >
        <div className="space-y-3">
          {keys.map((key) => {
            const Icon = key.icon;
            const isEditing = editingKey === key.id;
            const isRevealed = revealedKeys.has(key.id);

            return (
              <div
                key={key.id}
                className="rounded-lg border border-border bg-bg-secondary p-4 transition-colors hover:bg-bg-secondary"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bg-hover">
                      <Icon className={`h-4 w-4 ${key.color}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-text-primary">
                          {key.name}
                        </p>
                        <StatusDot status={key.status} />
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider ${
                            key.status === "active"
                              ? "text-emerald-400"
                              : key.status === "expired"
                                ? "text-amber-400"
                                : key.status === "invalid"
                                  ? "text-red-400"
                                  : "text-text-tertiary"
                          }`}
                        >
                          {key.status}
                        </span>
                      </div>

                      {isEditing ? (
                        <div className="mt-2 flex items-center gap-2">
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            placeholder={`Enter ${key.name} API key…`}
                            className="w-full max-w-md rounded-lg border border-blue-500/30 bg-blue-500/5 px-3 py-1.5 font-mono text-xs text-text-primary placeholder-gray-600 outline-none focus:border-blue-500/50"
                            autoFocus
                          />
                          <button
                            onClick={() => saveEdit(key.id)}
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-blue-500"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setEditingKey(null);
                              setEditValue("");
                            }}
                            className="rounded-lg border border-border-light bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : key.isConfigured ? (
                        <div className="mt-1 flex items-center gap-2">
                          <code className="font-mono text-xs text-text-tertiary">
                            {isRevealed ? key.rawValue : key.maskedValue}
                          </code>
                          <button
                            onClick={() => toggleReveal(key.id)}
                            className="text-text-tertiary hover:text-text-secondary"
                          >
                            {isRevealed ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <CopyButton text={key.rawValue} />
                        </div>
                      ) : (
                        <p className="mt-1 text-xs text-text-tertiary">
                          No API key configured
                        </p>
                      )}

                      {key.lastUsed && (
                        <p className="mt-1 text-[10px] text-text-tertiary">
                          Last used: {timeAgo(key.lastUsed)}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={() => startEdit(key)}
                      className="rounded-lg border border-border-light bg-bg-secondary px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                    >
                      {key.isConfigured ? "Update" : "Configure"}
                    </button>
                    {key.isConfigured && (
                      <button
                        onClick={() => removeKey(key.id)}
                        className="rounded-lg border border-red-500/20 bg-red-500/5 p-1.5 text-red-400/60 transition-colors hover:bg-red-500/10 hover:text-red-400"
                        title="Remove key"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      <div className="rounded-xl border border-blue-500/10 bg-blue-500/[0.03] p-4">
        <div className="flex items-start gap-3">
          <Info className="h-4 w-4 shrink-0 text-blue-400 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-blue-300">
              Security Notice
            </p>
            <p className="mt-1 text-xs text-blue-400/60 leading-relaxed">
              API keys are stored encrypted in the server environment and never
              exposed in client-side code. For production deployments, use a
              secrets manager (e.g., HashiCorp Vault, AWS Secrets Manager) and
              set keys via environment variables in <code className="text-blue-300">.env.production</code>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Agents
// ---------------------------------------------------------------------------

function AgentsTab({
  agents,
  onChange,
}: {
  agents: AgentConfig[];
  onChange: (agents: AgentConfig[]) => void;
}) {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  const LLM_PROVIDERS = [
    "openai",
    "anthropic",
    "gemini",
    "openrouter",
    "cohere",
    "huggingface",
  ];
  const MODELS: Record<string, string[]> = {
    openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
    anthropic: ["claude-sonnet-4-20250514", "claude-3-haiku-20240307", "claude-3-opus-20240229"],
    gemini: ["gemini-1.5-pro", "gemini-1.5-flash"],
    openrouter: [
      "anthropic/claude-sonnet-4-20250514",
      "openai/gpt-4o",
      "meta-llama/llama-3-70b",
    ],
    cohere: ["command-r-plus", "command-r"],
    huggingface: ["meta-llama/Llama-3-8b", "mistralai/Mistral-7B"],
  };

  const updateAgent = (id: string, partial: Partial<AgentConfig>) => {
    onChange(agents.map((a) => (a.id === id ? { ...a, ...partial } : a)));
  };

  const selected = agents.find((a) => a.id === selectedAgent);

  return (
    <div className="space-y-6">
      <SectionCard
        title="Agent Configuration"
        description="Configure LLM providers, models, and execution parameters for each agent"
        icon={Bot}
      >
        <div className="space-y-2">
          {agents.map((agent) => {
            const Icon = agent.icon;
            const isExpanded = selectedAgent === agent.id;

            return (
              <div
                key={agent.id}
                className={`rounded-lg border transition-colors ${
                  isExpanded
                    ? "border-blue-500/20 bg-blue-500/[0.03]"
                    : "border-border bg-bg-secondary hover:bg-bg-secondary"
                }`}
              >
                {/* Header row */}
                <button
                  onClick={() =>
                    setSelectedAgent(isExpanded ? null : agent.id)
                  }
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${agent.enabled ? "bg-bg-hover" : "bg-bg-secondary"}`}
                  >
                    <Icon
                      className={`h-4 w-4 ${agent.enabled ? agent.color : "text-text-tertiary"}`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-semibold ${agent.enabled ? "text-text-primary" : "text-text-tertiary"}`}
                      >
                        {agent.name}
                      </span>
                      <span className="text-[10px] font-mono text-text-tertiary">
                        :{agent.port}
                      </span>
                    </div>
                    <p className="text-[11px] text-text-tertiary">
                      {agent.llmProvider}/{agent.model} · T={agent.temperature} ·
                      {agent.maxTokens} tokens
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <ToggleSwitch
                      enabled={agent.enabled}
                      onChange={(v) => updateAgent(agent.id, { enabled: v })}
                    />
                    <ChevronRight
                      className={`h-4 w-4 text-text-tertiary transition-transform ${isExpanded ? "rotate-90" : ""}`}
                    />
                  </div>
                </button>

                {/* Expanded config */}
                {isExpanded && (
                  <div className="border-t border-border px-4 py-4 space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {/* LLM Provider */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-text-secondary">
                          LLM Provider
                        </label>
                        <select
                          value={agent.llmProvider}
                          onChange={(e) =>
                            updateAgent(agent.id, {
                              llmProvider: e.target.value,
                              model:
                                MODELS[e.target.value]?.[0] || agent.model,
                            })
                          }
                          className="w-full rounded-lg border border-border-light bg-bg-secondary px-3 py-1.5 text-sm text-text-primary outline-none focus:border-blue-500/40"
                        >
                          {LLM_PROVIDERS.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Model */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-text-secondary">
                          Model
                        </label>
                        <select
                          value={agent.model}
                          onChange={(e) =>
                            updateAgent(agent.id, { model: e.target.value })
                          }
                          className="w-full rounded-lg border border-border-light bg-bg-secondary px-3 py-1.5 text-sm text-text-primary outline-none focus:border-blue-500/40"
                        >
                          {(MODELS[agent.llmProvider] || [agent.model]).map(
                            (m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            )
                          )}
                        </select>
                      </div>

                      {/* Port */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-text-secondary">
                          Port
                        </label>
                        <NumberInput
                          value={agent.port}
                          onChange={(v) => updateAgent(agent.id, { port: v })}
                          min={1024}
                          max={65535}
                        />
                      </div>

                      {/* Temperature */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-text-secondary">
                          Temperature
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min={0}
                            max={2}
                            step={0.1}
                            value={agent.temperature}
                            onChange={(e) =>
                              updateAgent(agent.id, {
                                temperature: Number(e.target.value),
                              })
                            }
                            className="flex-1 accent-blue-500"
                          />
                          <span className="w-8 text-right font-mono text-xs text-text-secondary tabular-nums">
                            {agent.temperature.toFixed(1)}
                          </span>
                        </div>
                      </div>

                      {/* Max Tokens */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-text-secondary">
                          Max Tokens
                        </label>
                        <NumberInput
                          value={agent.maxTokens}
                          onChange={(v) =>
                            updateAgent(agent.id, { maxTokens: v })
                          }
                          min={256}
                          max={128000}
                          step={256}
                        />
                      </div>

                      {/* Timeout */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-text-secondary">
                          Timeout (seconds)
                        </label>
                        <NumberInput
                          value={agent.timeout}
                          onChange={(v) =>
                            updateAgent(agent.id, { timeout: v })
                          }
                          min={5}
                          max={600}
                        />
                      </div>

                      {/* Retries */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-text-secondary">
                          Retries
                        </label>
                        <NumberInput
                          value={agent.retries}
                          onChange={(v) =>
                            updateAgent(agent.id, { retries: v })
                          }
                          min={0}
                          max={10}
                        />
                      </div>

                      {/* Rate Limit */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-text-secondary">
                          Rate Limit (req/min)
                        </label>
                        <NumberInput
                          value={agent.rateLimit}
                          onChange={(v) =>
                            updateAgent(agent.id, { rateLimit: v })
                          }
                          min={1}
                          max={1000}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Notifications
// ---------------------------------------------------------------------------

function NotificationsTab({
  channels,
  rules,
  onChannelsChange,
  onRulesChange,
}: {
  channels: NotificationChannel[];
  rules: NotificationRule[];
  onChannelsChange: (c: NotificationChannel[]) => void;
  onRulesChange: (r: NotificationRule[]) => void;
}) {
  return (
    <div className="space-y-6">
      <SectionCard
        title="Notification Channels"
        description="Configure where alerts and notifications are delivered"
        icon={Bell}
      >
        <div className="space-y-3">
          {channels.map((ch) => {
            const Icon = ch.icon;
            return (
              <div
                key={ch.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-bg-secondary p-3"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bg-hover">
                  <Icon className={`h-4 w-4 ${ch.color}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-text-primary">{ch.name}</p>
                    <span className="rounded bg-bg-hover px-1.5 py-0.5 text-[10px] font-mono text-text-tertiary">
                      {ch.type}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-text-tertiary">
                    {ch.target}
                  </p>
                </div>
                <ToggleSwitch
                  enabled={ch.enabled}
                  onChange={(v) =>
                    onChannelsChange(
                      channels.map((c) =>
                        c.id === ch.id ? { ...c, enabled: v } : c
                      )
                    )
                  }
                />
              </div>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard
        title="Alert Rules"
        description="Configure which events trigger notifications and their delivery channels"
        icon={BellRing}
      >
        <div className="space-y-3">
          {rules.map((rule) => {
            const severityColors: Record<string, string> = {
              all: "text-text-secondary bg-gray-500/10 border-gray-500/20",
              warn: "text-amber-400 bg-amber-500/10 border-amber-500/20",
              error: "text-red-400 bg-red-500/10 border-red-500/20",
              critical:
                "text-rose-300 bg-rose-500/10 border-rose-500/20",
            };

            return (
              <div
                key={rule.id}
                className="rounded-lg border border-border bg-bg-secondary p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-text-primary">
                        {rule.event}
                      </p>
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${severityColors[rule.severity]}`}
                      >
                        {rule.severity === "all"
                          ? "ANY"
                          : rule.severity.toUpperCase()}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-text-tertiary">
                      {rule.description}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {rule.channels.map((chId) => {
                        const ch = channels.find((c) => c.id === chId);
                        if (!ch) return null;
                        const ChIcon = ch.icon;
                        return (
                          <span
                            key={chId}
                            className={`inline-flex items-center gap-1 rounded-md bg-bg-hover px-2 py-0.5 text-[11px] ${ch.enabled ? "text-text-secondary" : "text-text-tertiary line-through"}`}
                          >
                            <ChIcon className="h-3 w-3" />
                            {ch.name}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <ToggleSwitch
                    enabled={rule.enabled}
                    onChange={(v) =>
                      onRulesChange(
                        rules.map((r) =>
                          r.id === rule.id ? { ...r, enabled: v } : r
                        )
                      )
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Appearance
// ---------------------------------------------------------------------------

function AppearanceTab() {
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [accentColor, setAccentColor] = useState("blue");
  const [compactMode, setCompactMode] = useState(false);
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showClock, setShowClock] = useState(true);
  const [fontSize, setFontSize] = useState<"sm" | "base" | "lg">("sm");

  const themes: { id: ThemeMode; label: string; icon: LucideIcon }[] = [
    { id: "dark", label: "Dark", icon: Moon },
    { id: "light", label: "Light", icon: Sun },
    { id: "system", label: "System", icon: Monitor },
  ];

  const accentColors = [
    { id: "blue", label: "Blue", class: "bg-blue-500" },
    { id: "violet", label: "Violet", class: "bg-violet-500" },
    { id: "emerald", label: "Emerald", class: "bg-emerald-500" },
    { id: "rose", label: "Rose", class: "bg-rose-500" },
    { id: "amber", label: "Amber", class: "bg-amber-500" },
    { id: "cyan", label: "Cyan", class: "bg-cyan-500" },
  ];

  const fontSizes: { id: "sm" | "base" | "lg"; label: string }[] = [
    { id: "sm", label: "Small" },
    { id: "base", label: "Default" },
    { id: "lg", label: "Large" },
  ];

  return (
    <div className="space-y-6">
      <SectionCard
        title="Theme"
        description="Choose the color scheme for the dashboard"
        icon={Palette}
      >
        <div className="space-y-0">
          <FieldRow label="Color Mode" description="Select light, dark, or system preference">
            <div className="flex rounded-lg border border-border-light bg-bg-secondary">
              {themes.map((t) => {
                const TIcon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors first:rounded-l-lg last:rounded-r-lg ${
                      theme === t.id
                        ? "bg-blue-500/15 text-blue-400"
                        : "text-text-tertiary hover:text-text-secondary"
                    }`}
                  >
                    <TIcon className="h-3.5 w-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </FieldRow>

          <FieldRow
            label="Accent Color"
            description="Primary accent color used throughout the UI"
          >
            <div className="flex items-center gap-2">
              {accentColors.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setAccentColor(c.id)}
                  className={`flex h-7 w-7 items-center justify-center rounded-full ${c.class} transition-all ${
                    accentColor === c.id
                      ? "ring-2 ring-white/40 ring-offset-2 ring-offset-zinc-900 scale-110"
                      : "opacity-60 hover:opacity-100"
                  }`}
                  title={c.label}
                >
                  {accentColor === c.id && (
                    <Check className="h-3.5 w-3.5 text-text-primary" />
                  )}
                </button>
              ))}
            </div>
          </FieldRow>

          <FieldRow
            label="Font Size"
            description="Base font size for UI elements"
          >
            <div className="flex rounded-lg border border-border-light bg-bg-secondary">
              {fontSizes.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFontSize(f.id)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors first:rounded-l-lg last:rounded-r-lg ${
                    fontSize === f.id
                      ? "bg-blue-500/15 text-blue-400"
                      : "text-text-tertiary hover:text-text-secondary"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </FieldRow>
        </div>
      </SectionCard>

      <SectionCard
        title="Layout & Behavior"
        description="Customize the dashboard layout and interaction patterns"
        icon={Sliders}
      >
        <div className="space-y-0">
          <FieldRow
            label="Compact Mode"
            description="Reduce spacing and padding for denser information display"
          >
            <ToggleSwitch
              enabled={compactMode}
              onChange={setCompactMode}
            />
          </FieldRow>
          <FieldRow
            label="Animations"
            description="Enable transitions and animated elements"
          >
            <ToggleSwitch
              enabled={animationsEnabled}
              onChange={setAnimationsEnabled}
            />
          </FieldRow>
          <FieldRow
            label="Sidebar Collapsed by Default"
            description="Start with the sidebar in collapsed state"
          >
            <ToggleSwitch
              enabled={sidebarCollapsed}
              onChange={setSidebarCollapsed}
            />
          </FieldRow>
          <FieldRow
            label="Show Clock in Header"
            description="Display a live clock in page headers"
          >
            <ToggleSwitch enabled={showClock} onChange={setShowClock} />
          </FieldRow>
        </div>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Integrations
// ---------------------------------------------------------------------------

function IntegrationsTab({
  integrations,
  onChange,
}: {
  integrations: IntegrationConfig[];
  onChange: (i: IntegrationConfig[]) => void;
}) {
  const [testing, setTesting] = useState<string | null>(null);

  const testConnection = async (id: string) => {
    setTesting(id);
    // Simulate testing
    await new Promise((r) => setTimeout(r, 1500));
    const updated = integrations.map((i) =>
      i.id === id
        ? { ...i, status: i.connected ? ("healthy" as const) : ("unconfigured" as const), lastCheck: new Date() }
        : i
    );
    onChange(updated);
    setTesting(null);
    const integration = integrations.find((i) => i.id === id);
    if (integration?.connected) {
      toast.success(`${integration.name} connection verified`);
    } else {
      toast.error(`${integration?.name || "Service"} is not configured`);
    }
  };

  return (
    <div className="space-y-6">
      <SectionCard
        title="Infrastructure Services"
        description="Connected infrastructure services and external integrations"
        icon={Plug}
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {integrations.map((integration) => {
            const Icon = integration.icon;
            const statusColors: Record<string, string> = {
              healthy:
                "border-emerald-500/20 text-emerald-400",
              degraded:
                "border-amber-500/20 text-amber-400",
              unreachable:
                "border-red-500/20 text-red-400",
              unconfigured:
                "border-gray-600/20 text-text-tertiary",
            };
            const isTesting = testing === integration.id;

            return (
              <div
                key={integration.id}
                className="rounded-lg border border-border bg-bg-secondary p-4 transition-colors hover:bg-bg-secondary"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bg-hover">
                    <Icon className={`h-5 w-5 ${integration.color}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-text-primary">
                        {integration.name}
                      </p>
                      <span
                        className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusColors[integration.status]}`}
                      >
                        <StatusDot status={integration.status} />
                        {integration.status}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-text-tertiary">
                      {integration.description}
                    </p>
                    {integration.url && (
                      <p className="mt-1 font-mono text-[11px] text-text-tertiary">
                        {integration.url}
                      </p>
                    )}
                    {integration.lastCheck && (
                      <p className="mt-0.5 text-[10px] text-text-tertiary">
                        Last checked: {timeAgo(integration.lastCheck)}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => testConnection(integration.id)}
                    disabled={isTesting}
                    className="shrink-0 rounded-lg border border-border-light bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary disabled:opacity-50"
                  >
                    {isTesting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      "Test"
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("general");
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings>(
    DEFAULT_PLATFORM_SETTINGS
  );
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [agentConfigs, setAgentConfigs] = useState<AgentConfig[]>([]);
  const [notifChannels, setNotifChannels] = useState<NotificationChannel[]>([]);
  const [notifRules, setNotifRules] = useState<NotificationRule[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationConfig[]>([]);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Load initial data
  useEffect(() => {
    setApiKeys(generateApiKeys());
    setAgentConfigs(generateAgentConfigs());
    setNotifChannels(generateNotificationChannels());
    setNotifRules(generateNotificationRules());
    setIntegrations(generateIntegrations());
  }, []);

  // Track changes
  useEffect(() => {
    setHasChanges(true);
  }, [
    platformSettings,
    apiKeys,
    agentConfigs,
    notifChannels,
    notifRules,
    integrations,
  ]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    // Simulate save
    await new Promise((r) => setTimeout(r, 800));
    setSaving(false);
    setHasChanges(false);
    toast.success("Settings saved successfully", {
      description: "All changes have been persisted to the configuration store.",
    });
  }, []);

  const handleReset = useCallback(() => {
    setPlatformSettings(DEFAULT_PLATFORM_SETTINGS);
    setApiKeys(generateApiKeys());
    setAgentConfigs(generateAgentConfigs());
    setNotifChannels(generateNotificationChannels());
    setNotifRules(generateNotificationRules());
    setIntegrations(generateIntegrations());
    setHasChanges(false);
    toast.info("Settings reset to defaults");
  }, []);

  const tabs: { id: ActiveTab; label: string; icon: LucideIcon }[] = [
    { id: "general", label: "General", icon: Settings },
    { id: "api-keys", label: "API Keys", icon: Key },
    { id: "agents", label: "Agents", icon: Bot },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "integrations", label: "Integrations", icon: Plug },
    { id: "appearance", label: "Appearance", icon: Palette },
  ];

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary">
      {/* Header */}
      <header className="border-b border-border bg-bg-primary">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-text-primary">
              Settings
            </h1>
            <p className="text-xs text-text-tertiary">
              Platform configuration, API keys, and preferences
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 rounded-lg border border-border-light bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-text-primary shadow-lg shadow-blue-600/20 transition-colors hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Save Changes
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-border bg-bg-primary">
        <div className="mx-auto flex max-w-7xl gap-0 overflow-x-auto px-4 sm:px-6 lg:px-8">
          {tabs.map((tab) => {
            const TabIcon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex shrink-0 items-center gap-2 border-b-2 px-5 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? "border-blue-500 text-text-primary"
                    : "border-transparent text-text-tertiary hover:border-border-light hover:text-text-secondary"
                }`}
              >
                <TabIcon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {activeTab === "general" && (
          <GeneralTab
            settings={platformSettings}
            onChange={setPlatformSettings}
          />
        )}
        {activeTab === "api-keys" && (
          <ApiKeysTab keys={apiKeys} onChange={setApiKeys} />
        )}
        {activeTab === "agents" && (
          <AgentsTab agents={agentConfigs} onChange={setAgentConfigs} />
        )}
        {activeTab === "notifications" && (
          <NotificationsTab
            channels={notifChannels}
            rules={notifRules}
            onChannelsChange={setNotifChannels}
            onRulesChange={setNotifRules}
          />
        )}
        {activeTab === "integrations" && (
          <IntegrationsTab
            integrations={integrations}
            onChange={setIntegrations}
          />
        )}
        {activeTab === "appearance" && <AppearanceTab />}
      </main>

      {/* Unsaved changes banner */}
      {hasChanges && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-amber-500/20 bg-amber-500/[0.05] backdrop-blur-sm">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2.5 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2 text-xs text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5" />
              You have unsaved changes
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleReset}
                className="rounded-lg border border-border-light bg-bg-secondary px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-hover"
              >
                Discard
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-text-primary transition-colors hover:bg-blue-500 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
