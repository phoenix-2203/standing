import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  // Each test file starts its own in-process Postgres (PGlite); with many files in parallel that can take >10 s.
  test: { environment: "node", include: ["src/**/*.test.ts"], hookTimeout: 30_000 },
});
