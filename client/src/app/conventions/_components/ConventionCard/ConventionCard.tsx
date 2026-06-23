/* ConventionCard — one extracted house-rule candidate: the rule, its grounded
   evidence (file + snippet), a confidence bar, and accept/reject/edit controls.
   Edit switches the rule + snippet to inline inputs. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Badge, ProgressBar, TextInput, Textarea } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { s } from "./styles";

function confidenceColor(c: number): string {
  if (c >= 0.85) return "var(--ok, #34d399)";
  if (c >= 0.7) return "var(--warn, #f59e0b)";
  return "var(--text-muted)";
}

export function ConventionCard({
  convention,
  onAccept,
  onReject,
  onSaveEdit,
  saving,
}: {
  convention: ConventionCandidate;
  onAccept: () => void;
  onReject: () => void;
  onSaveEdit: (patch: { rule: string; evidence_snippet: string }) => void;
  saving?: boolean;
}) {
  const t = useTranslations("conventions");
  const [editing, setEditing] = React.useState(false);
  const [rule, setRule] = React.useState(convention.rule);
  const [snippet, setSnippet] = React.useState(convention.evidence_snippet);

  const startEdit = () => {
    setRule(convention.rule);
    setSnippet(convention.evidence_snippet);
    setEditing(true);
  };
  const save = () => {
    onSaveEdit({ rule: rule.trim(), evidence_snippet: snippet });
    setEditing(false);
  };

  const pct = Math.round(convention.confidence * 100);

  return (
    <div style={s.card}>
      <div style={s.topRow}>
        {editing ? (
          <div style={{ flex: 1 }}>
            <TextInput value={rule} onChange={setRule} placeholder={t("card.rulePlaceholder")} />
          </div>
        ) : (
          <p style={s.rule}>{convention.rule}</p>
        )}
        <div style={s.actions}>
          {convention.accepted ? (
            <Badge icon="Check" color="var(--ok, #34d399)">
              {t("card.accepted")}
            </Badge>
          ) : (
            <Button kind="primary" size="sm" icon="Sparkles" onClick={onAccept} loading={saving}>
              {t("card.acceptAsSkill")}
            </Button>
          )}
          {!editing && (
            <Button kind="secondary" size="sm" icon="Edit" onClick={startEdit}>
              {t("card.edit")}
            </Button>
          )}
          <Button kind="ghost" size="sm" icon="X" onClick={onReject}>
            {t("card.reject")}
          </Button>
        </div>
      </div>

      {editing ? (
        <div style={s.editRow}>
          <Textarea value={snippet} onChange={setSnippet} rows={4} mono placeholder={t("card.snippetPlaceholder")} />
          <div style={s.editActions}>
            <Button kind="ghost" size="sm" onClick={() => setEditing(false)}>
              {t("card.cancel")}
            </Button>
            <Button kind="primary" size="sm" icon="Check" onClick={save}>
              {t("card.save")}
            </Button>
          </div>
        </div>
      ) : (
        convention.evidence_path && (
          <div style={s.evidence}>
            <div style={s.evidenceHead} className="mono">
              {convention.evidence_path}
            </div>
            <pre style={s.snippet} className="mono">
              {convention.evidence_snippet}
            </pre>
          </div>
        )
      )}

      <div style={s.confidenceRow}>
        <span style={s.confidenceLabel}>{t("card.confidence")}</span>
        <div style={s.bar}>
          <ProgressBar value={pct} color={confidenceColor(convention.confidence)} />
        </div>
        <span style={s.pct}>{pct}%</span>
      </div>
    </div>
  );
}
