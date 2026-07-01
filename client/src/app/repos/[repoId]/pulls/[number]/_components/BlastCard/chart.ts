import type { BlastResponse } from "@/lib/hooks/blast";

type Downstream = BlastResponse["downstream"][number];

/** Mermaid node labels are quoted; strip the few chars that break parsing. */
function label(text: string): string {
  return text.replace(/["\n\r]/g, " ").trim();
}

/**
 * buildBlastChart — render the blast radius as a Mermaid `flowchart LR`:
 *   changed symbol ──▶ caller (file:line)      (solid: "who calls this")
 *   changed symbol ┈▶ impacted endpoint        (dotted: symbol-level attribution)
 *
 * Endpoints are attributed at the symbol level (not per-caller) by the API, so
 * they hang off the symbol node. Returns "" when nothing has downstream callers
 * (the caller renders the empty-state text instead).
 */
export function buildBlastChart(downstream: Downstream[]): string {
  const withCallers = downstream.filter((d) => d.callers.length > 0);
  if (withCallers.length === 0) return "";

  const lines: string[] = [
    "flowchart LR",
    "classDef sym fill:#1e3a5f,stroke:#3b82f6,color:#e6f0ff;",
    "classDef caller fill:#27272a,stroke:#52525b,color:#e4e4e7;",
    "classDef ep fill:#0f2e1a,stroke:#22c55e,color:#d1fae5;",
  ];

  withCallers.forEach((d, si) => {
    const sId = `s${si}`;
    lines.push(`${sId}["${label(d.symbol)}"]:::sym`);
    d.callers.forEach((c, ci) => {
      lines.push(`${sId} --> ${sId}c${ci}["${label(`${c.file}:${c.line}`)}"]:::caller`);
    });
    d.endpoints_affected.forEach((ep, ei) => {
      lines.push(`${sId} -.-> ${sId}e${ei}["${label(ep)}"]:::ep`);
    });
  });

  return lines.join("\n");
}
