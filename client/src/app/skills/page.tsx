import { SkillsView } from "./_components/SkillsView";

/* Route: /skills — master-detail Skills page (list + editor). Thin route entry;
   the view, its import drawer, editor, styles and i18n are colocated under
   _components/SkillsView. */
export default function SkillsPage() {
  return <SkillsView />;
}
