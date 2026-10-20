import { readFileSync } from "node:fs";
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
import { makeBookableSpot, makeUser, resetDb } from "./helpers";
import { TEST_API_PORT } from "../support/env";

beforeEach(resetDb);
afterAll(async () => {
  await closeDb();
});

const API = `http://localhost:${TEST_API_PORT}`;
const FUNCTIONS = [...readFileSync("src/db/migrations/0010_http_api.sql", "utf8").matchAll(/CREATE FUNCTION public\.(\w+)/g)].map((m) => m[1]);

async function spotInput(overrides: Record<string, unknown> = {}) {
  return {
    title: "Uppfart",
    description: "",
    address: "Testgatan 1",
    city: "Göteborg",
    lat: 57.7,
    lng: 11.97,
    spotType: "driveway" as const,
    covered: false,
    evCharging: false,
    maxHeightCm: null,
    pricePerHourOre: 2000,
    pricePerDayOre: null,
    minDurationMinutes: 60,
    minNoticeMinutes: 0,
    cancellationHours: 2,
    accessInstructions: "",
    visibility: "public" as const,
    schedule: { mode: "weekdaysDaytime" as const },
    rightBasis: "owns" as const,
    landlordKind: null,
    landlordName: "",
    landlordEmail: "",
    requiresVehicleRegistration: false,
    vehicleRegistrationNote: "",
    ...overrides,
  };
}

async function household(name = "Värd") {
  const owner = await makeUser(name);
  const accountId = await createHostAccount({ userId: owner.id, kind: "household", name, orgNumber: null, signatoryRole: null, identityVerified: true });
  return { owner, accountId };
}

describe("the API's security", () => {
  it("found the functions of the migration", () => {
    expect(FUNCTIONS.length).toBeGreaterThanOrEqual(10);
  });

  it("does not let anonymous callers run any of Parklet's functions", async () => {
    for (const fn of FUNCTIONS) {
      const res = await fetch(`${API}/rpc/${fn}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      // 401/403 permission denied; never 2xx. (A 404 would mean the arguments didn't match: still not run.)
      expect([401, 403, 404], `${fn} answered ${res.status}`).toContain(res.status);
      if (res.status === 404) expect(((await res.json()) as { code: string }).code).toBe("PGRST202");
    }
  });

  it("does not show anonymous callers any rows", async () => {
    await makeBookableSpot();
    for (const table of ["users", "spots", "host_accounts", "sessions"]) {
      const res = await fetch(`${API}/${table}?select=*`);
      expect(res.ok ? await res.json() : []).toEqual([]);
    }
  });
});

describe("spots through the API", () => {
  it("creates numbered spots with their opening hours in one step", async () => {
    const { owner, accountId } = await household();
    const ids = await createSpots(accountId, owner.id, await spotInput(), 3);
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
    await expect(createSpots(accountId, owner.id, await spotInput({ pricePerHourOre: -1 }), 2)).rejects.toThrow();
    expect(await db.select().from(spots)).toHaveLength(0);
    expect(await db.select().from(availabilityWindows)).toHaveLength(0);
  });

  it("updates a spot and replaces its opening hours; moving an approved spot sends it back to review", async () => {
    const { account, spotId } = await makeBookableSpot();
    const ok = await updateSpot(account.id, spotId, await spotInput({ address: "Nya gatan 2", schedule: { mode: "eveningsWeekends" } }));
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
    expect(await updateSpot(other.accountId, spotId, await spotInput({ title: "Kapad" }))).toBe(false);
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
    const [spotId] = await createSpots(accountId, owner.id, await spotInput({ rightBasis: "rents", landlordKind: "brf", landlordEmail: "brf@example.com" }));
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
  it("finds bookable spots only", async () => {
    const { spotId, account } = await makeBookableSpot();
    const center = { lat: 57.7, lng: 11.97 };
    expect((await searchSpots({ center, start: null, end: null })).results.map((r) => r.id)).toEqual([spotId]);
    await db.update(hostAccounts).set({ payoutStatus: "not_connected" }).where(eq(hostAccounts.id, account.id));
    expect((await searchSpots({ center, start: null, end: null })).results).toEqual([]);
  });

  it("gives admins every spot and account with filters and counts", async () => {
    const { spotId, account } = await makeBookableSpot();
    const { owner, accountId } = await household("Utkast Ek");
    await createSpots(accountId, owner.id, await spotInput({ title: "Utkastplats", city: "Malmö" }));

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
