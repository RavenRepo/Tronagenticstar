import React, { useState } from "react";
import { SecurityFinding, Severity } from "@/types/security";
import { SeverityBadge } from "@/components/atoms/SeverityBadge";
import { StatusBadge } from "@/components/atoms/StatusBadges";
import { timeAgo } from "@/lib/utils/date";
import { Search, Filter } from "lucide-react";

interface SecurityFindingsTabProps {
  findings: SecurityFinding[];
}

export function SecurityFindingsTab({ findings }: SecurityFindingsTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<Severity | "all">("all");

  const filteredFindings = findings.filter((finding) => {
    const matchesSearch =
      finding.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      finding.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSeverity = severityFilter === "all" || finding.severity === severityFilter;
    return matchesSearch && matchesSeverity;
  });

  return (
    <div className="space-y-4">
      {/* Findings Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            placeholder="Search findings (e.g. SEC-001)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-md border border-border bg-bg-primary px-3 py-1.5 focus-within:ring-2 focus-within:ring-border-focus">
            <Filter className="h-4 w-4 text-text-tertiary" />
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as any)}
              className="bg-bg-primary text-sm text-text-primary outline-none cursor-pointer"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="info">Info</option>
            </select>
          </div>
        </div>
      </div>

      {/* Findings Table */}
      <div className="table-container">
        <table className="w-full">
          <thead>
            <tr>
              <th>ID</th>
              <th>Severity</th>
              <th>Title</th>
              <th>Status</th>
              <th>Category</th>
              <th>Age</th>
            </tr>
          </thead>
          <tbody>
            {filteredFindings.map((finding) => (
              <tr key={finding.id}>
                <td className="font-mono text-xs">{finding.id}</td>
                <td>
                  <SeverityBadge severity={finding.severity} />
                </td>
                <td className="max-w-md truncate font-medium text-text-primary">
                  {finding.title}
                </td>
                <td>
                  <StatusBadge status={finding.status} />
                </td>
                <td>{finding.category}</td>
                <td>{timeAgo(finding.discoveredAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredFindings.length === 0 && (
          <div className="p-8 text-center text-text-tertiary">
            No findings match your filters.
          </div>
        )}
      </div>
    </div>
  );
}
