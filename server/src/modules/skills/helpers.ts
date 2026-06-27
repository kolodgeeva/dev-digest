import type { Skill, SkillSource, SkillType } from '@devdigest/shared';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import type { SkillRow } from '../../db/rows.js';

/**
 * Pure helpers for the skills module — DB row ⇄ DTO mapping and small parsing
 * utilities. No I/O.
 */

/** Skill sources whose body is untrusted and must be delimiter-wrapped on inject. */
const UNTRUSTED_SOURCES: readonly SkillSource[] = ['community', 'imported_url'];

/**
 * Render a linked skill's body for the review prompt's `## Skills / rules` slot.
 * Imported/community bodies are untrusted text — wrapped in `<untrusted>` so the
 * model treats them as data, never instructions. Manual/extracted bodies (the
 * user authored them) pass through trusted.
 */
export function skillPromptBlock(skill: Pick<Skill, 'name' | 'body' | 'source'>): string {
  return UNTRUSTED_SOURCES.includes(skill.source)
    ? wrapUntrusted(`skill:${skill.name}`, skill.body)
    : skill.body;
}

/** Map a persisted skill row to the public `Skill` DTO. */
export function toSkillDto(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as Skill['source'],
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
  };
}

/**
 * Derive a skill name for a markdown import: the first `# H1` heading, else the
 * first non-empty line, trimmed. Callers fall back to a filename when the body
 * yields nothing usable.
 */
export function deriveSkillName(body: string): string {
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const h1 = /^#\s+(.+)$/.exec(line);
    return (h1?.[1] ?? line).trim().slice(0, 120);
  }
  return '';
}
