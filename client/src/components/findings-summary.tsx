/* FindingsSummary — compact per-severity badge row (e.g. ⊘2 ⚠2 💡2), used as
   the hover trigger on the PR list's Findings column and the detail timeline.
   Renders one compact `SeverityBadge` per NON-ZERO severity in
   CRITICAL→WARNING→SUGGESTION order; returns null when every count is zero.

   When `onSelect` is provided (PR-list column), each badge becomes a click
   target that filters the open popover to that severity; `activeSeverity` dims
   the non-selected badges. `SeverityBadge` is vendored (do-not-touch) so the
   click lives on a wrapping <button>, not the badge itself. The timeline omits
   `onSelect` and renders the badges exactly as before (hover-only, no chrome). */
"use client";

import React from "react";
import { SeverityBadge, type Severity } from "@devdigest/ui";

export type SeverityCounts = {
  CRITICAL: number;
  WARNING: number;
  SUGGESTION: number;
};

const ORDER: (keyof SeverityCounts)[] = ["CRITICAL", "WARNING", "SUGGESTION"];

export function FindingsSummary({
  counts,
  onSelect,
  activeSeverity,
}: {
  counts: SeverityCounts;
  /** When set, badges become clickable severity filters. */
  onSelect?: (sev: keyof SeverityCounts) => void;
  /** Currently selected severity (dims the others). */
  activeSeverity?: keyof SeverityCounts | null;
}) {
  const shown = ORDER.filter((sev) => (counts[sev] ?? 0) > 0);
  if (shown.length === 0) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      {shown.map((sev) => {
        const badge = (
          <SeverityBadge severity={sev as Severity} count={counts[sev]} compact />
        );
        if (!onSelect) return <React.Fragment key={sev}>{badge}</React.Fragment>;
        const dimmed = activeSeverity != null && activeSeverity !== sev;
        return (
          <button
            key={sev}
            type="button"
            aria-pressed={activeSeverity === sev}
            onClick={() => onSelect(sev)}
            style={{
              all: "unset",
              display: "inline-flex",
              cursor: "pointer",
              opacity: dimmed ? 0.4 : 1,
            }}
          >
            {badge}
          </button>
        );
      })}
    </span>
  );
}

export default FindingsSummary;
