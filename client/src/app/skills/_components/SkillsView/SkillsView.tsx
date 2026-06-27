/* SkillsView — master-detail Skills page shared by /skills and /skills/:id.
   Left rail: search + "Add Skill" (blank / import file / community) + the skill
   list. Right pane: the SkillEditor for the selected skill, or a select-prompt.
   Skills are reusable, text-only review guidance shared across agents. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Skeleton, Icon } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { useSkills, useSkill, useCreateSkill, useUpdateSkill, useDeleteSkill } from "@/lib/hooks/skills";
import { routes } from "@/lib/routes";
import { useDocumentTitle } from "@/lib/hooks/use-document-title";
import { useToast } from "@/lib/toast";
import { SkillListItem } from "../SkillListItem";
import { SkillEditor } from "../SkillEditor";
import { AddSkillDrawer } from "../AddSkillDrawer";
import { filterSkills } from "./helpers";
import { s } from "./styles";

const VALID_TABS = ["config", "preview"];

export function SkillsView({ selectedId }: { selectedId?: string }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const search = useSearchParams();
  const toast = useToast();
  useDocumentTitle(t("page.heading"));

  const { data: skills, isLoading, isError, refetch } = useSkills();
  const selected = useSkill(selectedId);
  const create = useCreateSkill();
  const update = useUpdateSkill();
  const del = useDeleteSkill();

  const [query, setQuery] = React.useState("");
  const [drawer, setDrawer] = React.useState<null | "file" | "community">(null);

  const list = filterSkills(skills ?? [], query);
  const tab = VALID_TABS.includes(search.get("tab") ?? "") ? search.get("tab")! : "config";
  const setTab = (next: string) => {
    if (!selectedId) return;
    router.replace(routes.skill(selectedId, next));
  };

  const openSkill = (id: string) => router.push(routes.skill(id, tab));
  const afterCreate = (skill: Skill) => router.push(routes.skill(skill.id, "config"));

  const createBlank = () =>
    create.mutate(
      { name: t("editor.newName"), type: "custom", body: "", enabled: false },
      {
        onSuccess: (skill) => {
          toast.success(t("editor.createdToast", { name: skill.name }));
          afterCreate(skill);
        },
      },
    );

  const onImported = (skill: Skill) => {
    setDrawer(null);
    afterCreate(skill);
  };

  const onDelete = (skill: Skill) => {
    if (!window.confirm(t("page.deleteConfirm", { name: skill.name }))) return;
    del.mutate(skill.id, {
      onSuccess: () => {
        if (skill.id === selectedId) router.push(routes.skills());
      },
    });
  };

  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbSkills"), href: routes.skills() }];

  return (
    <AppShell crumb={crumb}>
      {drawer && <AddSkillDrawer initialTab={drawer} onClose={() => setDrawer(null)} onImported={onImported} />}
      <div style={s.shell}>
        {/* left: skill list */}
        <div style={s.left}>
          <div style={s.leftHeader}>
            <div style={s.titleRow}>
              <h1 style={s.h1}>{t("page.heading")}</h1>
              <Dropdown
                width={230}
                align="right"
                trigger={
                  <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                    {t("page.addSkill")}
                  </Button>
                }
                items={[
                  { label: t("page.menu.blank"), icon: "Edit", onClick: createBlank },
                  { divider: true },
                  { label: t("page.menu.fromFile"), icon: "FileText", onClick: () => setDrawer("file") },
                  { label: t("page.menu.community"), icon: "Globe", onClick: () => setDrawer("community") },
                ]}
              />
            </div>
            <div style={s.search}>
              <Icon.Search size={13} style={s.searchIcon} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("page.searchPlaceholder")}
                style={s.searchInput}
              />
            </div>
          </div>
          <div style={s.list}>
            {isLoading && (
              <>
                <Skeleton height={64} />
                <Skeleton height={64} />
                <Skeleton height={64} />
              </>
            )}
            {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
            {!isLoading && !isError && list.length === 0 && (
              <EmptyState
                icon="Sparkles"
                title={t("page.empty.title")}
                body={t("page.empty.body")}
                cta={t("page.empty.cta")}
                onCta={createBlank}
              />
            )}
            {list.map((sk) => (
              <SkillListItem
                key={sk.id}
                skill={sk}
                active={sk.id === selectedId}
                onClick={() => openSkill(sk.id)}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
                onDelete={() => onDelete(sk)}
                deleting={del.isPending && del.variables === sk.id}
              />
            ))}
          </div>
        </div>

        {/* right: editor / select-prompt */}
        <div style={s.right}>
          {!selectedId ? (
            <div style={s.empty}>
              <EmptyState icon="Sparkles" title={t("page.selectPrompt.title")} body={t("page.selectPrompt.body")} />
            </div>
          ) : selected.isLoading ? (
            <div style={s.skeletons}>
              <Skeleton height={24} width={240} />
              <Skeleton height={200} />
            </div>
          ) : selected.isError || !selected.data ? (
            <div style={s.empty}>
              <EmptyState icon="Sparkles" title={t("detail.notFound.title")} body={t("detail.notFound.body")} />
            </div>
          ) : (
            <SkillEditor skill={selected.data} tab={tab} onTab={setTab} />
          )}
        </div>
      </div>
    </AppShell>
  );
}
