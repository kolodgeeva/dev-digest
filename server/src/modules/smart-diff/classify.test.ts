import { describe, it, expect } from 'vitest';
import { classifyFile, buildSmartDiff } from './classify.js';
import type { SmartDiffInputFile, SmartDiffInputFinding } from './classify.js';

describe('classifyFile', () => {
  it('routes lock-files to boilerplate', () => {
    expect(classifyFile('package-lock.json')).toBe('boilerplate');
    expect(classifyFile('apps/web/pnpm-lock.yaml')).toBe('boilerplate');
    expect(classifyFile('yarn.lock')).toBe('boilerplate');
  });

  it('routes dist / snapshots / minified to boilerplate', () => {
    expect(classifyFile('dist/index.js')).toBe('boilerplate');
    expect(classifyFile('src/__snapshots__/App.test.tsx.snap')).toBe('boilerplate');
    expect(classifyFile('public/app.min.css')).toBe('boilerplate');
  });

  it('routes barrels, configs and infra glue to wiring', () => {
    expect(classifyFile('src/api/public/index.ts')).toBe('wiring');
    expect(classifyFile('vitest.config.ts')).toBe('wiring');
    expect(classifyFile('src/server.ts')).toBe('wiring');
    expect(classifyFile('src/config.ts')).toBe('wiring');
    expect(classifyFile('package.json')).toBe('wiring');
    expect(classifyFile('.github/workflows/ci.yml')).toBe('wiring');
  });

  it('routes everything else to core', () => {
    expect(classifyFile('src/middleware/ratelimit.ts')).toBe('core');
    expect(classifyFile('src/api/public/webhooks.ts')).toBe('core');
    expect(classifyFile('src/users/service.ts')).toBe('core');
  });
});

describe('buildSmartDiff', () => {
  const files: SmartDiffInputFile[] = [
    { path: 'src/middleware/ratelimit.ts', additions: 84, deletions: 0 },
    { path: 'src/api/public/webhooks.ts', additions: 31, deletions: 6 },
    { path: 'src/api/public/index.ts', additions: 12, deletions: 2 },
    { path: 'src/config.ts', additions: 4, deletions: 0 },
    { path: 'package-lock.json', additions: 92, deletions: 24 },
    { path: 'package.json', additions: 3, deletions: 1 },
  ];

  it('groups files by role and omits empty groups, in core→wiring→boilerplate order', () => {
    const sd = buildSmartDiff(files, []);
    expect(sd.groups.map((g) => g.role)).toEqual(['core', 'wiring', 'boilerplate']);
    const boilerplate = sd.groups.find((g) => g.role === 'boilerplate')!;
    expect(boilerplate.files.map((f) => f.path)).toContain('package-lock.json');
  });

  it('maps findings to ascending unique finding_lines per file', () => {
    const findings: SmartDiffInputFinding[] = [
      { file: 'src/api/public/webhooks.ts', start_line: 73 },
      { file: 'src/api/public/webhooks.ts', start_line: 61 },
      { file: 'src/api/public/webhooks.ts', start_line: 61 },
      { file: 'src/config.ts', start_line: 12 },
    ];
    const sd = buildSmartDiff(files, findings);
    const all = sd.groups.flatMap((g) => g.files);
    expect(all.find((f) => f.path === 'src/api/public/webhooks.ts')!.finding_lines).toEqual([
      61, 73,
    ]);
    expect(all.find((f) => f.path === 'src/config.ts')!.finding_lines).toEqual([12]);
    expect(all.find((f) => f.path === 'src/middleware/ratelimit.ts')!.finding_lines).toEqual([]);
  });

  it('sorts within a group by finding count, then diff size', () => {
    const findings: SmartDiffInputFinding[] = [
      { file: 'src/api/public/webhooks.ts', start_line: 61 },
      { file: 'src/api/public/webhooks.ts', start_line: 73 },
    ];
    const sd = buildSmartDiff(files, findings);
    const core = sd.groups.find((g) => g.role === 'core')!;
    // webhooks has 2 findings → it leads despite ratelimit's larger diff.
    expect(core.files[0]!.path).toBe('src/api/public/webhooks.ts');
  });

  it('does not flag a small PR as too_big', () => {
    const sd = buildSmartDiff(files, []);
    expect(sd.split_suggestion.too_big).toBe(false);
    // core + wiring lines only; the lock-file (boilerplate) is excluded.
    expect(sd.split_suggestion.total_lines).toBe(84 + 31 + 6 + 12 + 2 + 4 + 3 + 1);
    expect(sd.split_suggestion.proposed_splits).toEqual([]);
  });

  it('flags a large multi-directory PR as too_big with per-dir splits', () => {
    const big: SmartDiffInputFile[] = [
      { path: 'src/billing/charge.ts', additions: 300, deletions: 0 },
      { path: 'src/auth/login.ts', additions: 250, deletions: 0 },
    ];
    const sd = buildSmartDiff(big, []);
    expect(sd.split_suggestion.too_big).toBe(true);
    expect(sd.split_suggestion.total_lines).toBe(550);
    expect(sd.split_suggestion.proposed_splits.map((s) => s.name).sort()).toEqual([
      'src/auth',
      'src/billing',
    ]);
  });
});
