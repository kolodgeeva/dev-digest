/* CreateSkillFromConventionsModal — merges the repo's accepted conventions into
   one editable Skill. Prefills name/description/body from the server draft, then
   lets the user tweak metadata + body before saving as `source: extracted`. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Modal, Button, FormField, TextInput, Textarea, SelectInput, Toggle } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { routes } from "@/lib/routes";
import { useToast } from "@/lib/toast";
import { useDraftConventionSkill, useCreateConventionSkill } from "@/lib/hooks/conventions";
import { s } from "./styles";

const TYPE_OPTIONS: { value: SkillType; label: string }[] = [
  { value: "convention", label: "convention" },
  { value: "rubric", label: "rubric" },
  { value: "security", label: "security" },
  { value: "custom", label: "custom" },
];

export function CreateSkillFromConventionsModal({
  repoId,
  acceptedCount,
  onClose,
}: {
  repoId: string;
  acceptedCount: number;
  onClose: () => void;
}) {
  const t = useTranslations("conventions");
  const router = useRouter();
  const toast = useToast();
  const draft = useDraftConventionSkill(repoId);
  const create = useCreateConventionSkill(repoId);

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>("convention");
  const [enabled, setEnabled] = React.useState(true);
  const [body, setBody] = React.useState("");

  // Prefill from the server-assembled draft when the modal opens.
  const draftMutate = draft.mutate;
  React.useEffect(() => {
    draftMutate(undefined, {
      onSuccess: (d) => {
        setName(d.name);
        setDescription(d.description);
        setBody(d.body);
      },
    });
  }, [draftMutate]);

  const submit = () => {
    create.mutate(
      { name: name.trim() || `conventions`, description, type, enabled, body },
      {
        onSuccess: (skill) => {
          toast.success(t("modal.createdToast", { name: skill.name }));
          onClose();
          router.push(routes.skill(skill.id, "config"));
        },
      },
    );
  };

  return (
    <Modal
      width={760}
      title={t("modal.title")}
      subtitle={`${t("modal.subtitlePrefix")}${acceptedCount}${t("modal.subtitleSuffix")}`}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("modal.cancel")}
          </Button>
          <Button kind="primary" icon="Sparkles" onClick={submit} disabled={create.isPending || draft.isPending}>
            {create.isPending ? t("modal.creating") : t("modal.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <FormField label={t("modal.name")} required>
          <TextInput value={name} onChange={setName} mono />
        </FormField>
        <FormField label={t("modal.description")}>
          <TextInput value={description} onChange={setDescription} />
        </FormField>
        <div style={s.twoCol}>
          <FormField label={t("modal.type")}>
            <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={TYPE_OPTIONS} />
          </FormField>
          <FormField label={t("modal.enabled")} hint={t("modal.enabledHint")}>
            <Toggle on={enabled} onChange={setEnabled} />
          </FormField>
        </div>
        <FormField label={t("modal.body")} required>
          <Textarea value={body} onChange={setBody} rows={12} mono />
        </FormField>
      </div>
    </Modal>
  );
}
