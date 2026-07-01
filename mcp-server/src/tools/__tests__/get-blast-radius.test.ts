import { describe, it, expect } from 'vitest';
import { getBlastRadiusHandler } from '../get-blast-radius.js';
import { makeDeps, blast } from './fixtures.js';
import { ApiError } from '../../errors.js';

describe('get_blast_radius', () => {
  it('maps a normal blast result to status:ok with the correct shape', async () => {
    const res = await getBlastRadiusHandler(makeDeps())({ repo: 'acme/api', pr: 7 });

    expect(res.isError).toBeFalsy();
    const content = res.structuredContent as Record<string, unknown>;
    expect(content.status).toBe('ok');
    expect(content.repo).toBe('acme/api');
    expect(content.pr).toBe(7);
    expect(content.summary).toBe(
      '2 symbols changed · 2 downstream callers across 2 files · 2 endpoints impacted',
    );
    expect(content.changed_symbols).toEqual(blast().changed_symbols);
    expect(content.downstream).toEqual(blast().downstream);
    // impacted_endpoints is the de-duplicated union across all downstream[].endpoints_affected
    const endpoints = content.impacted_endpoints as string[];
    expect(endpoints).toEqual(expect.arrayContaining(['GET /profile', 'GET /admin/users']));
    expect(endpoints.length).toBe(2);
    expect(content.degraded).toBe(false);
    expect(content.reason).toBeNull();
  });

  it('sets status:degraded when the blast fixture has degraded:true', async () => {
    const deps = makeDeps({
      getBlastRadius: async () => blast({ degraded: true, reason: 'index incomplete' }),
    });
    const res = await getBlastRadiusHandler(deps)({ repo: 'acme/api', pr: 7 });

    expect(res.isError).toBeFalsy();
    const content = res.structuredContent as Record<string, unknown>;
    expect(content.status).toBe('degraded');
    expect(content.degraded).toBe(true);
    expect(content.reason).toBe('index incomplete');
  });

  it('returns isError with the actionable message when the dep throws ApiError(404)', async () => {
    const deps = makeDeps({
      getBlastRadius: async () => {
        throw new ApiError(404, 'Pull request not found');
      },
    });
    const res = await getBlastRadiusHandler(deps)({ repo: 'acme/api', pr: 9999 });

    expect(res.isError).toBe(true);
    const text = (res.content as Array<{ text: string }>)[0]?.text ?? '';
    expect(text).toContain('Pull request not found');
  });
});
