/* SkillListItem — left-rail row: name, type chip, source badge, an "untrusted /
   needs vetting" marker for community/imported skills that aren't enabled yet,
   and a delete control. Selecting it opens the skill in the right-hand editor. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { isUntrusted } from "../SkillsView/helpers";
import { s } from "./styles";

export function SkillListItem({
  skill,
  active,
  onClick,
  onToggle,
  onDelete,
  deleting,
}: {
  skill: Skill;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  const t = useTranslations("skills");
  const untrusted = isUntrusted(skill.source);
  const needsVetting = untrusted && !skill.enabled;
  return (
    <div onClick={onClick} style={s.card(!!active, skill.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Sparkles size={14} />
        </div>
        <span style={s.name}>{skill.name}</span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </div>
        )}
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            disabled={deleting}
            title="Delete skill"
            aria-label="Delete skill"
            style={s.del(!!deleting)}
          >
            <Icon.Trash size={14} style={deleting ? { animation: "ddspin 1s linear infinite" } : undefined} />
          </button>
        )}
      </div>
      <div style={s.metaRow}>
        <span style={s.typeChip}>{t(`listItem.type.${skill.type}`)}</span>
        <Badge color="var(--text-secondary)">{t(`listItem.source.${skill.source}`)}</Badge>
        {needsVetting && (
          <span title={t("listItem.vettingTitle")} style={{ display: "inline-flex" }}>
            <Badge color="var(--warn)" icon="AlertTriangle">
              {t("listItem.needsVetting")}
            </Badge>
          </span>
        )}
      </div>
    </div>
  );
}
