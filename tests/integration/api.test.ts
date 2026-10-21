import { readdirSync, readFileSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { closeDb, db } from "./direct-db";
import { availabilityWindows, bookings, hostAccounts, passwordResetTokens, sessions, spots, users } from "@/db/schema";
import { rpc } from "@/db/api";
import { hashToken } from "@/lib/auth/tokens";
import { searchAccounts, searchSpots as adminSearchSpots } from "@/server/admin-search";
import { acceptInvitation, createHostAccount, getAccountForMember, inviteAdmin } from "@/server/host-accounts";
import { searchSpots } from "@/server/search";
import { createSpots, getSpot, listAccountSpots, requestLandlordApproval, respondToLandlordApproval, updateSpot } from "@/server/spots";
import { makeBookableSpot, makeUser, resetDb, spotInput } from "./helpers";
import { TEST_API_PORT } from "../support/env";

beforeEach(resetDb);
afterAll(async () => {
  await closeDb();
});

const API = `http://localhost:${TEST_API_PORT}`;
const MIGRATIONS = "src/db/migrations";
/** Every function any migration creates in the public schema. */
const FUNCTIONS = [
  ...new Set(
    readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql"))
      .flatMap((f) => [...readFileSync(`${MIGRATIONS}/${f}`, "utf8").matchAll(/CREATE (?:OR REPLACE )?FUNCTION public\.(\w+)/gi)].map((m) => m[1])),
  ),
];

async function household(name = "Värd") {
  const owner = await makeUser(name);
  const accountId = await createHostAccount({ userId: owner.id, kind: "household", name, orgNumber: null, signatoryRole: null, identityVerified: true });
  return { owner, accountId };
}

describe("the API's security", () => {
  it("found the functions of the migration", () => {
    expect(FUNCTIONS.length).toBeGreaterThanOrEqual(10);
  });

  it("lets only service_role run Parklet's functions", async () => {
    const rows = await db.execute<{ fn: string; anon: boolean; authenticated: boolean; service: boolean; public_: boolean }>(sql`
      select p.oid::regprocedure::text as fn,
        has_function_privilege('anon', p.oid, 'execute') as anon,
        has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
        has_function_privilege('service_role', p.oid, 'execute') as service,
        exists (select from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'parklet\\_%'`);
    expect(rows.map((r) => r.fn.split("(")[0]).sort()).toEqual([...FUNCTIONS].sort());
    for (const r of rows) expect(r, r.fn).toMatchObject({ anon: false, authenticated: false, service: true, public_: false });
  });

  it("refuses anonymous calls to every function, with all its arguments given", async () => {
    const rows = await db.execute<{ fn: string; args: string[] }>(sql`
      select p.proname as fn,
        -- Input arguments only (a function returning a table also names its columns here).
        array(select name from unnest(p.proargnames, coalesce(p.proargmodes, array_fill('i'::"char", array[cardinality(p.proargnames)]))) as t(name, mode)
              where mode in ('i', 'b', 'v')) as args
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'parklet\\_%'`);
    expect(rows).toHaveLength(FUNCTIONS.length);
    for (const { fn, args } of rows) {
      const body = JSON.stringify(Object.fromEntries((args ?? []).map((a) => [a, null])));
      const res = await fetch(`${API}/rpc/${fn}`, { method: "POST", headers: { "content-type": "application/json" }, body });
      // Found (all arguments matched) but not allowed.
      expect([401, 403], `${fn} answered ${res.status}`).toContain(res.status);
    }
  });

});

describe("spots through the API", () => {
  it("creates numbered spots with their opening hours in one step", async () => {
    const { owner, accountId } = await household();
    const ids = await createSpots(accountId, owner.id, spotInput(), 3);
    expect(ids).toHaveLength(3);
    const spot = await getSpot(ids[2]);
    expect(spot?.title).toBe("Uppfart – Plats 3");
    expect(spot?.landlordApproval).toBe("not_needed");
    expect(spot?.createdAt).toBeInstanceOf(Date);
    // Weekdays, daytime: five windows each.
    expect(spot?.windows.map((w) => w.weekday)).toEqual([1, 2, 3, 4, 5]);
    const counts = await db.select({ n: sql<number>`count(*)::int` }).from(availabilityWindows);
    expect(counts[0].n).toBe(15);
  });

  it("creates nothing when one of the spots is invalid", async () => {
    const { owner, accountId } = await household();
    await expect(createSpots(accountId, owner.id, spotInput({ pricePerHourOre: -1 }), 2)).rejects.toThrow();
    expect(await db.select().from(spots)).toHaveLength(0);
    expect(await db.select().from(availabilityWindows)).toHaveLength(0);
  });

  it("updates a spot and replaces its opening hours; moving an approved spot sends it back to review", async () => {
    const { account, spotId } = await makeBookableSpot();
    const ok = await updateSpot(account.id, spotId, spotInput({ address: "Nya gatan 2", schedule: { mode: "eveningsWeekends" } }));
    expect(ok).toBe(true);
    const spot = await getSpot(spotId);
    expect(spot?.address).toBe("Nya gatan 2");
    expect(spot?.review).toBe("pending_review");
    expect(spot?.windows.length).toBeGreaterThan(0);
    // Evenings and weekends now, so Saturday and Sunday are open (ISO weekdays 6 and 7).
    expect(spot?.windows.map((w) => w.weekday)).toEqual(expect.arrayContaining([6, 7]));
  });

  it("does not update another account's spot", async () => {
    const { spotId } = await makeBookableSpot();
    const other = await household("Annan");
    expect(await updateSpot(other.accountId, spotId, spotInput({ title: "Kapad" }))).toBe(false);
    expect((await getSpot(spotId))?.title).toBe("Testplats");
  });

  it("counts upcoming bookings and earnings per spot", async () => {
    const { account, spotId } = await makeBookableSpot();
    const driver = await makeUser();
    const start = new Date(Date.now() + 24 * 3600_000);
    await db.insert(bookings).values({
      spotId,
      driverId: driver.id,
      startsAt: start,
      endsAt: new Date(start.getTime() + 3600_000),
      status: "confirmed",
      vehicleReg: "ABC123",
      baseOre: 2000,
      feeOre: 300,
      totalOre: 2300,
      paymentProvider: "mock",
    });
    const [summary] = await listAccountSpots(account.id);
    expect(summary).toMatchObject({ id: spotId, upcomingBookings: 1, earnedOre: 2000 });
  });

  it("takes the landlord's answer once", async () => {
    const { owner, accountId } = await household();
    const [spotId] = await createSpots(accountId, owner.id, spotInput({ rightBasis: "rents", landlordKind: "brf", landlordEmail: "brf@example.com" }));
    expect(await requestLandlordApproval(accountId, spotId, owner.name)).toEqual({ ok: true });
    const [{ token }] = await db.execute<{ token: string }>(
      sql`select substring(text from '/godkannande/([A-Za-z0-9_-]+)') as token from mail_outbox where "to" = 'brf@example.com' order by id desc limit 1`,
    );
    const answer = { approve: true, name: "Lena", role: "Ordförande", requiresVehicleRegistration: true, vehicleRegistrationNote: "Appen" };
    expect(await respondToLandlordApproval(token, answer)).toEqual({ ok: true });
    expect(await respondToLandlordApproval(token, { ...answer, approve: false })).toMatchObject({ ok: false });
    const spot = await getSpot(spotId);
    expect(spot).toMatchObject({ landlordApproval: "approved", landlordApprovedByName: "Lena", requiresVehicleRegistration: true });
  });
});

describe("host accounts through the API", () => {
  it("creates an account with its owner, and invitations are accepted once by the invited address", async () => {
    const { owner, accountId } = await household("Brf Test");
    const account = await getAccountForMember(accountId, owner.id);
    expect(account).toMatchObject({ id: accountId, role: "owner", verificationStatus: "verified" });

    const invitee = await makeUser("Inbjuden");
    const stranger = await makeUser("Okänd");
    await inviteAdmin(account!, { id: owner.id, name: owner.name }, invitee.email);
    const [{ token }] = await db.execute<{ token: string }>(
      sql`select substring(text from '/inbjudan/([A-Za-z0-9_-]+)') as token from mail_outbox where "to" = ${invitee.email} order by id desc limit 1`,
    );
    expect(await acceptInvitation(token, stranger)).toMatchObject({ ok: false });
    expect(await acceptInvitation(token, invitee)).toEqual({ ok: true, accountId });
    expect(await acceptInvitation(token, invitee)).toMatchObject({ ok: false });
    expect(await getAccountForMember(accountId, invitee.id)).toMatchObject({ role: "admin" });
    expect(await getAccountForMember(accountId, stranger.id)).toBeNull();
  });
});

describe("the admins' digest through the API", () => {
  it("counts in the database", async () => {
    const { spotId } = await makeBookableSpot();
    await db.update(spots).set({ review: "pending_review", submittedAt: new Date(Date.now() - 3600_000) }).where(eq(spots.id, spotId));
    const driver = await makeUser();
    for (const [i, total] of [1500, 2500].entries()) {
      const start = new Date(Date.now() + (24 + i * 3) * 3600_000);
      await db.insert(bookings).values({
        spotId, driverId: driver.id, startsAt: start, endsAt: new Date(start.getTime() + 3600_000), status: "confirmed",
        vehicleReg: "ABC123", baseOre: total, feeOre: 0, totalOre: total, paymentProvider: "mock", confirmedAt: new Date(),
      });
    }
    const d = await rpc<Record<string, unknown>>("parklet_admin_digest", { p_since: new Date(Date.now() - 24 * 3600_000).toISOString() });
    expect(d).toMatchObject({ pending_spot_count: 1, pending_account_count: 0, booked: 2, booked_ore: 4000, new_spots: 1, new_users: 2 });
    expect(d.pending_spots).toEqual([{ id: spotId, title: "Testplats" }]);
  });
});

describe("password reset through the API", () => {
  it("uses a token once, sets the password and signs out everywhere", async () => {
    const user = await makeUser();
    await db.insert(sessions).values({ id: hashToken("session"), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) });
    await db.insert(passwordResetTokens).values({ id: hashToken("reset"), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) });
    await db.insert(passwordResetTokens).values({ id: hashToken("old"), userId: user.id, expiresAt: new Date(Date.now() - 1000) });

    expect(await rpc("parklet_reset_password", { p_token_id: hashToken("old"), p_password_hash: "new" })).toBeNull();
    expect(await rpc("parklet_reset_password", { p_token_id: hashToken("reset"), p_password_hash: "new" })).toBe(user.id);
    expect(await rpc("parklet_reset_password", { p_token_id: hashToken("reset"), p_password_hash: "again" })).toBeNull();
    const [row] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, user.id));
    expect(row.hash).toBe("new");
    expect(await db.select().from(sessions).where(eq(sessions.userId, user.id))).toHaveLength(0);
  });
});

describe("search through the API", () => {
  it("checks opening hours and bookings for every candidate, however many there are", async () => {
    // 150 spots open around the clock (1050 opening-hour rows, more than PostgREST returns
    // from a table at once) around the corner, and the nearest one, created last.
    const { owner, accountId } = await household();
    const far = await createSpots(accountId, owner.id, spotInput({ lat: 57.71, schedule: { mode: "always" } }), 150);
    const [near] = await createSpots(accountId, owner.id, spotInput({ title: "Närmast", schedule: { mode: "always" } }));
    await db.update(spots).set({ review: "approved" });
    await db.update(hostAccounts).set({ payoutStatus: "active" });
    // One of the far ones is taken in the period.
    const driver = await makeUser();
    const start = new Date(Math.ceil((Date.now() + 48 * 3600_000) / 3600_000) * 3600_000);
    const end = new Date(start.getTime() + 2 * 3600_000);
    await db.insert(bookings).values({
      spotId: far[0], driverId: driver.id, startsAt: start, endsAt: end, status: "confirmed",
      vehicleReg: "ABC123", baseOre: 0, feeOre: 0, totalOre: 0, paymentProvider: "mock",
    });

    const all = await rpc<{ windows: unknown[]; busy: string[] }>("parklet_search_availability", {
      p_spot_ids: [...far, near],
      p_start: start.toISOString(),
      p_end: end.toISOString(),
    });
    expect(all.windows).toHaveLength(151 * 7);
    expect(all.busy).toEqual([far[0]]);

    const { results } = await searchSpots({ center: { lat: 57.7, lng: 11.97 }, start, end });
    expect(results[0].id).toBe(near);
    expect(results.map((r) => r.id)).not.toContain(far[0]);
  });

  it("gives admins every spot and account with filters and counts", async () => {
    const { spotId, account } = await makeBookableSpot();
    const { owner, accountId } = await household("Utkast Ek");
    await createSpots(accountId, owner.id, spotInput({ title: "Utkastplats", city: "Malmö" }));

    const all = await adminSearchSpots({});
    expect(all.total).toBe(2);
    expect(all.byReview).toMatchObject({ approved: 1, draft: 1 });
    expect(all.cities.map((c) => c.city).sort()).toEqual(["Göteborg", "Malmö"]);
    const approved = all.rows.find((r) => r.id === spotId);
    expect(approved).toMatchObject({ accountId: account.id, bookable: true, notBookable: null, upcoming: 0 });
    expect(approved?.updatedAt).toBeInstanceOf(Date);

    expect((await adminSearchSpots({ city: "Malmö" })).rows.map((r) => r.title)).toEqual(["Utkastplats"]);
    expect((await adminSearchSpots({ bookable: "yes" })).rows.map((r) => r.id)).toEqual([spotId]);
    expect((await adminSearchSpots({ q: spotId.slice(0, 8) })).rows.map((r) => r.id)).toEqual([spotId]);
    // A word without hex letters is not taken as an id prefix.
    expect((await adminSearchSpots({ q: "Utkast" })).total).toBe(1);

    const accounts = await searchAccounts({ q: "Utkast" });
    expect(accounts.total).toBe(1);
    expect(accounts.rows[0]).toMatchObject({ spots: 1, approved: 0, owner: { name: "Utkast Ek", verified: true } });
    expect(accounts.rows[0].account.createdAt).toBeInstanceOf(Date);
    expect((await searchAccounts({})).byVerification).toMatchObject({ verified: 2 });
  });
});
