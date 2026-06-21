"use client";

import React from "react";
import type { FindingRecord } from "@devdigest/shared";
import { HoverCard } from "@/components/HoverCard";
import { FindingsSummary, type SeverityCounts } from "@/components/FindingsSummary";
import { FindingsPopover } from "@/components/FindingsPopover";
import { countSeverities } from "../../helpers";

/**
 * One run's hoverable severity badges + findings popover. Clicking a badge
 * filters the popover to that severity (toggle off on re-click); the filter
 * resets when the popover closes. Each run owns its own `activeSeverity` state,
 * so this must be its own component (can't useState inside the timeline map).
 */
export function RunFindings({
  findings,
  onGoToFinding,
}: {
  findings: FindingRecord[];
  /** Click a finding row → scroll/highlight its card in the Review runs below. */
  onGoToFinding?: (findingId: string) => void;
}) {
  const [activeSeverity, setActiveSeverity] = React.useState<keyof SeverityCounts | null>(null);
  const counts = countSeverities(findings);
  const shown = activeSeverity ? findings.filter((f) => f.severity === activeSeverity) : findings;
  return (
    <div onClick={(e) => e.stopPropagation()} style={{ cursor: "default" }}>
      <HoverCard
        onClose={() => setActiveSeverity(null)}
        trigger={
          <FindingsSummary
            counts={counts}
            activeSeverity={activeSeverity}
            onSelect={(sev) => setActiveSeverity((cur) => (cur === sev ? null : sev))}
          />
        }
      >
        <FindingsPopover
          findings={shown}
          inThisRun
          onFindingClick={onGoToFinding ? (f) => onGoToFinding(f.id) : undefined}
        />
      </HoverCard>
    </div>
  );
}

export default RunFindings;
