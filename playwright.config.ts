import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgres://parklet:parklet@localhost:5432/parklet_e2e";
export const OUTBOX = "storage/e2e-outbox.jsonl";

/**
 * End-to-end tests run against a production build (`npm run build` first)
 * and a dedicated database that global-setup migrates and seeds.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "sv-SE",
    timezoneId: "Europe/Stockholm",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], locale: "sv-SE" } },
    { name: "mobile", use: { ...devices["Pixel 7"], locale: "sv-SE" }, testMatch: /smoke\.spec\.ts/ },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    env: { DATABASE_URL: E2E_DB, MAIL_OUTBOX: OUTBOX, APP_URL: `http://localhost:${PORT}`, GEOCODER_URL: "http://127.0.0.1:9" },
  },
});
