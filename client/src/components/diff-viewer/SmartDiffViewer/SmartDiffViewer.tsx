/* SmartDiffViewer — risk-ordered diff. Renders the server's reviewer-ordered
   groups (core → wiring → boilerplate) instead of the raw file order. Boilerplate
   is collapsed by default; each file shows an "N findings" badge (from the latest
   review) that scrolls to the flagged line. Reuses FileCard for the actual diff.
   No model call — the grouping + findings come pre-composed from the API. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile } from "@/lib/types";
import type { SmartDiff, SmartDiffGroup, SmartDiffRole } from "@devdigest/shared";
import { type DiffCommentApi } from "../comments";
import { s, chevronFor } from "../styles";
import { FileCard } from "../FileCard";

/** Boilerplate is generated noise → collapse it; review the rest expanded. */
const COLLAPSED_BY_DEFAULT: Record<SmartDiffRole, boolean> = {
  core: false,
  wiring: false,
  boilerplate: true,
};

function GroupSection({
  group,
  fileByPath,
  commenting,
}: {
  group: SmartDiffGroup;
  fileByPath: Map<string, PrFile>;
  commenting?: DiffCommentApi;
}) {
  const t = useTranslations("shell.smartDiff");
  const [open, setOpen] = React.useState(!COLLAPSED_BY_DEFAULT[group.role]);

  return (
    <section>
      <div onClick={() => setOpen((o) => !o)} style={groupStyles.header}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <span style={groupStyles.dot(group.role)} />
        <span style={groupStyles.title}>{t(`roles.${group.role}`)}</span>
        <span style={groupStyles.hint}>{t(`roleHints.${group.role}`)}</span>
        <span style={groupStyles.count}>{t("filesCount", { count: group.files.length })}</span>
      </div>
      {open && (
        <div style={s.list}>
          {group.files.map((sf) => {
            // Server-side path may not be in the PR detail payload (renamed /
            // unfetched patch) — synthesize a minimal PrFile so the row still
            // renders its header + findings badge.
            const file: PrFile =
              fileByPath.get(sf.path) ??
              ({ path: sf.path, additions: sf.additions, deletions: sf.deletions, patch: null } as PrFile);
            return (
              <FileCard
                key={sf.path}
                file={file}
                commenting={commenting}
                findingLines={sf.finding_lines}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

export function SmartDiffViewer({
  groups,
  files,
  splitSuggestion,
  commenting,
}: {
  groups: SmartDiffGroup[];
  files: PrFile[];
  splitSuggestion: SmartDiff["split_suggestion"];
  commenting?: DiffCommentApi;
}) {
  const t = useTranslations("shell.smartDiff");
  const fileByPath = React.useMemo(() => {
    const m = new Map<string, PrFile>();
    for (const f of files) m.set(f.path, f);
    return m;
  }, [files]);

  if (groups.length === 0) {
    return <div style={s.empty}>{t("empty")}</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {splitSuggestion.too_big && (
        <div style={groupStyles.banner}>
          <Icon.AlertTriangle size={14} />
          <span>
            {t("splitBanner", {
              lines: splitSuggestion.total_lines,
              parts: splitSuggestion.proposed_splits.length,
            })}
          </span>
        </div>
      )}
      {groups.map((group) => (
        <GroupSection
          key={group.role}
          group={group}
          fileByPath={fileByPath}
          commenting={commenting}
        />
      ))}
    </div>
  );
}

const ROLE_COLORS: Record<SmartDiffRole, string> = {
  core: "var(--accent-text)",
  wiring: "var(--text-secondary, var(--text-muted))",
  boilerplate: "var(--text-muted)",
};

const groupStyles = {
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 2px 10px",
    cursor: "pointer",
    borderBottom: "1px solid var(--border)",
    marginBottom: 10,
  } as React.CSSProperties,
  dot: (role: SmartDiffRole): React.CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: 2,
    background: ROLE_COLORS[role],
    flexShrink: 0,
  }),
  title: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)" } as React.CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)", flex: 1, minWidth: 0 } as React.CSSProperties,
  count: { fontSize: 12, color: "var(--text-muted)", flexShrink: 0 } as React.CSSProperties,
  banner: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    fontSize: 12.5,
    borderRadius: 7,
    color: "var(--warn)",
    background: "var(--warn-bg)",
    border: "1px solid var(--warn)",
  } as React.CSSProperties,
};
