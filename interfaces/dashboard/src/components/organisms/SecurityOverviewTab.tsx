import { SecurityOverview } from "@/types/security";
import { StatCard } from "@/components/atoms/StatCard";
import { ShieldAlert, CheckCircle2, AlertTriangle, Clock } from "lucide-react";

interface SecurityOverviewTabProps {
  overview: SecurityOverview;
}

export function SecurityOverviewTab({ overview }: SecurityOverviewTabProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Open Findings"
          value={overview.openFindings}
          icon={ShieldAlert}
          color="text-red-500"
          bg="bg-red-500/10"
          subtext={`${overview.criticalOpen} Critical, ${overview.highOpen} High`}
        />
        <StatCard
          label="Compliance Score"
          value={`${overview.complianceScore}%`}
          icon={CheckCircle2}
          color="text-emerald-500"
          bg="bg-emerald-500/10"
          subtext="Based on 12 controls"
        />
        <StatCard
          label="Resolved (30d)"
          value={overview.resolvedLast30Days}
          icon={AlertTriangle}
          color="text-blue-500"
          bg="bg-blue-500/10"
        />
        <StatCard
          label="Avg Resolution Time"
          value={`${overview.avgResolutionTimeHours}h`}
          icon={Clock}
          color="text-purple-500"
          bg="bg-purple-500/10"
        />
      </div>

      <div className="card p-6">
        <h3 className="mb-4 text-lg font-medium">Recent Activity</h3>
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border bg-bg-primary/50">
          <p className="text-sm text-text-tertiary">Chart visualization pending integration</p>
        </div>
      </div>
    </div>
  );
}
