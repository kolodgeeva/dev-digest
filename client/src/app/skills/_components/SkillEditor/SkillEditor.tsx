/* SkillEditor — right-hand panel of the Skills view. Two tabs:
   - Config: edit name / description / type / markdown body + enabled toggle, Save.
   - Preview: the body rendered exactly as the reviewing agent receives it.
   A skill is pure text (no tools); imported/community bodies are flagged untrusted
   and wrapped as data on injection — surfaced here as a vetting notice. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Tabs, FormField, TextInput, Textarea, SelectInput, Toggle, Button, Badge, Icon, Markdown } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { useUpdateSkill } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { isUntrusted } from "../SkillsView/helpers";
import { SKILL_TYPES } from "./constants";
import { s } from "./styles";

export function SkillEditor({ skill, tab, onTab }: { skill: Skill; tab: string; onTab: (t: string) => void }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const update = useUpdateSkill();

  const [name, setName] = React.useState(skill.name);
  const [description, setDescription] = React.useState(skill.description);
  const [type, setType] = React.useState<SkillType>(skill.type);
  const [body, setBody] = React.useState(skill.body);
  const [enabled, setEnabled] = React.useState(skill.enabled);

  // Reset local form when switching skills.
  React.useEffect(() => {
    setName(skill.name);
    setDescription(skill.description);
    setType(skill.type);
    setBody(skill.body);
    setEnabled(skill.enabled);
  }, [skill.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const untrusted = isUntrusted(skill.source);
  const tabs = [
    { key: "config", label: t("editor.tabs.config"), icon: "Settings" as const },
    { key: "preview", label: t("editor.tabs.preview"), icon: "Eye" as const },
  ];
  const typeOptions = SKILL_TYPES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  const save = () =>
    update.mutate(
      { id: skill.id, patch: { name, description, type, body, enabled } },
      { onSuccess: (data) => toast.success(t("editor.savedToast", { name: data.name, version: data.version })) },
    );

  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <Icon.Sparkles size={18} style={{ color: "var(--accent)" }} />
        <h1 style={s.title}>{skill.name}</h1>
        <Badge color="var(--text-secondary)">{t(`listItem.source.${skill.source}`)}</Badge>
        <Badge color="var(--text-muted)" mono>
          {t("editor.version", { version: skill.version })}
        </Badge>
      </div>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0 28px" />
      </div>
      <div style={s.body}>
        {tab === "preview" ? (
          <>
            <p style={s.previewHint}>{t("editor.previewHint")}</p>
            {body.trim() ? (
              <div style={s.previewCard}>
                <Markdown>{body}</Markdown>
              </div>
            ) : (
              <p style={s.savedNote}>{t("editor.previewEmpty")}</p>
            )}
          </>
        ) : (
          <div style={s.form}>
            {untrusted && (
              <div style={s.notice}>
                <Icon.Shield size={16} style={{ color: "var(--warn)", flexShrink: 0, marginTop: 1 }} />
                <span>{t("editor.untrustedNotice")}</span>
              </div>
            )}
            <div style={s.header}>
              <label style={s.enabledLabel}>
                {t("editor.enabled")}
                <Toggle on={enabled} onChange={setEnabled} size={16} />
              </label>
            </div>
            <FormField label={t("editor.name")} required>
              <TextInput value={name} onChange={setName} placeholder={t("editor.namePlaceholder")} />
            </FormField>
            <FormField label={t("editor.description")}>
              <TextInput
                value={description}
                onChange={setDescription}
                placeholder={t("editor.descriptionPlaceholder")}
              />
            </FormField>
            <FormField label={t("editor.type")}>
              <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} mono={false} />
            </FormField>
            <FormField label={t("editor.body")} hint={t("editor.bodyHint")}>
              <Textarea value={body} onChange={setBody} rows={14} mono placeholder={t("editor.bodyPlaceholder")} />
            </FormField>
            <div style={s.actions}>
              <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending}>
                {update.isPending ? t("editor.saving") : t("editor.save")}
              </Button>
              {update.isSuccess && (
                <span style={s.savedNote}>{t("editor.version", { version: update.data?.version })}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
