import { SecurityFinding, ComplianceControl, AgentTrustScore, SecurityOverview } from "@/types/security";
import { Code2, Shield, BrainCircuit, Zap, GaugeCircle, Server, Globe, CpuIcon, FileSearch } from "lucide-react";

export function generateFindings(): SecurityFinding[] {
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
  ];
}

export function generateComplianceControls(): ComplianceControl[] {
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
  ];
}

export function generateAgentTrustScores(): AgentTrustScore[] {
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
  ];
}

export function computeOverview(findings: SecurityFinding[]): SecurityOverview {
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
    complianceScore: 75,
    lastScanDate: findings.length > 0 ? findings[findings.length - 1].discoveredAt : new Date().toISOString(),
  };
}
