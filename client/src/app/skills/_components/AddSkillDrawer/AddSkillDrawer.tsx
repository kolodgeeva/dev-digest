/* AddSkillDrawer — the import surface. Two paths, both producing an untrusted
   skill (disabled until vetted):
   - From file: read a local .md, body = file contents, name derived if blank →
     POST /skills/import { name, body }  (source: imported_url).
   - Community: search the seeded catalog, preview a card, one-click import →
     POST /skills/import { catalog_id }  (source: community).
   The catalog endpoint returns cards only (no body) — bodies stay server-side
   until import. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Drawer, Tabs, FormField, TextInput, Textarea, Button, Badge, Icon, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { CommunitySkill, Skill } from "@devdigest/shared";
import { useImportSkill, useCommunityCatalog } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { deriveNameFromFile, filterCatalog } from "./helpers";
import { s } from "./styles";

export function AddSkillDrawer({
  initialTab = "file",
  onClose,
  onImported,
}: {
  initialTab?: "file" | "community";
  onClose: () => void;
  onImported: (skill: Skill) => void;
}) {
  const t = useTranslations("skills");
  const toast = useToast();
  const importSkill = useImportSkill();
  const [tab, setTab] = React.useState<string>(initialTab);

  // --- file path state ---
  const [name, setName] = React.useState("");
  const [body, setBody] = React.useState("");
  const fileInput = React.useRef<HTMLInputElement>(null);
  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBody(await file.text());
    if (!name.trim()) setName(deriveNameFromFile(file.name));
  };

  // --- community path state ---
  const catalog = useCommunityCatalog(tab === "community");
  const [q, setQ] = React.useState("");
  const [selected, setSelected] = React.useState<CommunitySkill | null>(null);
  const cards = filterCatalog(catalog.data ?? [], q);

  const done = (skill: Skill) => {
    toast.success(t("file.success", { name: skill.name }));
    onImported(skill);
  };
  const importFile = () => importSkill.mutate({ name: name.trim() || undefined, body }, { onSuccess: done });
  const importCommunity = () => {
    if (!selected) return;
    importSkill.mutate({ catalog_id: selected.name }, { onSuccess: done });
  };

  const tabs = [
    { key: "file", label: t("drawer.tabs.file"), icon: "FileText" as const },
    { key: "community", label: t("drawer.tabs.community"), icon: "Globe" as const },
  ];

  return (
    <Drawer
      width={760}
      title={t("drawer.title")}
      subtitle={t("drawer.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          {tab === "file" ? (
            <Button kind="primary" icon="Upload" onClick={importFile} disabled={!body.trim() || importSkill.isPending}>
              {importSkill.isPending ? t("file.importing") : t("file.import")}
            </Button>
          ) : (
            <Button
              kind="primary"
              icon="Plus"
              onClick={importCommunity}
              disabled={!selected || importSkill.isPending}
            >
              {importSkill.isPending ? t("community.importing") : t("community.import")}
            </Button>
          )}
        </div>
      }
    >
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={setTab} pad="0" />
      </div>

      {tab === "file" ? (
        <div>
          <div style={s.field}>
            <div style={s.fileRow}>
              <Button kind="secondary" icon="Upload" onClick={() => fileInput.current?.click()}>
                {t("file.pick")}
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept=".md,.markdown,text/markdown,text/plain"
                onChange={onPickFile}
                style={{ display: "none" }}
              />
            </div>
          </div>
          <div style={s.field}>
            <FormField label={t("file.nameLabel")} hint={t("file.nameHint")}>
              <TextInput value={name} onChange={setName} placeholder={t("file.namePlaceholder")} />
            </FormField>
          </div>
          <FormField label={t("file.bodyLabel")} hint={t("file.bodyHint")}>
            <Textarea value={body} onChange={setBody} rows={12} mono placeholder={t("file.bodyPlaceholder")} />
          </FormField>
        </div>
      ) : (
        <div>
          <div style={s.catalogSearch}>
            <Icon.Search size={13} style={{ color: "var(--text-muted)" }} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("community.searchPlaceholder")}
              style={s.searchInput}
            />
          </div>
          {catalog.isLoading && <Skeleton height={240} />}
          {catalog.isError && <ErrorState body={t("community.loadError")} onRetry={() => catalog.refetch()} />}
          {catalog.data && cards.length === 0 && (
            <EmptyState icon="Globe" title={t("community.noMatch.title")} body={t("community.noMatch.body")} />
          )}
          {catalog.data && cards.length > 0 && (
            <div style={s.cols}>
              <div style={s.cardList}>
                {cards.map((c) => (
                  <button key={c.name} onClick={() => setSelected(c)} style={s.card(selected?.name === c.name)}>
                    <div style={s.cardName}>
                      <Icon.Sparkles size={14} style={{ color: "var(--accent)" }} />
                      {c.name}
                    </div>
                    <div style={s.cardDesc}>{c.desc}</div>
                    <div style={s.cardMeta}>
                      <span>
                        <Icon.Star size={12} /> {c.stars}
                      </span>
                      <Badge color="var(--text-secondary)" mono>
                        {c.lang}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
              <div style={s.preview}>
                {selected ? (
                  <div>
                    <div style={s.cardName}>{selected.name}</div>
                    <div style={s.cardDesc}>{selected.desc}</div>
                    <div style={s.cardMeta}>
                      <span className="mono">{selected.repo}</span>
                    </div>
                    <p style={s.hint}>{t("editor.untrustedNotice")}</p>
                  </div>
                ) : (
                  <div style={s.previewEmpty}>{t("community.selectPrompt")}</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
