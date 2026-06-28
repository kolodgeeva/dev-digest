/* IntentCard — shows the PR's computed intent: an italic summary, an IN SCOPE
   list, and an OUT OF SCOPE list. Reads from GET /pulls/:id/intent and fires a
   one-shot auto-recompute when no intent is stored yet (404 → null). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Skeleton, Button, SectionLabel, Icon } from "@devdigest/ui";
import { useIntent, useRecomputeIntent } from "@/lib/hooks";
import { s } from "./styles";

interface IntentCardProps {
  prId: string | null | undefined;
}

export function IntentCard({ prId }: IntentCardProps) {
  const t = useTranslations("brief");
  const { data: intent, isLoading } = useIntent(prId);
  const recompute = useRecomputeIntent(prId);

  // Auto-fire once when the query resolves with null (no stored intent).
  // The ref guards against re-firing when the component re-renders.
  const autoFired = React.useRef(false);
  React.useEffect(() => {
    if (!isLoading && intent === null && !autoFired.current && !recompute.isPending) {
      autoFired.current = true;
      recompute.mutate();
    }
    // recompute.mutate is stable (useMutation); autoFired is a ref (not reactive)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, intent, recompute.isPending]);

  const isComputing = recompute.isPending;
  const showSkeleton = isLoading || isComputing;

  return (
    <section>
      <SectionLabel
        icon="Lightbulb"
        right={
          <Button
            kind="ghost"
            size="sm"
            icon="RefreshCw"
            loading={isComputing}
            disabled={!prId || isComputing}
            onClick={() => recompute.mutate()}
          >
            {isComputing ? t("intentCard.recomputing") : t("intentCard.recompute")}
          </Button>
        }
      >
        {t("block.intent")}
      </SectionLabel>

      <div style={s.card}>
        {showSkeleton ? (
          <div style={s.skeletonGroup}>
            <Skeleton height={18} width="80%" />
            <Skeleton height={14} width="65%" />
            <Skeleton height={14} width="72%" />
          </div>
        ) : intent ? (
          <>
            <p style={s.summary}>{intent.intent}</p>

            {(intent.in_scope.length > 0 || intent.out_of_scope.length > 0) && (
              <div style={s.scopeGrid}>
                {intent.in_scope.length > 0 && (
                  <div>
                    <div style={{ ...s.subheading, ...s.subheadingOk }}>
                      <Icon.CheckCircle size={13} />
                      {t("intentCard.inScope")}
                    </div>
                    <ul style={s.list}>
                      {intent.in_scope.map((item, i) => (
                        <li key={i} style={s.listItem}>
                          <Icon.CheckCircle size={14} style={s.checkIcon} />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {intent.out_of_scope.length > 0 && (
                  <div>
                    <div style={s.subheading}>
                      <Icon.XCircle size={13} />
                      {t("intentCard.outOfScope")}
                    </div>
                    <ul style={s.list}>
                      {intent.out_of_scope.map((item, i) => (
                        <li key={i} style={s.listItemMuted}>
                          <Icon.XCircle size={14} style={s.xIcon} />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <p style={s.placeholder}>{t("intentCard.placeholder")}</p>
        )}
      </div>
    </section>
  );
}
