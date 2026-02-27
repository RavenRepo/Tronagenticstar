import {
    ShieldOff,
    ShieldAlert,
    AlertTriangle,
    Info,
    LucideIcon
  } from "lucide-react";
  import { Severity } from "@/types/security";
  
  export const SEVERITY_CONFIG: Record<
    Severity,
    { label: string; color: string; bg: string; border: string; icon: LucideIcon; weight: number }
  > = {
    critical: {
      label: "Critical",
      color: "text-red-500",
      bg: "bg-red-500/10",
      border: "border-red-500/30",
      icon: ShieldOff,
      weight: 4,
    },
    high: {
      label: "High",
      color: "text-orange-500",
      bg: "bg-orange-500/10",
      border: "border-orange-500/30",
      icon: ShieldAlert,
      weight: 3,
    },
    medium: {
      label: "Medium",
      color: "text-yellow-500",
      bg: "bg-yellow-500/10",
      border: "border-yellow-500/30",
      icon: AlertTriangle,
      weight: 2,
    },
    low: {
      label: "Low",
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      border: "border-blue-500/30",
      icon: Info,
      weight: 1,
    },
    info: {
      label: "Info",
      color: "text-gray-500",
      bg: "bg-gray-500/10",
      border: "border-gray-500/30",
      icon: Info,
      weight: 0,
    },
  };
  
  export function SeverityBadge({ severity }: { severity: Severity }) {
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
