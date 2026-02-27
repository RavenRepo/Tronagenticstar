"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock,
  Code2,
  CpuIcon,
  ExternalLink,
  Eye,
  FileSearch,
  FileText,
  Filter,
  Globe,
  Hash,
  Info,
  Layers,
  Link2,
  Loader2,
  Lock,
  LucideIcon,
  Network,
  RefreshCw,
  Search,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  Tag,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
  Unlock,
  X,
  XCircle,
  Zap,
  BrainCircuit,
  GaugeCircle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Severity = "critical" | "high" | "medium" | "low" | "info";
type FindingStatus = "open" | "in_progress" | "resolved" | "accepted" | "false_positive";
type ComplianceStatus = "compliant" | "partial" | "non_compliant" | "not_assessed";

interface SecurityFinding {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  status: FindingStatus;
  category: string;
  location: string;
  discoveredAt: string;
  resolvedAt: string | null;
  agentId: string | null;
  recommendation: string;
  cweId: string | null;
}

interface ComplianceControl {
  id: string;
  name: string;
  description: string;
  category: string;
  status: ComplianceStatus;
  evidence: string[];
  lastAssessed: string;
  notes: string | null;
}

interface AgentTrustScore {
  agentId: string;
  agentName: string;
  icon: LucideIcon;
  color: string;
  trustScore: number;
  securityGrade: string;
  authMethod: string;
  hasEncryption: boolean;
  hasRateLimit: boolean;
  hasInputValidation: boolean;
  hasAuditLog: boolean;
  lastAudit: string | null;
  vulnerabilities: { critical: number; high: number; medium: number; low: number };
}

interface SecurityOverview {
  totalFindings: number;
  openFindings: number;
  criticalOpen: number;
  highOpen: number;
  mediumOpen: number;
  lowOpen: number;
  resolvedLast30Days: number;
  avgResolutionTimeHours: number;
  complianceScore: number;
  lastScanDate: string;
}

type ActiveTab = "overview" | "findings" | "compliance" | "agents";

// ---------------------------------------------------------------------------
// Severity & Status Configs
// ---------------------------------------------------------------------------

const SEVERITY_CONFIG: Record<
  Severity,
  { label: string; color: string; bg: string; border: string; icon: LucideIcon; weight: number }
> = {
  critical: {
    label: "Critical",
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    icon: ShieldOff,
    weight: 4,
  },
  high: {
    label: "High",
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    icon: ShieldAlert,
    weight: 3,
  },
  medium: {
    label: "Medium",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    icon: AlertTriangle,
    weight: 2,
  },
  low: {
    label: "Low",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    icon: Info,
    weight: 1,
  },
  info: {
    label: "Info",
    color: "text-gray-400",
    bg: "bg-gray-500/10",
    border: "border-gray-500/30",
    icon: Info,
    weight: 0,
  },
};

const STATUS_CONFIG: Record<
  FindingStatus,
  { label: string; color: string; bg: string; border: string }
> = {
  open: {
    label: "Open",
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
  },
  in_progress: {
    label: "In Progress",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
  },
  resolved: {
    label: "Resolved",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
  },
  accepted: {
    label: "Accepted",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
  },
  false_positive: {
    label: "False Positive",
    color: "text-gray-400",
    bg: "bg-gray-500/10",
    border: "border-gray-500/30",
  },
};

const COMPLIANCE_STATUS_CONFIG: Record<
  ComplianceStatus,
  { label: string; color: string; bg: string; border: string; icon: LucideIcon }
> = {
  compliant: {
    label: "Compliant",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    icon: CheckCircle2,
  },
  partial: {
    label: "Partial",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    icon: AlertTriangle,
  },
  non_compliant: {
    label: "Non-Compliant",
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    icon: XCircle,
  },
  not_assessed: {
    label: "Not Assessed",
    color: "text-gray-400",
    bg: "bg-gray-500/10",
    border: "border-gray-500/30",
    icon: Clock,
  },
};

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

function generateFindings(): SecurityFinding[] {
  return [
    {
      id: "SEC-001",
      title: "Hardcoded API credentials in environment defaults",
      description:
        "Several services contain hardcoded default credentials in Docker Compose files and environment variable defaults. These should be replaced with proper secrets management.",
      severity: "critical",
      status: "in_progress",
      category: "Secrets Management",
      location: "docker-compose.dev.yml, docker-compose.prod.yml",
      discoveredAt: "2025-06-15T10:00:00Z",
      resolvedAt: null,
      agentId: "securishield",
      recommendation:
        "Implement HashiCorp Vault or AWS Secrets Manager for credential storage. Remove all hardcoded defaults from compose files.",
      cweId: "CWE-798",
    },
    {
      id: "SEC-002",
      title: "Missing mTLS between agent services",
      description:
        "Inter-service communication between agents does not use mutual TLS. An attacker with network access could intercept or modify agent-to-agent traffic.",
      severity: "high",
      status: "open",
      category: "Transport Security",
      location: "services/*, packages/orchestrator",
      discoveredAt: "2025-06-15T10:15:00Z",
      resolvedAt: null,
      agentId: "securishield",
      recommendation:
        "Enable mTLS via service mesh (Istio/Linkerd) or configure TLS certificates for each agent endpoint.",
      cweId: "CWE-319",
    },
    {
      id: "SEC-003",
      title: "Default Grafana admin credentials in production config",
      description:
        "The production Docker Compose file uses default credentials for Grafana (admin/dev-only-change-in-prod) which could allow unauthorized dashboard access.",
      severity: "high",
      status: "resolved",
      category: "Authentication",
      location: "docker-compose.prod.yml",
      discoveredAt: "2025-06-14T08:00:00Z",
      resolvedAt: "2025-06-20T14:30:00Z",
      agentId: "securishield",
      recommendation: "Generate unique Grafana credentials and store in secrets manager.",
      cweId: "CWE-1393",
    },
    {
      id: "SEC-004",
      title: "Unauthenticated Prometheus metrics endpoint",
      description:
        "The /metrics endpoint on several agents exposes system metrics without requiring authentication, potentially leaking operational details.",
      severity: "medium",
      status: "open",
      category: "Access Control",
      location: "services/api-gateway, services/orchestrator-py",
      discoveredAt: "2025-06-16T09:00:00Z",
      resolvedAt: null,
      agentId: "securishield",
      recommendation: "Add authentication middleware to metrics endpoints or restrict access via network policies.",
      cweId: "CWE-284",
    },
    {
      id: "SEC-005",
      title: "SQL injection in sample test code",
      description:
        "The sample insecure code used in integration tests contains actual SQL injection patterns. While used for testing SecuriShield, it should be clearly isolated.",
      severity: "medium",
      status: "resolved",
      category: "Code Quality",
      location: "tests/integration/test_orchestrator_agents.py",
      discoveredAt: "2025-06-17T11:00:00Z",
      resolvedAt: "2025-06-18T09:00:00Z",
      agentId: "evaluator",
      recommendation: "Move test fixtures to a clearly marked test data directory with README warnings.",
      cweId: "CWE-89",
    },
    {
      id: "SEC-006",
      title: "Overly permissive CORS configuration",
      description:
        "API Gateway CORS is configured to accept all origins in development mode. Ensure this is restricted in production deployments.",
      severity: "medium",
      status: "in_progress",
      category: "Transport Security",
      location: "services/api-gateway/src/index.ts",
      discoveredAt: "2025-06-18T14:00:00Z",
      resolvedAt: null,
      agentId: "securishield",
      recommendation:
        "Set explicit allowed origins list based on deployment environment. Use environment variables for configuration.",
      cweId: "CWE-942",
    },
    {
      id: "SEC-007",
      title: "Missing rate limiting on agent execute endpoints",
      description:
        "Individual agent /execute_task endpoints lack rate limiting, allowing potential resource exhaustion attacks.",
      severity: "medium",
      status: "open",
      category: "Availability",
      location: "services/codecraft, services/securishield, services/designforge",
      discoveredAt: "2025-06-19T10:00:00Z",
      resolvedAt: null,
      agentId: null,
      recommendation:
        "Implement per-client rate limiting using Redis-backed token bucket or sliding window algorithms.",
      cweId: "CWE-770",
    },
    {
      id: "SEC-008",
      title: "Neo4j graph database uses weak default password",
      description:
        "The Neo4j knowledge graph database uses a default password (dev-only-change-in-prod) which should be rotated for any shared or production environments.",
      severity: "low",
      status: "accepted",
      category: "Secrets Management",
      location: "docker-compose.dev.yml",
      discoveredAt: "2025-06-15T10:30:00Z",
      resolvedAt: null,
      agentId: "securishield",
      recommendation:
        "Acceptable for local dev. Document clearly that production deployments must use strong, unique passwords.",
      cweId: "CWE-521",
    },
    {
      id: "SEC-009",
      title: "Missing Content-Security-Policy headers on dashboard",
      description:
        "The Constella dashboard does not set CSP headers, potentially allowing XSS attacks if user input is reflected in the UI.",
      severity: "low",
      status: "open",
      category: "Web Security",
      location: "interfaces/dashboard",
      discoveredAt: "2025-06-20T08:00:00Z",
      resolvedAt: null,
      agentId: null,
      recommendation:
        "Add strict Content-Security-Policy headers via Next.js middleware or next.config.ts headers configuration.",
      cweId: "CWE-1021",
    },
    {
      id: "SEC-010",
      title: "Deprecated FastAPI on_event pattern in retriever service",
      description:
        "The retriever service uses deprecated @app.on_event('startup') which may be removed in future FastAPI versions, potentially breaking startup security initialization.",
      severity: "info",
      status: "open",
      category: "Code Quality",
      location: "services/retriever/main.py",
      discoveredAt: "2025-07-17T10:00:00Z",
      resolvedAt: null,
      agentId: "evaluator",
      recommendation: "Migrate to FastAPI lifespan event handlers as recommended in the docs.",
      cweId: null,
    },
  ];
}

function generateComplianceControls(): ComplianceControl[] {
  return [
    {
      id: "CC-1.1",
      name: "Access Control Policies",
      description: "Access to information and systems is limited to authorized users.",
      category: "Security",
      status: "partial",
      evidence: ["API Gateway JWT auth implemented", "Agent bearer tokens in use"],
      lastAssessed: "2025-07-15T10:00:00Z",
      notes: "mTLS between services still pending. Per-agent RBAC not yet implemented.",
    },
    {
      id: "CC-1.2",
      name: "Logical and Physical Access Controls",
      description: "Access to physical and logical assets is restricted based on authorization.",
      category: "Security",
      status: "partial",
      evidence: ["Docker network isolation configured", "Service-level port restrictions"],
      lastAssessed: "2025-07-15T10:00:00Z",
      notes: "Network policies need hardening for production Kubernetes deployment.",
    },
    {
      id: "CC-2.1",
      name: "Change Management",
      description: "Changes to infrastructure and software are authorized, tested, and approved.",
      category: "Security",
      status: "compliant",
      evidence: [
        "Git-based version control",
        "CI/CD pipeline with test gates",
        "ADR documentation process",
        "Architecture Decision Records maintained",
      ],
      lastAssessed: "2025-07-10T08:00:00Z",
      notes: null,
    },
    {
      id: "CC-3.1",
      name: "Risk Assessment",
      description: "The entity identifies, assesses, and manages risks.",
      category: "Security",
      status: "compliant",
      evidence: [
        "Production audit completed (constella_audit_report.json)",
        "7 GAPs identified and tracked",
        "Security hardening script created",
      ],
      lastAssessed: "2025-07-15T10:00:00Z",
      notes: null,
    },
    {
      id: "CC-4.1",
      name: "Monitoring of Controls",
      description: "The entity monitors controls to ensure they continue to operate effectively.",
      category: "Security",
      status: "partial",
      evidence: ["Prometheus metrics collection", "Grafana dashboards configured", "Agent health checks"],
      lastAssessed: "2025-07-12T10:00:00Z",
      notes: "Alerting rules not yet defined. SIEM integration pending.",
    },
    {
      id: "CC-5.1",
      name: "Logical Access Security",
      description: "Logical access security software, infrastructure, and architectures are in place.",
      category: "Security",
      status: "partial",
      evidence: ["JWT-based authentication", "API key support", "Redis session storage"],
      lastAssessed: "2025-07-14T10:00:00Z",
      notes: "Need to implement OAuth 2.0 flow and OIDC integration for SSO.",
    },
    {
      id: "CC-6.1",
      name: "System Operations",
      description:
        "The entity manages system operations to detect and mitigate processing deviations.",
      category: "Availability",
      status: "partial",
      evidence: [
        "Docker Compose orchestration",
        "Health check endpoints on all agents",
        "Restart policies configured",
      ],
      lastAssessed: "2025-07-10T08:00:00Z",
      notes: "Kubernetes deployment not yet complete (GAP-07).",
    },
    {
      id: "CC-7.1",
      name: "System and Information Integrity",
      description: "The entity monitors system components for anomalies and vulnerabilities.",
      category: "Integrity",
      status: "compliant",
      evidence: [
        "SecuriShield automated scanning",
        "Evaluator quality assessment",
        "ErrorGold error collection",
        "Dependency scanning in CI",
      ],
      lastAssessed: "2025-07-15T10:00:00Z",
      notes: null,
    },
    {
      id: "CC-8.1",
      name: "Data Classification and Handling",
      description: "Data is classified and handled according to its sensitivity.",
      category: "Confidentiality",
      status: "non_compliant",
      evidence: [],
      lastAssessed: "2025-07-01T10:00:00Z",
      notes: "Data classification policy not yet defined. Need to implement data labeling across the platform.",
    },
    {
      id: "CC-9.1",
      name: "Encryption",
      description: "Data in transit and at rest is encrypted using industry-standard protocols.",
      category: "Confidentiality",
      status: "partial",
      evidence: [
        "Redis password authentication enabled",
        "Neo4j authentication configured",
        "HTTPS on external endpoints",
      ],
      lastAssessed: "2025-07-12T10:00:00Z",
      notes: "Internal inter-service traffic not encrypted (mTLS pending). Data at rest encryption not configured.",
    },
    {
      id: "CC-10.1",
      name: "Incident Response",
      description: "Security incidents are identified, reported, and acted upon in a timely manner.",
      category: "Security",
      status: "not_assessed",
      evidence: [],
      lastAssessed: "2025-06-01T10:00:00Z",
      notes: "Incident response plan and runbooks need to be created.",
    },
    {
      id: "CC-11.1",
      name: "Audit Logging",
      description: "All security-relevant events are logged and retained.",
      category: "Security",
      status: "partial",
      evidence: ["Loki log aggregation configured", "Agent activity logging", "API Gateway request logging"],
      lastAssessed: "2025-07-10T08:00:00Z",
      notes: "Centralized audit trail with immutable storage not yet implemented.",
    },
  ];
}

function generateAgentTrustScores(): AgentTrustScore[] {
  return [
    {
      agentId: "codecraft",
      agentName: "CodeCraft",
      icon: Code2,
      color: "from-blue-500 to-cyan-400",
      trustScore: 78,
      securityGrade: "B+",
      authMethod: "Bearer Token",
      hasEncryption: false,
      hasRateLimit: false,
      hasInputValidation: true,
      hasAuditLog: true,
      lastAudit: "2025-07-15T10:00:00Z",
      vulnerabilities: { critical: 0, high: 0, medium: 1, low: 1 },
    },
    {
      agentId: "securishield",
      agentName: "SecuriShield",
      icon: Shield,
      color: "from-red-500 to-orange-400",
      trustScore: 92,
      securityGrade: "A",
      authMethod: "Bearer Token",
      hasEncryption: false,
      hasRateLimit: true,
      hasInputValidation: true,
      hasAuditLog: true,
      lastAudit: "2025-07-15T10:00:00Z",
      vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0 },
    },
    {
      agentId: "designforge",
      agentName: "DesignForge",
      icon: BrainCircuit,
      color: "from-purple-500 to-pink-400",
      trustScore: 65,
      securityGrade: "C+",
      authMethod: "None",
      hasEncryption: false,
      hasRateLimit: false,
      hasInputValidation: true,
      hasAuditLog: false,
      lastAudit: null,
      vulnerabilities: { critical: 0, high: 1, medium: 1, low: 0 },
    },
    {
      agentId: "perfpulse",
      agentName: "PerfPulse",
      icon: Zap,
      color: "from-yellow-500 to-amber-400",
      trustScore: 60,
      securityGrade: "C",
      authMethod: "None",
      hasEncryption: false,
      hasRateLimit: false,
      hasInputValidation: false,
      hasAuditLog: false,
      lastAudit: null,
      vulnerabilities: { critical: 0, high: 0, medium: 2, low: 1 },
    },
    {
      agentId: "evaluator",
      agentName: "Evaluator",
      icon: GaugeCircle,
      color: "from-green-500 to-emerald-400",
      trustScore: 70,
      securityGrade: "B",
      authMethod: "Bearer Token",
      hasEncryption: false,
      hasRateLimit: false,
      hasInputValidation: true,
      hasAuditLog: true,
      lastAudit: "2025-07-10T08:00:00Z",
      vulnerabilities: { critical: 0, high: 0, medium: 1, low: 0 },
    },
    {
      agentId: "expressops",
      agentName: "ExpressOps",
      icon: Server,
      color: "from-lime-500 to-green-400",
      trustScore: 75,
      securityGrade: "B",
      authMethod: "Bearer Token",
      hasEncryption: false,
      hasRateLimit: true,
      hasInputValidation: true,
      hasAuditLog: false,
      lastAudit: "2025-07-08T10:00:00Z",
      vulnerabilities: { critical: 0, high: 0, medium: 0, low: 2 },
    },
    {
      agentId: "mobilefirstops",
      agentName: "MobileFirstOps",
      icon: Globe,
      color: "from-sky-500 to-indigo-400",
      trustScore: 72,
      securityGrade: "B",
      authMethod: "Bearer Token",
      hasEncryption: false,
      hasRateLimit: false,
      hasInputValidation: true,
      hasAuditLog: true,
      lastAudit: "2025-07-05T10:00:00Z",
      vulnerabilities: { critical: 0, high: 0, medium: 1, low: 1 },
    },
    {
      agentId: "database-agent",
      agentName: "Database Agent",
      icon: CpuIcon,
      color: "from-teal-500 to-cyan-400",
      trustScore: 82,
      securityGrade: "A-",
      authMethod: "Bearer Token",
      hasEncryption: false,
      hasRateLimit: true,
      hasInputValidation: true,
      hasAuditLog: true,
      lastAudit: "2025-07-12T10:00:00Z",
      vulnerabilities: { critical: 0, high: 0, medium: 0, low: 1 },
    },
    {
      agentId: "soc2-compliance",
      agentName: "SOC2 Compliance",
      icon: FileSearch,
      color: "from-slate-500 to-gray-400",
      trustScore: 55,
      securityGrade: "C",
      authMethod: "None",
      hasEncryption: false,
      hasRateLimit: false,
      hasInputValidation: false,
      hasAuditLog: false,
      lastAudit: null,
      vulnerabilities: { critical: 0, high: 0, medium: 1, low: 2 },
    },
  ];
}

function computeOverview(findings: SecurityFinding[]): SecurityOverview {
  const openFindings = findings.filter((f) => f.status === "open" || f.status === "in_progress");
  const resolved = findings.filter((f) => f.status === "resolved");
  const resolvedRecent = resolved.filter(
    (f) => f.resolvedAt && Date.now() - new Date(f.resolvedAt).getTime() < 30 * 86_400_000
  );

  const resolutionTimes = resolved
    .filter((f) => f.resolvedAt)
    .map((f) => (new Date(f.resolvedAt!).getTime() - new Date(f.discoveredAt).getTime()) / 3_600_000);

  const avgResolution = resolutionTimes.length > 0 ? resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length : 0;

  return {
    totalFindings: findings.length,
    openFindings: openFindings.length,
    criticalOpen: openFindings.filter((f) => f.severity === "critical").length,
    highOpen: openFindings.filter((f) => f.severity === "high").length,
    mediumOpen: openFindings.filter((f) => f.severity === "medium").length,
    lowOpen: openFindings.filter((f) => f.severity === "low").length,
    resolvedLast30Days: resolvedRecent.length,
    avgResolutionTimeHours: Math.round(avgResolution),
    complianceScore: 0,
    lastScanDate: findings.length > 0 ? findings[findings.length - 1].discoveredAt : new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Utility Helpers
// ---------------------------------------------------------------------------

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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Reusable Components
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  bg,
  subtext,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
  bg: string;
  subtext?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${bg}`}>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div>
        <p className="text-xl font-bold text-white">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
        {subtext && <p className="text-[10px] text-gray-600">{subtext}</p>}
      </div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const cfg = SEVERITY_CONFIG[severity];
  const SevIcon = cfg.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${cfg.bg} ${cfg.color} ${cfg.border}`}
    >
      <SevIcon className="h-2.5 w-2.5" />
      {cfg.label}
    </span>
  );
}

function StatusBadge({ status }: { status: FindingStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${cfg.bg} ${cfg.color} ${cfg.border}`}
    >
      {cfg.label}
    </span>
  );
}

function ComplianceBadge({ status }: { status: ComplianceStatus }) {
  const cfg = COMPLIANCE_STATUS_CONFIG[status];
  const CmpIcon = cfg.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${cfg.bg} ${cfg.color} ${cfg.border}`}
    >
      <CmpIcon className="h-2.5 w-2.5" />
      {cfg.label}
    </span>
  );
}

function ScoreRing({ score, size = 64, stroke = 5 }: { score: number; size?: number; stroke?: number }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const color =
    score >= 80
      ? "text-emerald-400"
      : score >= 60
      ? "text-yellow-400"
      : "text-red-400";
  const trackColor = "text-white/[0.06]";

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className={trackColor}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          className={color}
        />
      </svg>
      <span className={`absolute text-sm font-bold ${color}`}>{score}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview Tab
// ---------------------------------------------------------------------------

function OverviewTab({
  overview,
  findings,
  complianceControls,
  agentScores,
}: {
  overview: SecurityOverview;
  findings: SecurityFinding[];
  complianceControls: ComplianceControl[];
  agentScores: AgentTrustScore[];
}) {
  const complianceScore = Math.round(
    (complianceControls.filter((c) => c.status === "compliant").length / complianceControls.length) * 100
  );

  const avgTrust = Math.round(agentScores.reduce((s, a) => s + a.trustScore, 0) / agentScores.length);

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Open Findings"
          value={overview.openFindings}
          icon={ShieldAlert}
          color={overview.criticalOpen > 0 ? "text-red-400" : "text-yellow-400"}
          bg={overview.criticalOpen > 0 ? "bg-red-500/10" : "bg-yellow-500/10"}
          subtext={`${overview.criticalOpen} critical, ${overview.highOpen} high`}
        />
        <StatCard
          label="Resolved (30d)"
          value={overview.resolvedLast30Days}
          icon={CheckCircle2}
          color="text-emerald-400"
          bg="bg-emerald-500/10"
          subtext={`Avg ${overview.avgResolutionTimeHours}h resolution`}
        />
        <StatCard
          label="Compliance"
          value={`${complianceScore}%`}
          icon={ShieldCheck}
          color={complianceScore >= 70 ? "text-emerald-400" : "text-yellow-400"}
          bg={complianceScore >= 70 ? "bg-emerald-500/10" : "bg-yellow-500/10"}
          subtext={`${complianceControls.filter((c) => c.status === "compliant").length}/${complianceControls.length} controls`}
        />
        <StatCard
          label="Avg Trust Score"
          value={avgTrust}
          icon={Target}
          color={avgTrust >= 70 ? "text-blue-400" : "text-yellow-400"}
          bg="bg-blue-500/10"
          subtext={`Across ${agentScores.length} agents`}
        />
      </div>

      {/* Severity Distribution + Compliance Score */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Severity Chart */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <h3 className="mb-4 text-sm font-semibold text-white">Finding Severity Distribution</h3>
          <div className="space-y-3">
            {(["critical", "high", "medium", "low", "info"] as Severity[]).map((sev) => {
              const cfg = SEVERITY_CONFIG[sev];
              const count = findings.filter((f) => f.severity === sev).length;
              const openCount = findings.filter(
                (f) => f.severity === sev && (f.status === "open" || f.status === "in_progress")
              ).length;
              const pct = findings.length > 0 ? (count / findings.length) * 100 : 0;

              return (
                <div key={sev}>
                  <div className="mb-1 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <SeverityBadge severity={sev} />
                      <span className="text-xs text-gray-500">
                        {count} total, {openCount} open
                      </span>
                    </div>
                    <span className="text-xs font-medium text-gray-400">{Math.round(pct)}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-white/[0.04]">
                    <div
                      className={`h-2 rounded-full ${cfg.bg.replace("/10", "/40")}`}
                      style={{ width: `${pct}%`, minWidth: count > 0 ? "4px" : "0" }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* SOC2 Compliance Donut */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <h3 className="mb-4 text-sm font-semibold text-white">SOC2 Compliance Overview</h3>
          <div className="flex items-center gap-8">
            <ScoreRing score={complianceScore} size={96} stroke={8} />
            <div className="space-y-2">
              {(["compliant", "partial", "non_compliant", "not_assessed"] as ComplianceStatus[]).map((status) => {
                const cfg = COMPLIANCE_STATUS_CONFIG[status];
                const count = complianceControls.filter((c) => c.status === status).length;
                return (
                  <div key={status} className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${cfg.bg.replace("/10", "/60")}`} />
                    <span className="text-xs text-gray-400">
                      {cfg.label}: <span className="font-semibold text-white">{count}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Critical/High Findings */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
        <h3 className="mb-4 text-sm font-semibold text-white">Priority Findings</h3>
        <div className="space-y-3">
          {findings
            .filter((f) => (f.severity === "critical" || f.severity === "high") && f.status !== "resolved" && f.status !== "false_positive")
            .slice(0, 5)
            .map((finding) => (
              <div
                key={finding.id}
                className="flex items-start gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-4"
              >
                <div
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    SEVERITY_CONFIG[finding.severity].bg
                  }`}
                >
                  {React.createElement(SEVERITY_CONFIG[finding.severity].icon, {
                    className: `h-4 w-4 ${SEVERITY_CONFIG[finding.severity].color}`,
                  })}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-gray-600">{finding.id}</span>
                    <SeverityBadge severity={finding.severity} />
                    <StatusBadge status={finding.status} />
                  </div>
                  <p className="mt-1 text-sm font-medium text-white">{finding.title}</p>
                  <p className="mt-0.5 text-xs text-gray-500">{finding.location}</p>
                </div>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-gray-600" />
              </div>
            ))}
          {findings.filter(
            (f) => (f.severity === "critical" || f.severity === "high") && f.status !== "resolved" && f.status !== "false_positive"
          ).length === 0 && (
            <div className="py-6 text-center">
              <ShieldCheck className="mx-auto h-8 w-8 text-emerald-500/50" />
              <p className="mt-2 text-sm text-gray-500">No critical or high severity open findings.</p>
            </div>
          )}
        </div>
      </div>

      {/* Agent Trust Summary */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
        <h3 className="mb-4 text-sm font-semibold text-white">Agent Security Posture</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {agentScores
            .sort((a, b) => b.trustScore - a.trustScore)
            .slice(0, 6)
            .map((agent) => {
              const AgentIcon = agent.icon;
              const totalVulns =
                agent.vulnerabilities.critical +
                agent.vulnerabilities.high +
                agent.vulnerabilities.medium +
                agent.vulnerabilities.low;
              return (
                <div
                  key={agent.agentId}
                  className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3"
                >
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${agent.color} shadow`}
                  >
                    <AgentIcon className="h-4 w-4 text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{agent.agentName}</p>
                    <div className="flex items-center gap-2 text-[10px] text-gray-500">
                      <span>Grade: <span className="font-semibold text-gray-300">{agent.securityGrade}</span></span>
                      {totalVulns > 0 && (
                        <span className="text-yellow-400">{totalVulns} vulns</span>
                      )}
                    </div>
                  </div>
                  <ScoreRing score={agent.trustScore} size={40} stroke={3} />
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Findings Tab
// ---------------------------------------------------------------------------

function FindingsTab({ findings }: { findings: SecurityFinding[] }) {
  const [filterSeverity, setFilterSeverity] = useState<Severity | "all">("all");
  const [filterStatus, setFilterStatus] = useState<FindingStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SecurityFinding | null>(null);

  const filtered = findings.filter((f) => {
    if (filterSeverity !== "all" && f.severity !== filterSeverity) return false;
    if (filterStatus !== "all" && f.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        f.title.toLowerCase().includes(q) ||
        f.id.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q) ||
        f.location.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {/* Severity filters */}
          {(["all", "critical", "high", "medium", "low", "info"] as (Severity | "all")[]).map((sev) => (
            <button
              key={sev}
              onClick={() => setFilterSeverity(sev)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                filterSeverity === sev
                  ? "bg-white/[0.08] text-white"
                  : "text-gray-500 hover:bg-white/[0.04] hover:text-gray-300"
              }`}
            >
              {sev === "all" ? "All" : SEVERITY_CONFIG[sev].label}
              <span className="ml-1 opacity-60">
                {sev === "all"
                  ? findings.length
                  : findings.filter((f) => f.severity === sev).length}
              </span>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as FindingStatus | "all")}
            className="appearance-none rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-gray-300 outline-none transition-colors focus:border-blue-500/50"
          >
            <option value="all" className="bg-zinc-900">All Statuses</option>
            <option value="open" className="bg-zinc-900">Open</option>
            <option value="in_progress" className="bg-zinc-900">In Progress</option>
            <option value="resolved" className="bg-zinc-900">Resolved</option>
            <option value="accepted" className="bg-zinc-900">Accepted</option>
            <option value="false_positive" className="bg-zinc-900">False Positive</option>
          </select>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] py-1.5 pl-8 pr-3 text-xs text-gray-200 placeholder-gray-600 outline-none transition-colors focus:border-blue-500/50 sm:w-48"
            />
          </div>
        </div>
      </div>

      {/* Findings List */}
      <div className="space-y-3">
        {filtered.map((finding) => (
          <button
            key={finding.id}
            onClick={() => setSelected(selected?.id === finding.id ? null : finding)}
            className={`w-full rounded-xl border p-4 text-left transition-all hover:bg-white/[0.04] ${
              selected?.id === finding.id
                ? "border-blue-500/30 bg-blue-500/5"
                : "border-white/[0.06] bg-white/[0.02]"
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                  SEVERITY_CONFIG[finding.severity].bg
                }`}
              >
                {React.createElement(SEVERITY_CONFIG[finding.severity].icon, {
                  className: `h-4 w-4 ${SEVERITY_CONFIG[finding.severity].color}`,
                })}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] text-gray-600">{finding.id}</span>
                  <SeverityBadge severity={finding.severity} />
                  <StatusBadge status={finding.status} />
                  <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] text-gray-400">
                    {finding.category}
                  </span>
                  {finding.cweId && (
                    <span className="font-mono text-[10px] text-gray-600">{finding.cweId}</span>
                  )}
                </div>
                <p className="mt-1.5 text-sm font-medium text-white">{finding.title}</p>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-[10px] text-gray-500">
                  <span className="flex items-center gap-1">
                    <FileText className="h-2.5 w-2.5" />
                    {finding.location}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-2.5 w-2.5" />
                    {timeAgo(finding.discoveredAt)}
                  </span>
                  {finding.agentId && (
                    <span className="flex items-center gap-1">
                      <Bot className="h-2.5 w-2.5" />
                      {finding.agentId}
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight
                className={`mt-1 h-4 w-4 shrink-0 transition-transform ${
                  selected?.id === finding.id ? "rotate-90 text-blue-400" : "text-gray-600"
                }`}
              />
            </div>

            {/* Expanded detail */}
            {selected?.id === finding.id && (
              <div className="mt-4 border-t border-white/[0.06] pt-4">
                <div className="space-y-3">
                  <div>
                    <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Description</h4>
                    <p className="mt-1 text-sm leading-relaxed text-gray-300">{finding.description}</p>
                  </div>
                  <div>
                    <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Recommendation</h4>
                    <p className="mt-1 text-sm leading-relaxed text-emerald-300/80">{finding.recommendation}</p>
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs text-gray-400">
                    <span>
                      Discovered: <span className="text-gray-200">{formatDate(finding.discoveredAt)}</span>
                    </span>
                    {finding.resolvedAt && (
                      <span>
                        Resolved: <span className="text-emerald-400">{formatDate(finding.resolvedAt)}</span>
                      </span>
                    )}
                    {finding.cweId && (
                      <a
                        href={`https://cwe.mitre.org/data/definitions/${finding.cweId.replace("CWE-", "")}.html`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-400 hover:text-blue-300"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {finding.cweId} <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="py-16 text-center">
          <ShieldCheck className="mx-auto h-12 w-12 text-gray-700" />
          <p className="mt-3 text-sm text-gray-500">No findings match your filters.</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compliance Tab
// ---------------------------------------------------------------------------

function ComplianceTab({ controls }: { controls: ComplianceControl[] }) {
  const [selectedControl, setSelectedControl] = useState<ComplianceControl | null>(null);

  const categories = Array.from(new Set(controls.map((c) => c.category)));
  const compliantCount = controls.filter((c) => c.status === "compliant").length;
  const complianceScore = Math.round((compliantCount / controls.length) * 100);

  return (
    <div className="space-y-5">
      {/* Score overview */}
      <div className="flex items-center gap-6 rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
        <ScoreRing score={complianceScore} size={80} stroke={6} />
        <div>
          <h3 className="text-lg font-bold text-white">SOC2 Type II Readiness</h3>
          <p className="text-sm text-gray-400">
            {compliantCount} of {controls.length} controls compliant
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["compliant", "partial", "non_compliant", "not_assessed"] as ComplianceStatus[]).map((status) => {
              const count = controls.filter((c) => c.status === status).length;
              if (count === 0) return null;
              return <ComplianceBadge key={status} status={status} />;
            })}
          </div>
        </div>
      </div>

      {/* Controls by Category */}
      {categories.map((cat) => (
        <div key={cat}>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">{cat}</h3>
          <div className="space-y-2">
            {controls
              .filter((c) => c.category === cat)
              .map((control) => (
                <button
                  key={control.id}
                  onClick={() =>
                    setSelectedControl(selectedControl?.id === control.id ? null : control)
                  }
                  className={`w-full rounded-xl border p-4 text-left transition-all hover:bg-white/[0.04] ${
                    selectedControl?.id === control.id
                      ? "border-blue-500/30 bg-blue-500/5"
                      : "border-white/[0.06] bg-white/[0.02]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-gray-600">{control.id}</span>
                        <ComplianceBadge status={control.status} />
                      </div>
                      <p className="mt-1 text-sm font-medium text-white">{control.name}</p>
                      <p className="mt-0.5 text-xs text-gray-400">{control.description}</p>
                    </div>
                    <ChevronRight
                      className={`h-4 w-4 shrink-0 transition-transform ${
                        selectedControl?.id === control.id ? "rotate-90 text-blue-400" : "text-gray-600"
                      }`}
                    />
                  </div>

                  {selectedControl?.id === control.id && (
                    <div className="mt-4 border-t border-white/[0.06] pt-4">
                      <div className="space-y-3">
                        {control.evidence.length > 0 && (
                          <div>
                            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                              Evidence
                            </h4>
                            <ul className="mt-1.5 space-y-1">
                              {control.evidence.map((ev, i) => (
                                <li key={i} className="flex items-start gap-2 text-xs text-gray-300">
                                  <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />
                                  {ev}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {control.notes && (
                          <div>
                            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Notes</h4>
                            <p className="mt-1 text-xs leading-relaxed text-yellow-300/80">{control.notes}</p>
                          </div>
                        )}
                        <p className="text-[10px] text-gray-600">
                          Last assessed: {formatDate(control.lastAssessed)}
                        </p>
                      </div>
                    </div>
                  )}
                </button>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent Trust Tab
// ---------------------------------------------------------------------------

function AgentTrustTab({ agents }: { agents: AgentTrustScore[] }) {
  const [selected, setSelected] = useState<AgentTrustScore | null>(null);

  const sorted = [...agents].sort((a, b) => b.trustScore - a.trustScore);

  return (
    <div className="space-y-5">
      {/* Summary bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Agents Assessed"
          value={agents.length}
          icon={Bot}
          color="text-blue-400"
          bg="bg-blue-500/10"
        />
        <StatCard
          label="Avg Trust Score"
          value={Math.round(agents.reduce((s, a) => s + a.trustScore, 0) / agents.length)}
          icon={Target}
          color="text-blue-400"
          bg="bg-blue-500/10"
        />
        <StatCard
          label="With Auth"
          value={agents.filter((a) => a.authMethod !== "None").length}
          icon={Lock}
          color="text-emerald-400"
          bg="bg-emerald-500/10"
          subtext={`${agents.filter((a) => a.authMethod === "None").length} without`}
        />
        <StatCard
          label="Total Vulns"
          value={agents.reduce(
            (s, a) =>
              s +
              a.vulnerabilities.critical +
              a.vulnerabilities.high +
              a.vulnerabilities.medium +
              a.vulnerabilities.low,
            0
          )}
          icon={AlertTriangle}
          color="text-yellow-400"
          bg="bg-yellow-500/10"
        />
      </div>

      {/* Agent Cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {sorted.map((agent) => {
          const AgentIcon = agent.icon;
          const isSelected = selected?.agentId === agent.agentId;
          const totalVulns =
            agent.vulnerabilities.critical +
            agent.vulnerabilities.high +
            agent.vulnerabilities.medium +
            agent.vulnerabilities.low;

          const securityChecks = [
            { label: "Authentication", ok: agent.authMethod !== "None", detail: agent.authMethod },
            { label: "Encryption (mTLS)", ok: agent.hasEncryption, detail: agent.hasEncryption ? "Enabled" : "Disabled" },
            { label: "Rate Limiting", ok: agent.hasRateLimit, detail: agent.hasRateLimit ? "Enabled" : "Disabled" },
            { label: "Input Validation", ok: agent.hasInputValidation, detail: agent.hasInputValidation ? "Enabled" : "Disabled" },
            { label: "Audit Logging", ok: agent.hasAuditLog, detail: agent.hasAuditLog ? "Enabled" : "Disabled" },
          ];

          return (
            <button
              key={agent.agentId}
              onClick={() => setSelected(isSelected ? null : agent)}
              className={`w-full rounded-xl border p-5 text-left transition-all hover:bg-white/[0.04] ${
                isSelected
                  ? "border-blue-500/30 bg-blue-500/5"
                  : "border-white/[0.06] bg-white/[0.02]"
              }`}
            >
              {/* Header */}
              <div className="flex items-center gap-4">
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${agent.color} shadow-lg`}
                >
                  <AgentIcon className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-white">{agent.agentName}</h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        agent.trustScore >= 80
                          ? "bg-emerald-500/10 text-emerald-400"
                          : agent.trustScore >= 60
                          ? "bg-yellow-500/10 text-yellow-400"
                          : "bg-red-500/10 text-red-400"
                      }`}
                    >
                      Grade: {agent.securityGrade}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-3 text-[10px] text-gray-500">
                    <span className="flex items-center gap-1">
                      {agent.authMethod !== "None" ? (
                        <Lock className="h-2.5 w-2.5 text-emerald-500" />
                      ) : (
                        <Unlock className="h-2.5 w-2.5 text-red-400" />
                      )}
                      {agent.authMethod}
                    </span>
                    {totalVulns > 0 && (
                      <span className="text-yellow-400">{totalVulns} vulnerabilities</span>
                    )}
                    {agent.lastAudit && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" />
                        Audited {timeAgo(agent.lastAudit)}
                      </span>
                    )}
                  </div>
                </div>
                <ScoreRing score={agent.trustScore} size={48} stroke={4} />
              </div>

              {/* Expanded detail */}
              {isSelected && (
                <div className="mt-4 border-t border-white/[0.06] pt-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {/* Security Checks */}
                    <div>
                      <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                        Security Controls
                      </h4>
                      <div className="space-y-1.5">
                        {securityChecks.map((check) => (
                          <div key={check.label} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {check.ok ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                              ) : (
                                <XCircle className="h-3.5 w-3.5 text-red-400" />
                              )}
                              <span className="text-xs text-gray-300">{check.label}</span>
                            </div>
                            <span className="text-[10px] text-gray-500">{check.detail}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Vulnerability Breakdown */}
                    <div>
                      <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                        Vulnerabilities
                      </h4>
                      <div className="space-y-1.5">
                        {(["critical", "high", "medium", "low"] as Severity[]).map((sev) => {
                          const count =
                            agent.vulnerabilities[sev as keyof typeof agent.vulnerabilities];
                          const cfg = SEVERITY_CONFIG[sev];
                          return (
                            <div key={sev} className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className={`h-2 w-2 rounded-full ${cfg.bg.replace("/10", "/60")}`} />
                                <span className="text-xs text-gray-300">{cfg.label}</span>
                              </div>
                              <span
                                className={`font-mono text-xs ${
                                  count > 0 ? cfg.color : "text-gray-600"
                                }`}
                              >
                                {count}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SecurityPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [findings, setFindings] = useState<SecurityFinding[]>([]);
  const [controls, setControls] = useState<ComplianceControl[]>([]);
  const [agentScores, setAgentScores] = useState<AgentTrustScore[]>([]);
  const [overview, setOverview] = useState<SecurityOverview | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(() => {
    setRefreshing(true);
    // In production this would call the SOC2 compliance agent and SecuriShield
    setTimeout(() => {
      const f = generateFindings();
      const c = generateComplianceControls();
      const a = generateAgentTrustScores();
      const o = computeOverview(f);
      o.complianceScore = Math.round(
        (c.filter((ctrl) => ctrl.status === "compliant").length / c.length) * 100
      );
      setFindings(f);
      setControls(c);
      setAgentScores(a);
      setOverview(o);
      setRefreshing(false);
    }, 400);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const tabs: { id: ActiveTab; label: string; icon: LucideIcon }[] = [
    { id: "overview", label: "Overview", icon: BarChart3 },
    { id: "findings", label: "Findings", icon: ShieldAlert },
    { id: "compliance", label: "SOC2 Compliance", icon: ShieldCheck },
    { id: "agents", label: "Agent Trust", icon: Target },
  ];

  return (
    <div className="min-h-screen bg-[#090b10] text-gray-100">
      {/* Header */}
      <header className="border-b border-white/[0.06] bg-[#0c0e14]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">Security</h1>
            <p className="text-xs text-gray-500">
              {overview
                ? `${overview.openFindings} open findings · ${overview.complianceScore}% SOC2 compliant`
                : "Loading…"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={refreshing}
              className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:bg-white/[0.06] disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-white/[0.06] bg-[#0c0e14]">
        <div className="mx-auto flex max-w-7xl gap-0 px-4 sm:px-6 lg:px-8">
          {tabs.map((tab) => {
            const TabIcon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? "border-blue-500 text-white"
                    : "border-transparent text-gray-500 hover:border-white/[0.08] hover:text-gray-300"
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
        {!overview ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-gray-600" />
          </div>
        ) : (
          <>
            {activeTab === "overview" && (
              <OverviewTab
                overview={overview}
                findings={findings}
                complianceControls={controls}
                agentScores={agentScores}
              />
            )}
            {activeTab === "findings" && <FindingsTab findings={findings} />}
            {activeTab === "compliance" && <ComplianceTab controls={controls} />}
            {activeTab === "agents" && <AgentTrustTab agents={agentScores} />}
          </>
        )}
      </main>
    </div>
  );
}
