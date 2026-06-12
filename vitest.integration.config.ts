import { defineConfig } from "vitest/config";

/**
 * Integration test config: runs against the real swimclub_test Postgres
 * database. Files run sequentially because they share one database.
 *   npm run test:integration
 */
export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    globalSetup: ["tests/integration/globalSetup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000
  }
});
