/* SkillsTab — attach reusable skills to this agent. Lists every workspace skill
   with a toggle; attached skills sort first in their link order (order matters —
   it's the order they appear in the assembled review prompt). Attached rows are
   drag-reorderable by the handle. Both toggling and reordering persist via
   POST /agents/:id/skills { skill_ids } (the array order = prompt order). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, Icon, Badge, ErrorState, Skeleton, EmptyState } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useSkills, useAgentSkillLinks, useSetAgentSkills } from "@/lib/hooks/skills";
import { orderedAttach, filterAndRank, reorder } from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const skills = useSkills();
  const links = useAgentSkillLinks(agent.id);
  const setSkills = useSetAgentSkills();
  const [query, setQuery] = React.useState("");

  // Local, optimistic copy of the attached order so toggling and drag-reorder
  // update instantly; it re-syncs whenever the server link set changes.
  const serverAttached = orderedAttach(links.data ?? []);
  const serverKey = serverAttached.join(",");
  const [attachedIds, setAttachedIds] = React.useState<string[]>(serverAttached);
  const [dragId, setDragId] = React.useState<string | null>(null);
  React.useEffect(() => {
    setAttachedIds(serverAttached);
  }, [serverKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const attachedSet = new Set(attachedIds);

  const persist = (next: string[]) => {
    setAttachedIds(next);
    setSkills.mutate({ agentId: agent.id, skillIds: next });
  };
  const toggle = (id: string, on: boolean) =>
    persist(on ? [...attachedIds, id] : attachedIds.filter((x) => x !== id));

  // Drag-reorder among attached rows: reorder live on drag-over, persist on drop.
  const onDragOver = (overId: string) => {
    if (!dragId || dragId === overId) return;
    setAttachedIds((prev) => reorder(prev, dragId, overId));
  };
  const onDragEnd = () => {
    if (dragId) setSkills.mutate({ agentId: agent.id, skillIds: attachedIds });
    setDragId(null);
  };

  if (skills.isError) return <ErrorState body={t("skills.title")} onRetry={() => skills.refetch()} />;
  if (skills.isLoading || links.isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={56} />
        <Skeleton height={56} />
      </div>
    );
  }

  const all = skills.data ?? [];
  const ranked = filterAndRank(all, attachedIds, query);

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <span style={s.count}>{t("skills.enabledCount", { linked: attachedIds.length, total: all.length })}</span>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>
      <div style={s.search}>
        <Icon.Search size={13} style={{ color: "var(--text-muted)" }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("skills.filterPlaceholder")}
          style={s.searchInput}
        />
      </div>
      {all.length === 0 ? (
        <EmptyState icon="Sparkles" title={t("skills.title")} />
      ) : (
        <div style={s.list}>
          {ranked.map((sk) => {
            const attached = attachedSet.has(sk.id);
            const orderNo = attached ? attachedIds.indexOf(sk.id) + 1 : null;
            return (
              <div
                key={sk.id}
                style={s.row(attached, dragId === sk.id)}
                draggable={attached}
                onDragStart={() => attached && setDragId(sk.id)}
                onDragOver={(e) => {
                  e.preventDefault();
                  onDragOver(sk.id);
                }}
                onDrop={(e) => e.preventDefault()}
                onDragEnd={onDragEnd}
              >
                <span style={s.handle(attached)} aria-hidden="true" title={attached ? t("skills.dragTitle") : undefined}>
                  <Icon.Menu size={14} />
                </span>
                <span style={s.orderNo}>{orderNo ?? ""}</span>
                <div style={s.rowMain}>
                  <div style={s.rowName}>
                    <Icon.Sparkles size={14} style={{ color: "var(--accent)" }} />
                    {sk.name}
                    <span style={s.typeChip}>{sk.type}</span>
                    {!sk.enabled && <Badge color="var(--text-muted)">disabled</Badge>}
                  </div>
                  {sk.description && <div style={s.rowDesc}>{sk.description}</div>}
                </div>
                <Toggle on={attached} onChange={(on) => toggle(sk.id, on)} size={16} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
