import { FindingStatus, ComplianceStatus } from "@/types/security";
import { CheckCircle2, AlertTriangle, XCircle, Clock, LucideIcon } from "lucide-react";

export const STATUS_CONFIG: Record<
  FindingStatus,
  { label: string; color: string; bg: string; border: string }
> = {
  open: {
    label: "Open",
    color: "text-red-500",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
  },
  in_progress: {
    label: "In Progress",
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
  },
  resolved: {
    label: "Resolved",
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
  },
  accepted: {
    label: "Accepted",
    color: "text-yellow-500",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
  },
  false_positive: {
    label: "False Positive",
    color: "text-gray-500",
    bg: "bg-gray-500/10",
    border: "border-gray-500/30",
  },
};

export const COMPLIANCE_STATUS_CONFIG: Record<
  ComplianceStatus,
  { label: string; color: string; bg: string; border: string; icon: LucideIcon }
> = {
  compliant: {
    label: "Compliant",
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    icon: CheckCircle2,
  },
  partial: {
    label: "Partial",
    color: "text-yellow-500",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    icon: AlertTriangle,
  },
  non_compliant: {
    label: "Non-Compliant",
    color: "text-red-500",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    icon: XCircle,
  },
  not_assessed: {
    label: "Not Assessed",
    color: "text-gray-500",
    bg: "bg-gray-500/10",
    border: "border-gray-500/30",
    icon: Clock,
  },
};

export function StatusBadge({ status }: { status: FindingStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${cfg.bg} ${cfg.color} ${cfg.border}`}
    >
      {cfg.label}
    </span>
  );
}

export function ComplianceBadge({ status }: { status: ComplianceStatus }) {
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
