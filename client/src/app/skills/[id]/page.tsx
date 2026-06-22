"use client";

import { useParams } from "next/navigation";
import { SkillsView } from "../_components/SkillsView";

/* Route: /skills/:id — same master-detail view with a skill pre-selected in the
   right-hand editor. Tab state lives in ?tab=. */
export default function SkillEditorPage() {
  const { id } = useParams<{ id: string }>();
  return <SkillsView selectedId={id} />;
}
