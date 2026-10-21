import { execFileSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const IDP = "http://localhost:3101";
const REGISTRY = "http://localhost:3102";
const API = "http://localhost:3103";
const STRIPE = "http://localhost:3104";
// Shared with e2e/fake-stripe.mjs, which signs its webhooks with it; test-only values.
const STRIPE_KEY = "sk_test_e2e";
const STRIPE_WEBHOOK_SECRET = "whsec_e2e";
// The local API's service key (Playwright can't import the ES module itself).
const SERVICE_KEY = execFileSync(process.execPath, ["scripts/postgrest.mjs", "--print-key"]).toString().trim();
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
  // A committed test.only must not quietly shrink the CI run.
  forbidOnly: Boolean(process.env.CI),
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
  webServer: [
    {
      // Stands in for Idura (BankID over OpenID Connect); see e2e/fake-idp.mjs.
      command: `node e2e/fake-idp.mjs`,
      url: `${IDP}/.well-known/openid-configuration`,
      reuseExistingServer: !process.env.CI,
    },
    {
      // Stands in for Bolagsverket's free company register API; see e2e/fake-bolagsverket.mjs.
      command: `node e2e/fake-bolagsverket.mjs`,
      url: `${REGISTRY}/health`,
      reuseExistingServer: !process.env.CI,
    },
    {
      // Stands in for Stripe (Connect, Checkout, refunds) and delivers signed webhooks; see e2e/fake-stripe.mjs.
      command: `node e2e/fake-stripe.mjs`,
      url: `${STRIPE}/health`,
      reuseExistingServer: !process.env.CI,
      env: {
        FAKE_STRIPE_PORT: "3104",
        FAKE_STRIPE_API_KEY: STRIPE_KEY,
        FAKE_STRIPE_WEBHOOK_SECRET: STRIPE_WEBHOOK_SECRET,
        FAKE_STRIPE_WEBHOOK_URL: `http://localhost:${PORT}/api/stripe/webhook`,
      },
    },
    {
      // Supabase's HTTP API for the e2e database: the app reaches its data only through it.
      // Starts before global-setup migrates; the last migration tells it to reload.
      command: `node scripts/postgrest.mjs --port 3103`,
      url: `${API}/`,
      reuseExistingServer: !process.env.CI,
      env: { DATABASE_URL: E2E_DB },
    },
    {
      command: `npx next start -p ${PORT}`,
      // Not /api/health: that needs the tables, which global-setup creates after the servers start.
      url: `http://localhost:${PORT}/robots.txt`,
      reuseExistingServer: !process.env.CI,
      env: {
        SUPABASE_REST_URL: API,
        SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
        SUPABASE_SECRET_KEY: "",
        DOCUMENT_STORAGE: "local",
        MAIL_OUTBOX: OUTBOX,
        APP_URL: `http://localhost:${PORT}`,
        GEOCODER_URL: "http://127.0.0.1:9",
        IDURA_ISSUER: IDP,
        IDURA_CLIENT_ID: "parklet-e2e",
        IDURA_CLIENT_SECRET: "e2e-secret",
        // A fixed test-only key (32 zero bytes); production uses its own secret.
        IDENTITY_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
        BOLAGSVERKET_CLIENT_ID: "parklet-e2e",
        BOLAGSVERKET_CLIENT_SECRET: "e2e-secret",
        BOLAGSVERKET_TOKEN_URL: `${REGISTRY}/oauth2/token`,
        BOLAGSVERKET_BASE_URL: `${REGISTRY}/vardefulla-datamangder/v1`,
        // The real Stripe code path, against the fake.
        PAYMENT_PROVIDER: "stripe",
        STRIPE_SECRET_KEY: STRIPE_KEY,
        STRIPE_WEBHOOK_SECRET,
        STRIPE_API_BASE: STRIPE,
        STRIPE_SUPPRESS_NOTICES: "true",
      },
    },
  ],
});
