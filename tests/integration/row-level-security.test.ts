import { createHmac } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, db } from "./direct-db";
import { appSecrets, documentBlobs, documents, hostInvitations, identityRequests, passwordResetTokens, sessions, stripeEvents, spotVehicleApprovals } from "@/db/schema";
import { LOCAL_JWT_SECRET } from "../../scripts/postgrest.mjs";
import { TEST_API_PORT } from "../support/env";
import { hoursFromNow, makeBookableSpot, makeConfirmedBooking, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(async () => {
  await closeDb();
});

const API = `http://localhost:${TEST_API_PORT}`;

/** A signed-in Supabase user's token (role "authenticated"), as the public client would send it. */
function authenticatedToken() {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ role: "authenticated", sub: "00000000-0000-0000-0000-000000000001" })}`;
  return `${body}.${createHmac("sha256", LOCAL_JWT_SECRET).update(body).digest("base64url")}`;
}
const CALLERS: [string, Record<string, string>][] = [
  ["anonymous", {}],
  ["authenticated", { Authorization: `Bearer ${authenticatedToken()}` }],
];

async function relations(kinds: string[]) {
  const rows = await db.execute<{ name: string; rls: boolean }>(sql`
    select c.relname as name, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = any(${`{${kinds.join(",")}}`}::"char"[]) order by 1`);
  return rows.map((r) => ({ name: r.name, rls: r.rls }));
}

/** At least one row in every table, so an empty answer means something. */
async function seedEverything() {
  const { spotId, host, account } = await makeBookableSpot();
  const driver = await makeUser("Dora Förare");
  await makeConfirmedBooking(spotId, driver.id, hoursFromNow(24), hoursFromNow(26));
  await db.insert(documentBlobs).values({ storageKey: "2026-10/x.pdf", bytes: Buffer.from("%PDF-1.4") });
  await db.insert(documents).values({
    hostAccountId: account.id, spotId, uploadedBy: host.id, kind: "ownership_proof", filename: "x.pdf", mimeType: "application/pdf", sizeBytes: 8, storageKey: "2026-10/x.pdf",
  });
  const later = new Date(Date.now() + 3600_000);
  await db.insert(sessions).values({ id: "session-hash", userId: driver.id, expiresAt: later });
  await db.insert(passwordResetTokens).values({ id: "reset-hash", userId: driver.id, expiresAt: later });
  await db.insert(identityRequests).values({ state: "state", userId: host.id, nonce: "n", codeVerifier: "v", next: "/", expiresAt: later });
  await db.insert(hostInvitations).values({ id: "invite-hash", hostAccountId: account.id, email: "ny@example.com", invitedBy: host.id, expiresAt: later });
  await db.insert(appSecrets).values({ name: "cron", value: "the-cron-secret" });
  await db.insert(stripeEvents).values({ id: "evt_test", type: "checkout.session.completed" });
  await db.insert(spotVehicleApprovals).values({ spotId, reg: "ABC123", approvedBy: host.id });
  return { spotId, driver };
}

/** Every row of every table, to compare before and after. */
async function snapshot(tables: string[]) {
  const out: Record<string, unknown[]> = {};
  for (const t of tables) out[t] = await db.execute(sql.raw(`select * from "${t}" order by 1`));
  return out;
}

describe("row-level security", () => {
  it("is enabled on every table, and no policy lets the public API roles in", async () => {
    const tables = await relations(["r", "p"]);
    expect(tables.length).toBeGreaterThanOrEqual(16);
    expect(tables.filter((t) => !t.rls).map((t) => t.name)).toEqual([]);
    const policies = await db.execute<{ tablename: string; policyname: string }>(sql`
      select tablename, policyname from pg_policies
      where schemaname = 'public' and roles && array['anon', 'authenticated', 'public']::name[]`);
    expect([...policies]).toEqual([]);
  });

  it("shows the public API roles no rows of any table or view", async () => {
    await seedEverything();
    const all = await relations(["r", "p", "v", "m"]);
    for (const { name } of await relations(["r", "p"])) {
      const [{ n }] = await db.execute<{ n: number }>(sql.raw(`select count(*)::int as n from "${name}"`));
      expect(n, `${name} should have test data`).toBeGreaterThan(0);
    }
    for (const [who, headers] of CALLERS) {
      for (const { name } of all) {
        const res = await fetch(`${API}/${name}?select=*`, { headers });
        const body = await res.text();
        const refused = res.status === 401 || res.status === 403;
        const empty = res.status === 200 && body === "[]";
        expect(refused || empty, `${who} GET ${name}: ${res.status} ${body.slice(0, 200)}`).toBe(true);
      }
    }
  });

  it("refuses anonymous and authenticated writes, and nothing changes", async () => {
    const { spotId, driver } = await seedEverything();
    const tables = (await relations(["r", "p"])).map((t) => t.name);
    const before = await snapshot(tables);

    const inserts: [string, object][] = [
      ["users", { email: "inkräktare@example.com", name: "X", password_hash: "x", is_admin: true }],
      ["sessions", { id: "stolen", user_id: driver.id, expires_at: new Date(Date.now() + 3600_000).toISOString() }],
      ["app_secrets", { name: "evil", value: "x" }],
      ["mail_outbox", { to: "a@b.se", subject: "s", text: "t" }],
    ];
    const updates: [string, string, object][] = [
      ["users", "id=not.is.null", { is_admin: true }],
      ["spots", `id=eq.${spotId}`, { price_per_hour_ore: 1 }],
      ["bookings", "id=not.is.null", { status: "cancelled" }],
      ["app_secrets", "name=eq.cron", { value: "known" }],
    ];
    for (const [who, auth] of CALLERS) {
      const headers = { ...auth, "content-type": "application/json", prefer: "return=representation" };
      for (const [table, row] of inserts) {
        const res = await fetch(`${API}/${table}`, { method: "POST", headers, body: JSON.stringify(row) });
        expect([401, 403], `${who} POST ${table}`).toContain(res.status);
        expect(await res.json(), `${who} POST ${table}`).toMatchObject({ code: "42501" });
      }
      for (const [table, filter, patch] of updates) {
        const res = await fetch(`${API}/${table}?${filter}`, { method: "PATCH", headers, body: JSON.stringify(patch) });
        expect([res.status, await res.json()], `${who} PATCH ${table}`).toEqual([200, []]);
      }
      for (const table of ["users", "spots", "bookings", "sessions", "app_secrets"]) {
        const res = await fetch(`${API}/${table}?${table === "app_secrets" ? "name" : "id"}=not.is.null`, { method: "DELETE", headers });
        expect([res.status, await res.json()], `${who} DELETE ${table}`).toEqual([200, []]);
      }
    }
    expect(await snapshot(tables)).toEqual(before);
  });
});
