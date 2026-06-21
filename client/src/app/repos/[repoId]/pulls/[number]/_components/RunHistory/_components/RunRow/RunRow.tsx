"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, CircularScore } from "@devdigest/ui";
import type { RunSummary, FindingRecord } from "@devdigest/shared";
import { formatCost } from "@/lib/format-cost";
import { RunFindings } from "../RunFindings";
import { countSeverities, outcomeOf } from "../../helpers";

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  width: "100%",
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  textAlign: "left",
};

const iconBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 4,
  borderRadius: 5,
  border: "1px solid var(--border)",
  background: "var(--bg-surface)",
  color: "var(--text-muted)",
  cursor: "pointer",
  flexShrink: 0,
};

// Native <button> so the delete action is keyboard-reachable; styled flat to
// read as an inline icon affordance rather than a chrome button.
const deleteBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 3,
  borderRadius: 5,
  border: "none",
  background: "none",
  color: "var(--text-muted)",
  cursor: "pointer",
  flexShrink: 0,
};

/**
 * One agent run in the PR timeline. Failed runs show their error inline; the
 * trace icon opens the run's log drawer, the agent name jumps to its inline
 * review accordion, and (for settled runs) the severity badges hover-reveal the
 * findings popover.
 */
export function RunRow({
  run: r,
  findings,
  onOpenTrace,
  onGoToReview,
  onDelete,
}: {
  run: RunSummary;
  /** This run's findings (keyed lookup done by the parent) → severity badges. */
  findings?: FindingRecord[];
  onOpenTrace: (runId: string) => void;
  onGoToReview?: (runId: string) => void;
  onDelete?: (runId: string) => void;
}) {
  const t = useTranslations("prReview");
  const o = outcomeOf(r);
  const settled = r.status === "done";
  const counts = findings ? countSeverities(findings) : null;

  return (
    <div style={rowStyle}>
      <Badge color={o.color} bg={o.bg} icon={o.icon}>
        {t(`runStatus.${o.key}`)}
      </Badge>
      {settled && r.score != null && <CircularScore score={r.score} size={30} stroke={3} />}
      <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          <button
            type="button"
            onClick={() => onGoToReview?.(r.run_id)}
            title={t("timeline.goToReview")}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              font: "inherit",
              fontWeight: 600,
              color: "var(--text-primary)",
              cursor: onGoToReview ? "pointer" : "default",
              textDecoration: onGoToReview ? "underline" : "none",
              textDecorationStyle: "dotted",
              textUnderlineOffset: 3,
            }}
          >
            {r.agent_name ?? "Agent"}
          </button>{" "}
          <span className="mono" style={{ fontSize: 12, fontWeight: 400, color: "var(--text-muted)" }}>
            {r.provider}/{r.model}
          </span>
        </div>
        {r.status === "failed" && r.error && (
          <div
            style={{ fontSize: 12, color: "var(--crit)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            title={r.error}
          >
            {r.error}
          </div>
        )}
        {settled &&
          // When we have this run's findings AND at least one severity to show,
          // render the hoverable severity badges; otherwise keep the plain text
          // summary (legacy rows / runs with no findings).
          (findings && counts && counts.CRITICAL + counts.WARNING + counts.SUGGESTION > 0 ? (
            <RunFindings findings={findings} />
          ) : (
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {t("runStatus.findings", { count: r.findings_count ?? 0 })}
              {(r.blockers ?? 0) > 0 ? t("runStatus.blockers", { count: r.blockers ?? 0 }) : ""}
            </div>
          ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>
        {r.ran_at && <span>{new Date(r.ran_at).toLocaleTimeString()}</span>}
        {settled && (r.tokens_in != null || r.tokens_out != null) && (
          <span className="mono">
            {((r.tokens_in ?? 0) + (r.tokens_out ?? 0)).toLocaleString()} tok
            {r.cost_usd != null ? ` · ${formatCost(r.cost_usd)}` : ""}
          </span>
        )}
      </div>
      <button
        type="button"
        title={t("timeline.openTrace")}
        aria-label={t("timeline.openTrace")}
        onClick={() => onOpenTrace(r.run_id)}
        style={iconBtnStyle}
      >
        <Icon.FileText size={13} />
      </button>
      {onDelete && r.status !== "running" && (
        <button
          type="button"
          aria-label={t("timeline.deleteRun")}
          title={t("timeline.deleteRun")}
          onClick={() => onDelete(r.run_id)}
          style={deleteBtnStyle}
        >
          <Icon.Trash size={13} />
        </button>
      )}
    </div>
  );
}

export default RunRow;
