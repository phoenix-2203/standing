import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// `npm run test:live`: runs src/**/*.live.ts against the real PayPal sandbox using .env.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: { environment: "node", include: ["src/**/*.live.ts"], env: loadEnv("", process.cwd(), "PAYPAL_"), testTimeout: 120_000 },
});
