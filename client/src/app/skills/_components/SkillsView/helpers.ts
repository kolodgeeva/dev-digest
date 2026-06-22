import type { Skill, SkillSource } from "@devdigest/shared";

/** Case-insensitive filter over a skill's name + description. */
export function filterSkills(skills: Skill[], search: string): Skill[] {
  const q = search.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter((s) => `${s.name} ${s.description}`.toLowerCase().includes(q));
}

/** Imported/community bodies are untrusted — wrapped as data on injection. */
const UNTRUSTED_SOURCES: readonly SkillSource[] = ["community", "imported_url"];
export function isUntrusted(source: SkillSource): boolean {
  return UNTRUSTED_SOURCES.includes(source);
}
