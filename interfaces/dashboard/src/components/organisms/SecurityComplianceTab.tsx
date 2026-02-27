import React from "react";
import { ComplianceControl } from "@/types/security";
import { ComplianceBadge } from "@/components/atoms/StatusBadges";
import { formatDate } from "@/lib/utils/date";

interface SecurityComplianceTabProps {
  controls: ComplianceControl[];
}

export function SecurityComplianceTab({ controls }: SecurityComplianceTabProps) {
  return (
    <div className="space-y-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-text-primary">Compliance Framework</h2>
        <p className="text-sm text-text-secondary">
          Tracking adherence to internal and external security policies.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {controls.map((control) => (
          <div key={control.id} className="card p-5">
            <div className="mb-3 flex items-start justify-between">
              <div>
                <span className="text-xs font-semibold text-brand">{control.id}</span>
                <h3 className="mt-1 font-medium text-text-primary">{control.name}</h3>
              </div>
              <ComplianceBadge status={control.status} />
            </div>

            <p className="mb-4 text-sm text-text-secondary">{control.description}</p>

            {control.evidence.length > 0 && (
              <div className="mb-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  Evidence Context
                </p>
                <ul className="list-inside list-disc text-sm text-text-secondary">
                  {control.evidence.slice(0, 3).map((item, i) => (
                    <li key={i} className="truncate">
                      {item}
                    </li>
                  ))}
                  {control.evidence.length > 3 && (
                    <li className="text-xs italic text-text-tertiary">
                      +{control.evidence.length - 3} more items
                    </li>
                  )}
                </ul>
              </div>
            )}

            <div className="mt-auto border-t border-border pt-3">
              <div className="flex items-center justify-between text-xs text-text-tertiary">
                <span>Category: {control.category}</span>
                <span>Assessed: {formatDate(control.lastAssessed)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
