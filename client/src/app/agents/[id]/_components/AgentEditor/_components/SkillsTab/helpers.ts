import type { AgentSkillLink, Skill } from "@devdigest/shared";

/** Linked skill ids in prompt order (ascending `order`). */
export function orderedAttach(links: AgentSkillLink[]): string[] {
  return [...links].sort((a, b) => a.order - b.order).map((l) => l.skill_id);
}

/**
 * Move `fromId` to sit at `toId`'s position within `ids`, preserving the rest.
 * Used by drag-to-reorder. Returns the input unchanged when either id is absent
 * or they're already the same slot (no needless re-render / persist).
 */
export function reorder(ids: string[], fromId: string, toId: string): string[] {
  const from = ids.indexOf(fromId);
  const to = ids.indexOf(toId);
  if (from === -1 || to === -1 || from === to) return ids;
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, fromId);
  return next;
}

/**
 * Filter skills by query, then rank attached-first (preserving link order),
 * unattached after (preserving the incoming list order). Keeps the prompt order
 * visible at the top while the rest stays browsable.
 */
export function filterAndRank(skills: Skill[], attachedIds: string[], query: string): Skill[] {
  const q = query.trim().toLowerCase();
  const matches = q
    ? skills.filter((s) => `${s.name} ${s.description}`.toLowerCase().includes(q))
    : skills;
  const rank = new Map(attachedIds.map((id, i) => [id, i]));
  // Attached → their link order; unattached → a stable slot after all attached
  // (keyed by original index so the relative order of unattached is preserved).
  const keyOf = (s: Skill, i: number) => (rank.has(s.id) ? rank.get(s.id)! : attachedIds.length + i);
  return matches
    .map((s, i) => ({ s, k: keyOf(s, i) }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.s);
}
