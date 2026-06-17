/* FindingsSummary — compact per-severity badge row (e.g. ⊘2 ⚠2 💡2), used as
   the hover trigger on the PR list's Findings column and the detail timeline.
   Renders one compact `SeverityBadge` per NON-ZERO severity in
   CRITICAL→WARNING→SUGGESTION order; returns null when every count is zero. */
"use client";

import React from "react";
import { SeverityBadge, type Severity } from "@devdigest/ui";

export type SeverityCounts = {
  CRITICAL: number;
  WARNING: number;
  SUGGESTION: number;
};

const ORDER: (keyof SeverityCounts)[] = ["CRITICAL", "WARNING", "SUGGESTION"];

export function FindingsSummary({ counts }: { counts: SeverityCounts }) {
  const shown = ORDER.filter((sev) => (counts[sev] ?? 0) > 0);
  if (shown.length === 0) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      {shown.map((sev) => (
        <SeverityBadge key={sev} severity={sev as Severity} count={counts[sev]} compact />
      ))}
    </span>
  );
}

export default FindingsSummary;
