import { describe, it, expect } from 'vitest';
import { getBlastRadiusHandler } from '../get-blast-radius.js';
import { makeDeps } from './fixtures.js';

describe('get_blast_radius (stub)', () => {
  it('returns a not_implemented result echoing the ref', async () => {
    const res = await getBlastRadiusHandler(makeDeps())({ repo: 'acme/api', pr: 482 });
    expect(res.isError).toBeFalsy();
    expect(res.structuredContent).toEqual({
      status: 'not_implemented',
      repo: 'acme/api',
      pr: 482,
      message: expect.stringContaining('not implemented'),
      changed_symbols: [],
      callers: [],
      impacted_endpoints: [],
    });
  });
});
