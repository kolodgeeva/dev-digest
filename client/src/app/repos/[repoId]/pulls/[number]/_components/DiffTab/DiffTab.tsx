"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button } from "@devdigest/ui";
import { DiffViewer, SmartDiffViewer, type DiffCommentApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment } from "@/lib/hooks/reviews";
import { useSmartDiff } from "@/lib/hooks/smart-diff";
import { notify } from "@/lib/toast";
import type { PrFile } from "@devdigest/shared";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
}

export function DiffTab({ prId, filesCount, files, canComment }: DiffTabProps) {
  const t = useTranslations("shell.smartDiff");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  const { data: smartDiff } = useSmartDiff(prId);
  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);
  // Smart (reviewer-ordered) is the default; fall back to it being unavailable.
  const [smart, setSmart] = React.useState(true);
  const showSmart = smart && !!smartDiff;

  const commentCount = comments?.length ?? 0;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div role="group" aria-label={t("reviewerOrderedDiff")} style={toggleStyles.group}>
              <button
                type="button"
                aria-pressed={smart}
                onClick={() => setSmart(true)}
                style={toggleStyles.option(smart)}
              >
                {t("smartOrder")}
              </button>
              <button
                type="button"
                aria-pressed={!smart}
                onClick={() => setSmart(false)}
                style={toggleStyles.option(!smart)}
              >
                {t("originalOrder")}
              </button>
            </div>
            {commentCount > 0 && (
              <Button
                kind="ghost"
                size="sm"
                icon={showComments ? "EyeOff" : "Eye"}
                onClick={() => setShowComments((v) => !v)}
              >
                {showComments ? "Hide comments" : "Show comments"} ({commentCount})
              </Button>
            )}
          </div>
        }
      >
        {showSmart ? t("reviewerOrderedDiff") : `Files changed`} · {filesCount} files
      </SectionLabel>
      {showSmart ? (
        <SmartDiffViewer
          groups={smartDiff!.groups}
          files={files}
          splitSuggestion={smartDiff!.split_suggestion}
          commenting={commenting}
        />
      ) : (
        <DiffViewer files={files} commenting={commenting} />
      )}
    </section>
  );
}

const toggleStyles = {
  group: {
    display: "inline-flex",
    border: "1px solid var(--border)",
    borderRadius: 7,
    overflow: "hidden",
  } as React.CSSProperties,
  option: (active: boolean): React.CSSProperties => ({
    fontSize: 12,
    padding: "3px 10px",
    cursor: "pointer",
    border: "none",
    color: active ? "var(--text-primary)" : "var(--text-muted)",
    background: active ? "var(--bg-elevated)" : "transparent",
    fontWeight: active ? 600 : 400,
  }),
};
