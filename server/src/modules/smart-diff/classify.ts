import type { SmartDiff, SmartDiffFile, SmartDiffRole } from '@devdigest/shared';
import {
  BOILERPLATE_PATTERNS,
  GROUP_ORDER,
  SPLIT_MIN_GROUPS,
  SPLIT_TOTAL_LINES_THRESHOLD,
  WIRING_PATTERNS,
} from './constants.js';

/**
 * Smart Diff classifier — pure domain logic (no Fastify/Drizzle/network).
 * Deterministically composes the already-imported pr_files with the latest
 * review's findings into the `SmartDiff` contract. No LLM, no I/O.
 */

/** Classify one file path by role: boilerplate → wiring → core (first match). */
export function classifyFile(path: string): SmartDiffRole {
  if (BOILERPLATE_PATTERNS.some((re) => re.test(path))) return 'boilerplate';
  if (WIRING_PATTERNS.some((re) => re.test(path))) return 'wiring';
  return 'core';
}

export interface SmartDiffInputFile {
  path: string;
  additions: number;
  deletions: number;
}

export interface SmartDiffInputFinding {
  file: string;
  start_line: number;
}

/** Parent directory of a path (the split key). Root files cluster as "(root)". */
function dirOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '(root)' : path.slice(0, i);
}

/**
 * Build the SmartDiff from changed files + the latest review's findings.
 *
 * - Each file gets `finding_lines` = the unique, ascending start-lines the
 *   latest review flagged in it (empty before the first review).
 * - Files bucket into core/wiring/boilerplate; within a group the ones with
 *   the most findings (then the biggest diffs) float to the top.
 * - Empty groups are omitted; groups render in GROUP_ORDER.
 * - `split_suggestion` is computed over core+wiring lines only (boilerplate
 *   never counts toward "too big").
 */
export function buildSmartDiff(
  files: SmartDiffInputFile[],
  findings: SmartDiffInputFinding[],
): SmartDiff {
  // findings grouped by file → unique ascending lines
  const linesByFile = new Map<string, Set<number>>();
  for (const f of findings) {
    let set = linesByFile.get(f.file);
    if (!set) linesByFile.set(f.file, (set = new Set<number>()));
    set.add(f.start_line);
  }

  const buckets: Record<SmartDiffRole, SmartDiffFile[]> = {
    core: [],
    wiring: [],
    boilerplate: [],
  };

  for (const file of files) {
    const role = classifyFile(file.path);
    const finding_lines = [...(linesByFile.get(file.path) ?? [])].sort((a, b) => a - b);
    buckets[role].push({
      path: file.path,
      pseudocode_summary: null,
      additions: file.additions,
      deletions: file.deletions,
      finding_lines,
    });
  }

  // Sort within each group: most findings first, then biggest diff, then path.
  for (const role of GROUP_ORDER) {
    buckets[role].sort(
      (a, b) =>
        b.finding_lines.length - a.finding_lines.length ||
        b.additions + b.deletions - (a.additions + a.deletions) ||
        a.path.localeCompare(b.path),
    );
  }

  const groups = GROUP_ORDER.filter((role) => buckets[role].length > 0).map((role) => ({
    role,
    files: buckets[role],
  }));

  // Split suggestion: only the reviewable surface (core + wiring) counts.
  const reviewable = [...buckets.core, ...buckets.wiring];
  const total_lines = reviewable.reduce((n, f) => n + f.additions + f.deletions, 0);

  const clusters = new Map<string, string[]>();
  for (const f of buckets.core) {
    const dir = dirOf(f.path);
    let list = clusters.get(dir);
    if (!list) clusters.set(dir, (list = []));
    list.push(f.path);
  }

  const too_big = total_lines > SPLIT_TOTAL_LINES_THRESHOLD && clusters.size >= SPLIT_MIN_GROUPS;
  const proposed_splits = too_big
    ? [...clusters.entries()].map(([name, splitFiles]) => ({ name, files: splitFiles }))
    : [];

  return { groups, split_suggestion: { too_big, total_lines, proposed_splits } };
}
