import { ConventionsView } from "./_components/ConventionsView";

/* Route: /conventions — scan the active repo for house-rules, triage them, and
   merge accepted ones into a Skill. Thin route entry; the view, its card, the
   create-skill modal, styles and i18n are colocated under _components. */
export default function ConventionsPage() {
  return <ConventionsView />;
}
