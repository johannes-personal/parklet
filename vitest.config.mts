import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // `server-only` throws outside a React Server environment; it is a no-op in tests.
      "server-only": path.resolve(import.meta.dirname, "tests/server-only-stub.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // Real external services: `npm run test:live` (vitest.live.config.mts).
    exclude: ["tests/live/**", "node_modules/**"],
    environment: "node",
    setupFiles: ["tests/integration/setup.ts"],
    globalSetup: ["tests/support/api-server.ts"],
    // Integration tests share one database.
    fileParallelism: false,
  },
});
