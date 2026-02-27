import React from "react";
import { AgentTrustScore } from "@/types/security";
import { formatDate } from "@/lib/utils/date";

interface SecurityAgentsTabProps {
  scores: AgentTrustScore[];
}

export function SecurityAgentsTab({ scores }: SecurityAgentsTabProps) {
  return (
    <div className="space-y-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-text-primary">Agent Trust Scores</h2>
        <p className="text-sm text-text-secondary">
          Security profiles and vulnerability history for individual AI agents.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {scores.map((agent) => {
          const Icon = agent.icon;
          return (
            <div key={agent.agentId} className="card-glow flex flex-col p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${agent.color}`}>
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-text-primary">{agent.agentName}</h3>
                    <p className="text-xs text-text-tertiary font-mono">ID: {agent.agentId}</p>
                  </div>
                </div>
                <div className="flex h-10 w-10 flex-col items-center justify-center rounded-full border border-border bg-bg-primary">
                  <span className="text-[10px] font-medium text-text-tertiary">Score</span>
                  <span
                    className={`text-sm font-bold ${
                      agent.trustScore >= 90
                        ? "text-emerald-500"
                        : agent.trustScore >= 70
                          ? "text-blue-500"
                          : agent.trustScore >= 50
                            ? "text-yellow-500"
                            : "text-red-500"
                    }`}
                  >
                    {agent.trustScore}
                  </span>
                </div>
              </div>

              <div className="my-5 grid grid-cols-2 gap-4">
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase text-text-tertiary">
                    Auth Method
                  </p>
                  <p className="text-sm font-medium text-text-primary">{agent.authMethod}</p>
                </div>
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase text-text-tertiary">
                    Grade
                  </p>
                  <p className="text-sm font-medium text-brand">{agent.securityGrade}</p>
                </div>
              </div>

              <div className="mb-5 space-y-2">
                <p className="text-[10px] font-semibold uppercase text-text-tertiary">
                  Capabilities
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge isActive={agent.hasEncryption} label="Encryption" />
                  <Badge isActive={agent.hasRateLimit} label="Rate Limit" />
                  <Badge isActive={agent.hasInputValidation} label="Validation" />
                  <Badge isActive={agent.hasAuditLog} label="Auditing" />
                </div>
              </div>

              <div className="mt-auto border-t border-border pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    {Object.entries(agent.vulnerabilities).map(([sev, count]) => {
                      if (count === 0) return null;
                      const color =
                        sev === "critical"
                          ? "text-red-500 bg-red-500/10"
                          : sev === "high"
                            ? "text-orange-500 bg-orange-500/10"
                            : sev === "medium"
                              ? "text-yellow-500 bg-yellow-500/10"
                              : "text-blue-500 bg-blue-500/10";
                      return (
                        <span
                          key={sev}
                          className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${color}`}
                          title={`${count} ${sev} vulnerabilities`}
                        >
                          {count}
                        </span>
                      );
                    })}
                    {Object.values(agent.vulnerabilities).every((v) => v === 0) && (
                      <span className="text-xs font-medium text-emerald-500">
                        Zero known vulnerabilities
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-text-tertiary">
                    Audit: {agent.lastAudit ? formatDate(agent.lastAudit) : "N/A"}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Badge({ isActive, label }: { isActive: boolean; label: string }) {
  return (
    <span
      className={`rounded border px-2 py-0.5 text-[10px] font-medium ${
        isActive
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
          : "border-border bg-bg-primary text-text-tertiary"
      }`}
    >
      {label}
    </span>
  );
}
