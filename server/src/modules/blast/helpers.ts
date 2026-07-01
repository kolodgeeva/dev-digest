import type { BlastRadius, ChangedSymbol, BlastCaller, DownstreamImpact } from '@devdigest/shared';
import type { BlastResult } from '../repo-intel/types.js';

/**
 * BlastResponse — the inline envelope returned by GET /pulls/:id/blast.
 *
 * Extends the vendored `BlastRadius` contract (do-NOT-touch vendor/) with
 * `degraded` and `reason`, which signal whether the repo-intel index was
 * complete when the blast was computed.
 */
export type BlastResponse = BlastRadius & {
  degraded: boolean;
  reason: string | null;
};

/**
 * toBlastResponse — pure mapper from the engine's BlastResult to the API
 * response envelope.
 *
 * No I/O, no side effects — purely functional so it can be unit-tested without
 * any infrastructure setup.
 */
export function toBlastResponse(result: BlastResult): BlastResponse {
  // 1. changed_symbols: direct mapping.
  const changed_symbols: ChangedSymbol[] = result.changedSymbols.map((s) => ({
    name: s.name,
    file: s.file,
    kind: s.kind,
  }));

  // 2. downstream: group callers by the changed symbol they reach (viaSymbol).
  const downstream: DownstreamImpact[] = result.changedSymbols.map((sym) => {
    // All callers that reach this changed symbol.
    const symbolCallers = result.callers.filter((c) => c.viaSymbol === sym.name);

    const callers: BlastCaller[] = symbolCallers.map((c) => ({
      name: c.symbol,
      file: c.file,
      line: c.line,
    }));

    // Unique caller files for this symbol.
    const callerFiles = [...new Set(symbolCallers.map((c) => c.file))];

    let endpoints_affected: string[];
    let crons_affected: string[];

    if (result.factsByFile) {
      // Persistent path: attribute per-caller-file facts.
      const endpointsSet = new Set<string>();
      const cronsSet = new Set<string>();
      for (const file of callerFiles) {
        const facts = result.factsByFile[file];
        if (facts) {
          for (const ep of facts.endpoints) endpointsSet.add(ep);
          for (const cron of facts.crons) cronsSet.add(cron);
        }
      }
      endpoints_affected = [...endpointsSet];
      crons_affected = [...cronsSet];
    } else {
      // Degraded path: no factsByFile, so we can't attribute endpoints to a
      // specific caller file. Best-effort — attach the flat impactedEndpoints
      // union to every changed symbol (the `degraded` flag tells the UI this is
      // imprecise). No cron data is available on this path.
      endpoints_affected = [...new Set(result.impactedEndpoints)];
      crons_affected = [];
    }

    return {
      symbol: sym.name,
      callers,
      endpoints_affected,
      crons_affected,
    };
  });

  // 3. summary: deterministic string — no LLM.
  const nSymbols = result.changedSymbols.length;
  const nCallers = result.callers.length;
  const nFiles = new Set(result.callers.map((c) => c.file)).size;
  const nEndpoints = new Set(result.impactedEndpoints).size;
  const summary = `${nSymbols} symbol(s) changed · ${nCallers} downstream caller(s) across ${nFiles} file(s) · ${nEndpoints} endpoint(s) impacted`;

  return {
    changed_symbols,
    downstream,
    summary,
    degraded: result.degraded ?? false,
    reason: result.reason ?? null,
  };
}
