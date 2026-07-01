/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, anchorId, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { s, chevronFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

export function FileCard({
  file,
  commenting,
  findingLines,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  /** New-side line numbers the latest review flagged — drives the "N findings"
   *  badge, the per-line highlight, and the badge's scroll-to-line. */
  findingLines?: number[];
}) {
  const t = useTranslations("shell");
  const findingCount = findingLines?.length ?? 0;
  const findingSet = React.useMemo(() => new Set(findingLines ?? []), [findingLines]);
  const [open, setOpen] = React.useState(
    findingCount > 0 || (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
  // Set by the findings badge → after the card opens, scroll its row into view.
  const [scrollTo, setScrollTo] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!open || scrollTo == null) return;
    const id = anchorId(file.path, scrollTo);
    const raf = requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ block: "center", behavior: "smooth" });
      setScrollTo(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [open, scrollTo, file.path]);

  const onFindingsClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // don't toggle the card via the header click
    setOpen(true);
    if (findingLines && findingLines.length > 0) setScrollTo(findingLines[0]!);
  };

  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, lines]);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  return (
    <div style={s.fileCard}>
      <div onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {findingCount > 0 && (
          <button
            type="button"
            onClick={onFindingsClick}
            title={t("smartDiff.findings", { count: findingCount })}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              fontWeight: 500,
              padding: "1px 8px",
              borderRadius: 999,
              cursor: "pointer",
              color: "var(--warn)",
              background: "var(--warn-bg)",
              border: "1px solid var(--warn)",
            }}
          >
            <Icon.AlertTriangle size={11} />
            {t("smartDiff.findings", { count: findingCount })}
          </button>
        )}
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => {
              const flagged = ln.newNo != null && findingSet.has(ln.newNo);
              return (
                <CodeLine
                  key={i}
                  ln={ln}
                  path={file.path}
                  threads={threadsForLine(ln, matched)}
                  commenting={commenting}
                  highlight={flagged}
                  anchorId={flagged ? anchorId(file.path, ln.newNo!) : undefined}
                />
              );
            })
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
        </div>
      )}
    </div>
  );
}
