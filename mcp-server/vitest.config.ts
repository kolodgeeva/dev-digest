import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Hermetic unit tests for the MCP tool layer. Tools are tested against fake
 * service deps (no DB, no transport, no network), so the heavy `@server/*`
 * graph is never imported here — only `@devdigest/shared` for the contracts.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@devdigest/shared': fileURLToPath(
        new URL('../server/src/vendor/shared/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
