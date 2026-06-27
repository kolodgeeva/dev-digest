/* ConventionsView — the /conventions page. Scans the active repo for house-rule
   candidates, lets the user accept/reject/edit each one, and merges the accepted
   ones into a `source: extracted` Skill via the create-skill modal. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { useActiveRepo } from "@/lib/repo-context";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import {
  useConventions,
  useExtractConventions,
  useUpdateConvention,
  useRejectConvention,
} from "@/lib/hooks/conventions";
import { ConventionCard } from "../ConventionCard";
import { CreateSkillFromConventionsModal } from "../CreateSkillFromConventionsModal";
import { s } from "./styles";

export function ConventionsView() {
  const t = useTranslations("conventions");
  const { repoId, activeRepo } = useActiveRepo();
  useDocumentTitle(t("page.heading"));

  const { data: conventions, isLoading, isError, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const update = useUpdateConvention(repoId);
  const reject = useRejectConvention(repoId);

  const [modalOpen, setModalOpen] = React.useState(false);

  const list = conventions ?? [];
  const accepted = list.filter((c) => c.accepted);
  const repoName = activeRepo?.name ?? t("page.repoFallback");

  const runExtraction = () => extract.mutate();
  const acceptAll = () => {
    for (const c of list) if (!c.accepted) update.mutate({ id: c.id, patch: { accepted: true } });
  };
  const rejectAll = () => {
    for (const c of list) reject.mutate(c.id);
  };

  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];

  return (
    <AppShell crumb={crumb}>
      {modalOpen && repoId && (
        <CreateSkillFromConventionsModal
          repoId={repoId}
          acceptedCount={accepted.length}
          onClose={() => setModalOpen(false)}
        />
      )}
      <div style={s.shell}>
        <div style={s.header}>
          <div style={s.headTexts}>
            <h1 style={s.h1}>
              {t("page.headingPrefix")}
              <span style={s.repo}>{repoName}</span>
            </h1>
            <div style={s.subtitle}>{t("page.subtitle")}</div>
            {list.length > 0 && (
              <div style={s.count}>{t("page.candidateCount", { count: list.length })}</div>
            )}
          </div>
          <Button
            kind="secondary"
            size="sm"
            icon="RefreshCw"
            onClick={runExtraction}
            loading={extract.isPending}
            disabled={!repoId || extract.isPending}
          >
            {extract.isPending ? t("page.scanning") : list.length > 0 ? t("page.rescan") : t("page.runExtraction")}
          </Button>
        </div>

        {extract.isError && (
          <ErrorState
            title={t("page.extractionFailed")}
            body={(extract.error as Error)?.message || t("page.extractionFailed")}
            onRetry={runExtraction}
          />
        )}

        {!repoId ? (
          <EmptyState icon="ListChecks" title={t("page.empty.title")} body={t("page.noRepo")} />
        ) : isLoading ? (
          <div style={s.list}>
            <Skeleton height={150} />
            <Skeleton height={150} />
          </div>
        ) : isError ? (
          <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />
        ) : list.length === 0 ? (
          // The extraction error (rendered above) is the signal in the errored case.
          extract.isError ? null : (
            <EmptyState
              icon="ListChecks"
              title={t("page.empty.title")}
              body={t("page.empty.body")}
              cta={extract.isPending ? t("page.scanning") : t("page.empty.cta")}
              onCta={runExtraction}
            />
          )
        ) : (
          <>
            <div style={s.toolbar}>
              <Button kind="ghost" size="sm" icon="Check" onClick={acceptAll}>
                {t("page.acceptAll")}
              </Button>
              <Button kind="ghost" size="sm" icon="X" onClick={rejectAll}>
                {t("page.rejectAll")}
              </Button>
              <div style={s.spacer} />
              <Button
                kind="primary"
                size="sm"
                icon="Sparkles"
                onClick={() => setModalOpen(true)}
                disabled={accepted.length === 0}
              >
                {t("page.createSkill")}
              </Button>
            </div>
            <div style={s.list}>
              {list.map((c: ConventionCandidate) => (
                <ConventionCard
                  key={c.id}
                  convention={c}
                  onAccept={() => update.mutate({ id: c.id, patch: { accepted: true } })}
                  onReject={() => reject.mutate(c.id)}
                  onSaveEdit={(patch) => update.mutate({ id: c.id, patch })}
                  saving={update.isPending && update.variables?.id === c.id}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
