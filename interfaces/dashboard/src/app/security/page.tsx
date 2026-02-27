"use client";

import React, { useState, useEffect } from "react";
import { ShieldCheck, Target, Shield, Users } from "lucide-react";
import { ActiveTab, SecurityFinding, ComplianceControl, AgentTrustScore, SecurityOverview } from "@/types/security";
import { SecurityOverviewTab } from "@/components/organisms/SecurityOverviewTab";
import { SecurityFindingsTab } from "@/components/organisms/SecurityFindingsTab";
import { SecurityComplianceTab } from "@/components/organisms/SecurityComplianceTab";
import { SecurityAgentsTab } from "@/components/organisms/SecurityAgentsTab";

// Note: In a real app, these would be fetched from an API
import { generateFindings, generateComplianceControls, generateAgentTrustScores, computeOverview } from "@/lib/data/security-mock";

export default function SecurityDashboard() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [findings, setFindings] = useState<SecurityFinding[]>([]);
  const [controls, setControls] = useState<ComplianceControl[]>([]);
  const [agentScores, setAgentScores] = useState<AgentTrustScore[]>([]);
  const [overview, setOverview] = useState<SecurityOverview | null>(null);

  useEffect(() => {
    // Simulate API fetch
    const f = generateFindings();
    setFindings(f);
    setControls(generateComplianceControls());
    setAgentScores(generateAgentTrustScores());
    setOverview(computeOverview(f));
  }, []);

  if (!overview) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-text-secondary animate-pulse">Loading security data...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
          Security Command Center
        </h1>
        <p className="mt-2 text-sm text-text-secondary">
          Monitor vulnerabilities, compliance posture, and agent trust scores across the platform.
        </p>
      </div>

      {/* Tabs Navigation */}
      <div className="flex space-x-1 rounded-xl bg-bg-secondary p-1">
        <TabButton id="overview" current={activeTab} onClick={setActiveTab} icon={Target} label="Overview" />
        <TabButton id="findings" current={activeTab} onClick={setActiveTab} icon={ShieldAlert} label="Findings" count={overview.openFindings} />
        <TabButton id="compliance" current={activeTab} onClick={setActiveTab} icon={ShieldCheck} label="Compliance" />
        <TabButton id="agents" current={activeTab} onClick={setActiveTab} icon={Users} label="Agent Trust" />
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === "overview" && <SecurityOverviewTab overview={overview} />}
        {activeTab === "findings" && <SecurityFindingsTab findings={findings} />}
        {activeTab === "compliance" && <SecurityComplianceTab controls={controls} />}
        {activeTab === "agents" && <SecurityAgentsTab scores={agentScores} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Local Helper Components
// ---------------------------------------------------------------------------

function TabButton({
  id,
  current,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  id: ActiveTab;
  current: ActiveTab;
  onClick: (id: ActiveTab) => void;
  icon: React.ElementType;
  label: string;
  count?: number;
}) {
  const isActive = current === id;
  return (
    <button
      onClick={() => onClick(id)}
      className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
        isActive
          ? "bg-bg-primary text-text-primary shadow-sm ring-1 ring-border"
          : "text-text-secondary hover:bg-bg-primary/50 hover:text-text-primary"
      }`}
    >
      <Icon className={`h-4 w-4 ${isActive ? "text-brand" : "text-text-tertiary"}`} />
      {label}
      {count !== undefined && count > 0 && (
        <span
          className={`ml-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
            isActive ? "bg-red-500 text-white" : "bg-bg-primary text-text-tertiary border border-border"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}
// Required import for TabButton inside the same file
import { ShieldAlert } from "lucide-react";
