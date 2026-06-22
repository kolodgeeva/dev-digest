import type { CommunitySkill } from "@devdigest/shared";

/** Derive a skill name from an uploaded file's name (strip dir + .md extension). */
export function deriveNameFromFile(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? fileName;
  return base.replace(/\.(md|markdown|txt)$/i, "").trim();
}

/** Case-insensitive filter over a catalog card's name + desc + lang. */
export function filterCatalog(cards: CommunitySkill[], search: string): CommunitySkill[] {
  const q = search.trim().toLowerCase();
  if (!q) return cards;
  return cards.filter((c) => `${c.name} ${c.desc} ${c.lang}`.toLowerCase().includes(q));
}
