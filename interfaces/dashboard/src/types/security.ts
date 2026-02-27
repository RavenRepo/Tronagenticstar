import { LucideIcon } from "lucide-react";

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type FindingStatus = "open" | "in_progress" | "resolved" | "accepted" | "false_positive";
export type ComplianceStatus = "compliant" | "partial" | "non_compliant" | "not_assessed";

export interface SecurityFinding {
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

export interface ComplianceControl {
  id: string;
  name: string;
  description: string;
  category: string;
  status: ComplianceStatus;
  evidence: string[];
  lastAssessed: string;
  notes: string | null;
}

export interface AgentTrustScore {
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

export interface SecurityOverview {
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

export type ActiveTab = "overview" | "findings" | "compliance" | "agents";
