import { defineConfig } from "vitest/config";
import path from "node:path";

/** Tests against real external services (`npm run test:live`); see tests/live/. */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/server-only-stub.ts"),
    },
  },
  test: {
    include: ["tests/live/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
  },
});
