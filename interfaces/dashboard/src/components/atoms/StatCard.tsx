import { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
  bg: string;
  subtext?: string;
}

export function StatCard({ label, value, icon: Icon, color, bg, subtext }: StatCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-bg-secondary px-4 py-3">
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${bg}`}>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div>
        <p className="text-xl font-bold text-text-primary">{value}</p>
        <p className="text-xs text-text-secondary">{label}</p>
        {subtext && <p className="text-[10px] text-text-tertiary">{subtext}</p>}
      </div>
    </div>
  );
}
