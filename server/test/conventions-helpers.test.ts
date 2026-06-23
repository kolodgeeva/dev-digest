import { describe, it, expect } from 'vitest';
import {
  groundCandidates,
  assembleSkillBody,
  toConventionDto,
} from '../src/modules/conventions/helpers.js';
import type { ExtractedConvention } from '../src/modules/conventions/schemas.js';
import type { ConventionRow } from '../src/db/rows.js';

/**
 * Unit tests for the conventions module's pure helpers — the grounding gate, the
 * skill-body assembler, and the row→DTO mapper. No DB, no LLM.
 */

const files = [
  { path: 'src/api/users.ts', content: 'const user = await db.users.find(id);\nreturn user;' },
  { path: 'src/lib/redis.ts', content: 'export const redis = new Redis(config.redisUrl);' },
];

function candidate(over: Partial<ExtractedConvention>): ExtractedConvention {
  return {
    category: 'style',
    rule: 'rule',
    evidence_path: 'src/api/users.ts',
    evidence_snippet: 'const user = await db.users.find(id);',
    confidence: 0.9,
    ...over,
  };
}

describe('groundCandidates', () => {
  it('keeps a candidate whose snippet is in the cited file (whitespace-tolerant)', () => {
    const kept = groundCandidates(
      [candidate({ evidence_snippet: 'const  user =\n  await db.users.find(id);' })],
      files,
    );
    expect(kept).toHaveLength(1);
  });

  it('drops a candidate whose snippet is NOT in the read files', () => {
    const kept = groundCandidates(
      [candidate({ evidence_snippet: 'const order = await db.orders.find(id);' })],
      files,
    );
    expect(kept).toHaveLength(0);
  });

  it('drops a candidate citing a file we never read', () => {
    const kept = groundCandidates([candidate({ evidence_path: 'src/nope.ts' })], files);
    expect(kept).toHaveLength(0);
  });

  it('drops a candidate with an empty snippet', () => {
    const kept = groundCandidates([candidate({ evidence_snippet: '   ' })], files);
    expect(kept).toHaveLength(0);
  });
});

describe('assembleSkillBody', () => {
  it('renders a section + fenced evidence per accepted candidate', () => {
    const body = assembleSkillBody(
      [
        {
          id: '1',
          rule: 'Always use async/await instead of .then() chains',
          evidence_path: 'src/api/users.ts',
          evidence_snippet: 'const user = await db.users.find(id);',
          confidence: 0.9,
          accepted: true,
        },
      ],
      'payments-api',
    );
    expect(body).toContain('# payments-api-conventions');
    expect(body).toContain('## always-use-async-await-instead-of-then-chains');
    expect(body).toContain('Detected in `src/api/users.ts`');
    expect(body).toContain('const user = await db.users.find(id);');
  });
});

describe('toConventionDto', () => {
  it('maps a row and coalesces nullable evidence/confidence', () => {
    const row: ConventionRow = {
      id: 'c1',
      workspaceId: 'w1',
      repoId: 'r1',
      rule: 'house rule',
      evidencePath: null,
      evidenceSnippet: null,
      confidence: null,
      accepted: true,
    };
    expect(toConventionDto(row)).toEqual({
      id: 'c1',
      rule: 'house rule',
      evidence_path: '',
      evidence_snippet: '',
      confidence: 0,
      accepted: true,
    });
  });
});
