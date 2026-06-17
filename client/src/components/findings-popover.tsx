/* FindingsPopover — read-only list of findings shown inside a HoverCard, reused
   by the PR list (a PR's latest-review findings) and the detail timeline (one
   run's findings). A header count + one compact row per finding (severity badge,
   title, category, file:line, confidence). No accept/dismiss actions — those
   live in the full FindingCard on the Findings tab. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  SeverityBadge,
  CategoryTag,
  ConfidenceNum,
  type Severity,
  type Category,
} from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";

function lineLabel(f: Pick<FindingRecord, "start_line" | "end_line">): string {
  return f.end_line > f.start_line ? `${f.start_line}–${f.end_line}` : `${f.start_line}`;
}

export function FindingsPopover({
  findings,
  inThisRun = false,
}: {
  findings: FindingRecord[];
  /** Use the "{count} findings in this run" header (detail timeline). */
  inThisRun?: boolean;
}) {
  const t = useTranslations("prReview");
  const count = findings.length;

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div
        style={{
          padding: "6px 8px",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
        }}
      >
        {inThisRun
          ? t("findingsPopover.inThisRun", { count })
          : t("findingsPopover.title", { count })}
      </div>
      {count === 0 ? (
        <div style={{ padding: "8px", fontSize: 13, color: "var(--text-secondary)" }}>
          {t("findingsPopover.empty")}
        </div>
      ) : (
        <div
          style={{
            maxHeight: 320,
            overflowY: "auto",
            overflowX: "hidden",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {findings.map((f) => (
            <div
              key={f.id}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                padding: "7px 8px",
                borderRadius: 6,
              }}
            >
              <span style={{ flexShrink: 0, marginTop: 1 }}>
                <SeverityBadge severity={f.severity as Severity} compact />
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--text-primary)",
                    lineHeight: 1.35,
                  }}
                >
                  {f.title}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 3,
                    flexWrap: "wrap",
                  }}
                >
                  <CategoryTag category={f.category as Category} />
                  <span
                    className="mono"
                    title={`${f.file}:${lineLabel(f)}`}
                    style={{
                      fontSize: 11.5,
                      color: "var(--text-muted)",
                      minWidth: 0,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {f.file}:{lineLabel(f)}
                  </span>
                  <ConfidenceNum value={f.confidence} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default FindingsPopover;
