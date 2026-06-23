import type { ConventionCandidate } from '@devdigest/shared';
import type { ConventionRow } from '../../db/rows.js';
import type { ExtractedConvention } from './schemas.js';

/**
 * Pure helpers for the conventions module — grounding, DTO mapping, and skill-body
 * assembly. No I/O.
 */

/** Collapse all whitespace runs to a single space and trim — for tolerant matching. */
function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Grounding gate (mirrors reviewer-core's "cite real code or be dropped" rule):
 * keep a candidate only when its `evidence_path` is one of the files we actually
 * read AND its `evidence_snippet` appears in that file (whitespace-normalized
 * substring). Drops hallucinated paths and paraphrased/invented snippets.
 */
export function groundCandidates(
  candidates: ExtractedConvention[],
  files: { path: string; content: string }[],
): ExtractedConvention[] {
  const byPath = new Map(files.map((f) => [f.path, normalize(f.content)]));
  return candidates.filter((c) => {
    const haystack = byPath.get(c.evidence_path);
    if (haystack === undefined) return false;
    const needle = normalize(c.evidence_snippet);
    return needle.length > 0 && haystack.includes(needle);
  });
}

/** Map a persisted convention row to the public `ConventionCandidate` DTO. */
export function toConventionDto(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    rule: row.rule,
    evidence_path: row.evidencePath ?? '',
    evidence_snippet: row.evidenceSnippet ?? '',
    confidence: row.confidence ?? 0,
    accepted: row.accepted,
  };
}

/** `Always use async/await` → `always-use-async-await` (skill section anchor). */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * Merge accepted candidates into one markdown skill body. Each rule becomes a
 * section with its evidence snippet, so a review agent can flag violations and
 * cite the precedent. Mirrors the "Create skill from conventions" preview.
 */
export function assembleSkillBody(accepted: ConventionCandidate[], repoName: string): string {
  const header = [
    `# ${repoName}-conventions`,
    '',
    `House conventions for \`${repoName}\`. Flag changes that violate any rule below and ` +
      'cite the offending `file:line`.',
  ];
  const sections = accepted.map((c) => {
    const lines = [
      '',
      `## ${slugify(c.rule) || 'convention'}`,
      c.rule,
    ];
    if (c.evidence_path) {
      lines.push('', `Detected in \`${c.evidence_path}\`:`, '```', c.evidence_snippet, '```');
    }
    return lines.join('\n');
  });
  return [...header, ...sections].join('\n');
}
