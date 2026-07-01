import { describe, it, expect } from 'vitest';
import { toBlastResponse } from './helpers.js';
import type { BlastResult } from '../repo-intel/types.js';

/**
 * Unit tests for toBlastResponse — pure mapper, no I/O.
 *
 * Covers:
 *   - Grouping callers by changed symbol (viaSymbol matching).
 *   - Endpoint/cron attribution from factsByFile (persistent path).
 *   - Degraded fallback: no factsByFile → impactedEndpoints used, crons empty.
 *   - Deterministic summary string.
 *   - degraded/reason passthrough.
 */

const makeResult = (overrides: Partial<BlastResult> = {}): BlastResult => ({
  changedSymbols: [
    { file: 'src/auth.ts', name: 'verifyToken', kind: 'function' },
    { file: 'src/users.ts', name: 'getUser', kind: 'function' },
  ],
  callers: [
    { file: 'src/routes/login.ts', symbol: 'handleLogin', viaSymbol: 'verifyToken', line: 42, rank: 1 },
    { file: 'src/routes/profile.ts', symbol: 'getProfile', viaSymbol: 'verifyToken', line: 17, rank: 2 },
    { file: 'src/services/account.ts', symbol: 'getAccount', viaSymbol: 'getUser', line: 8, rank: 1 },
  ],
  impactedEndpoints: ['POST /api/login', 'GET /api/profile'],
  factsByFile: {
    'src/routes/login.ts': { endpoints: ['POST /api/login'], crons: [] },
    'src/routes/profile.ts': { endpoints: ['GET /api/profile'], crons: ['0 * * * * /cron/refresh'] },
    'src/services/account.ts': { endpoints: [], crons: [] },
  },
  ...overrides,
});

describe('toBlastResponse', () => {
  it('maps changed_symbols directly', () => {
    const result = makeResult();
    const response = toBlastResponse(result);

    expect(response.changed_symbols).toEqual([
      { name: 'verifyToken', file: 'src/auth.ts', kind: 'function' },
      { name: 'getUser', file: 'src/users.ts', kind: 'function' },
    ]);
  });

  it('groups callers by changed symbol (viaSymbol)', () => {
    const result = makeResult();
    const response = toBlastResponse(result);

    const verifyTokenDownstream = response.downstream.find((d) => d.symbol === 'verifyToken');
    expect(verifyTokenDownstream).toBeDefined();
    expect(verifyTokenDownstream!.callers).toHaveLength(2);
    expect(verifyTokenDownstream!.callers.map((c) => c.name)).toEqual(['handleLogin', 'getProfile']);

    const getUserDownstream = response.downstream.find((d) => d.symbol === 'getUser');
    expect(getUserDownstream).toBeDefined();
    expect(getUserDownstream!.callers).toHaveLength(1);
    expect(getUserDownstream!.callers[0]!.name).toBe('getAccount');
  });

  it('maps caller properties (name, file, line)', () => {
    const result = makeResult();
    const response = toBlastResponse(result);

    const verifyTokenDownstream = response.downstream.find((d) => d.symbol === 'verifyToken')!;
    const loginCaller = verifyTokenDownstream.callers.find((c) => c.name === 'handleLogin')!;
    expect(loginCaller.file).toBe('src/routes/login.ts');
    expect(loginCaller.line).toBe(42);
  });

  it('attributes endpoints/crons from factsByFile (persistent path)', () => {
    const result = makeResult();
    const response = toBlastResponse(result);

    const verifyTokenDownstream = response.downstream.find((d) => d.symbol === 'verifyToken')!;
    // verifyToken callers are in login.ts and profile.ts
    expect(verifyTokenDownstream.endpoints_affected).toContain('POST /api/login');
    expect(verifyTokenDownstream.endpoints_affected).toContain('GET /api/profile');
    expect(verifyTokenDownstream.crons_affected).toContain('0 * * * * /cron/refresh');

    const getUserDownstream = response.downstream.find((d) => d.symbol === 'getUser')!;
    // getUser callers are in account.ts which has no endpoints/crons
    expect(getUserDownstream.endpoints_affected).toHaveLength(0);
    expect(getUserDownstream.crons_affected).toHaveLength(0);
  });

  it('de-duplicates endpoints and crons across caller files', () => {
    const result = makeResult({
      factsByFile: {
        'src/routes/login.ts': { endpoints: ['POST /api/login', 'GET /api/shared'], crons: ['shared-cron'] },
        'src/routes/profile.ts': { endpoints: ['GET /api/profile', 'GET /api/shared'], crons: ['shared-cron'] },
        'src/services/account.ts': { endpoints: [], crons: [] },
      },
    });
    const response = toBlastResponse(result);

    const verifyTokenDownstream = response.downstream.find((d) => d.symbol === 'verifyToken')!;
    const uniqueEndpoints = new Set(verifyTokenDownstream.endpoints_affected);
    expect(uniqueEndpoints.size).toBe(verifyTokenDownstream.endpoints_affected.length);
    expect(verifyTokenDownstream.endpoints_affected).toContain('GET /api/shared');

    const uniqueCrons = new Set(verifyTokenDownstream.crons_affected);
    expect(uniqueCrons.size).toBe(verifyTokenDownstream.crons_affected.length);
  });

  describe('degraded fallback (no factsByFile)', () => {
    it('uses impactedEndpoints as best-effort endpoints when factsByFile is absent', () => {
      const result = makeResult({ factsByFile: undefined });
      const response = toBlastResponse(result);

      // On degraded path, impactedEndpoints are used (at least for first symbol match)
      const verifyTokenDownstream = response.downstream.find((d) => d.symbol === 'verifyToken')!;
      expect(verifyTokenDownstream.endpoints_affected).toContain('POST /api/login');
      expect(verifyTokenDownstream.endpoints_affected).toContain('GET /api/profile');
    });

    it('sets crons_affected to empty array when factsByFile is absent', () => {
      const result = makeResult({ factsByFile: undefined });
      const response = toBlastResponse(result);

      for (const d of response.downstream) {
        expect(d.crons_affected).toEqual([]);
      }
    });
  });

  describe('summary', () => {
    it('produces a deterministic summary string', () => {
      const result = makeResult();
      const response = toBlastResponse(result);

      // 2 symbols, 3 callers across 3 files, 2 endpoints
      expect(response.summary).toBe(
        '2 symbol(s) changed · 3 downstream caller(s) across 3 file(s) · 2 endpoint(s) impacted',
      );
    });

    it('counts unique caller files', () => {
      const result = makeResult({
        callers: [
          { file: 'src/routes/login.ts', symbol: 'handleLogin', viaSymbol: 'verifyToken', line: 42, rank: 1 },
          { file: 'src/routes/login.ts', symbol: 'handleRefresh', viaSymbol: 'verifyToken', line: 55, rank: 1 },
        ],
      });
      const response = toBlastResponse(result);

      // 2 callers but only 1 unique file
      expect(response.summary).toContain('across 1 file(s)');
    });

    it('counts unique impactedEndpoints in summary', () => {
      const result = makeResult({
        impactedEndpoints: ['POST /api/login', 'POST /api/login', 'GET /api/profile'],
      });
      const response = toBlastResponse(result);

      expect(response.summary).toContain('2 endpoint(s) impacted');
    });
  });

  describe('degraded/reason passthrough', () => {
    it('passes through degraded: true', () => {
      const result = makeResult({ degraded: true, reason: 'index_partial' });
      const response = toBlastResponse(result);
      expect(response.degraded).toBe(true);
      expect(response.reason).toBe('index_partial');
    });

    it('defaults degraded to false when absent', () => {
      const result = makeResult({ degraded: undefined, reason: undefined });
      const response = toBlastResponse(result);
      expect(response.degraded).toBe(false);
      expect(response.reason).toBeNull();
    });
  });

  it('produces an empty downstream for a symbol with no callers', () => {
    const result: BlastResult = {
      changedSymbols: [{ file: 'src/isolated.ts', name: 'noCaller', kind: 'function' }],
      callers: [],
      impactedEndpoints: [],
      factsByFile: {},
    };
    const response = toBlastResponse(result);

    expect(response.downstream).toHaveLength(1);
    expect(response.downstream[0]!.callers).toHaveLength(0);
    expect(response.downstream[0]!.endpoints_affected).toHaveLength(0);
  });
});
