/**
 * Demo data for local development. Run with `npm run db:seed`.
 * Wipes all data first (but for admins with a real address, see
 * src/server/demo-data.ts) — never point this at production. On the demo
 * deployment an admin does the same with "Återställ testdata" (/admin/testdata).
 *
 * The data goes in the way the app writes it, through the HTTP API, so the
 * seed starts its own PostgREST for DATABASE_URL (scripts/postgrest.mjs).
 */
import { freePort, localServiceKey, startPostgrest } from "./postgrest.mjs";

if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed in production");

const databaseUrl = process.env.DATABASE_URL ?? "postgres://parklet:parklet@localhost:5432/parklet";

// The app's data layer talks to this PostgREST only (never to one from .env, which may
// serve another database).
const apiPort = await freePort();
const postgrest = await startPostgrest({ databaseUrl, port: apiPort });
process.env.SUPABASE_REST_URL = `http://localhost:${apiPort}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = localServiceKey();
delete process.env.SUPABASE_SECRET_KEY;
// Documents go to local files, whatever .env says.
delete process.env.DOCUMENT_STORAGE;

try {
  // Imported after the environment is set: the data layer reads it on first use.
  const { DEMO_PASSWORD, DEMO_USERS, resetDemoData } = await import("@/server/demo-data");

  // SEED_PASSWORD=random gives every demo account a throwaway random password
  // (for public deployments: nobody can log in as them; an admin can still take
  // one over with "Glömt lösenord" and the e-mail outbox).
  const password =
    process.env.SEED_PASSWORD === "random"
      ? (await import("node:crypto")).randomBytes(24).toString("base64url")
      : (process.env.SEED_PASSWORD ?? DEMO_PASSWORD);
  const result = await resetDemoData({ password });

  const width = Math.max(...DEMO_USERS.map((u) => u.email.length)) + 2;
  console.log(`Seeded ${result.created.spots} spots and ${result.created.bookings} bookings${result.keptAdmins ? `, kept ${result.keptAdmins} admin(s) with a real address` : ""}.
All demo users have the password "${process.env.SEED_PASSWORD ? "(not shown)" : password}":
${DEMO_USERS.map((u) => `  ${u.email.padEnd(width)}${u.role}`).join("\n")}`);
} finally {
  postgrest.kill();
}
