import { describe, it, expect } from 'vitest';
import { getConventionsHandler } from '../get-conventions.js';
import { ApiError } from '../../errors.js';
import { makeDeps, conventionCandidate } from './fixtures.js';

describe('get_conventions', () => {
  it('returns the projected conventions for a known repo', async () => {
    const deps = makeDeps({
      getConventions: async () => [conventionCandidate({ rule: 'Use Zod' })],
    });
    const res = await getConventionsHandler(deps)({ repo: 'acme/api' });
    const out = res.structuredContent as { repo: string; conventions: { rule: string }[] };
    expect(out.repo).toBe('acme/api');
    expect(out.conventions).toHaveLength(1);
    expect(out.conventions[0]!.rule).toBe('Use Zod');
    expect(Object.keys(out.conventions[0]!)).toEqual([
      'rule',
      'evidence_path',
      'confidence',
      'accepted',
    ]);
  });

  it('adds an onward hint (still not an error) when no conventions exist', async () => {
    const res = await getConventionsHandler(makeDeps())({ repo: 'acme/api' });
    expect(res.isError).toBeFalsy();
    expect((res.structuredContent as { conventions: unknown[] }).conventions).toEqual([]);
    expect((res.content as { text: string }[])[0]!.text).toMatch(/extraction/i);
  });

  it('returns an actionable error for an unimported repo', async () => {
    const deps = makeDeps({
      getConventions: async () => {
        throw new ApiError(404, 'Repo "ghost/missing" not imported');
      },
    });
    const res = await getConventionsHandler(deps)({ repo: 'ghost/missing' });
    expect(res.isError).toBe(true);
    expect((res.content as { text: string }[])[0]!.text).toMatch(/not imported/);
  });
});
