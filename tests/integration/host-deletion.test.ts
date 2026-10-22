import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { bookings, documents, hostAccountMembers, hostAccounts, hostInvitations, spots, spotVehicleApprovals } from "@/db/schema";
import { searchAccounts, searchSpots as adminSearchSpots } from "@/server/admin-search";
import { listAccountsForUser } from "@/server/host-accounts";
import { deleteHostAccount, deleteSpot } from "@/server/host-deletion";
import { createSpots, getSpot } from "@/server/spots";
import { closeDb, db } from "./direct-db";
import { hoursFromNow, makeBookableSpot, makeConfirmedBooking, makeHost, makeUser, resetDb, spotInput } from "./helpers";

beforeEach(resetDb);
afterAll(async () => {
  await closeDb();
});

const spotRow = async (id: string) => (await db.select().from(spots).where(eq(spots.id, id)))[0];
const accountRow = async (id: string) => (await db.select().from(hostAccounts).where(eq(hostAccounts.id, id)))[0];
/** Moves a booking into the past. */
const happened = (id: string) => db.update(bookings).set({ startsAt: hoursFromNow(-30), endsAt: hoursFromNow(-28) }).where(eq(bookings.id, id));

describe("deleting a parking space", () => {
  it("removes a draft outright, with its documents", async () => {
    const { host, account } = await makeHost();
    const [draft] = await createSpots(account.id, host.id, spotInput({ title: "Utkast" }));
    await db.insert(documents).values({ hostAccountId: account.id, spotId: draft, uploadedBy: host.id, kind: "ownership_proof", filename: "a.pdf", storageKey: "x/a.pdf", mimeType: "application/pdf", sizeBytes: 1 });
    expect(await deleteSpot(account.id, draft)).toEqual({ ok: true });
    expect(await spotRow(draft)).toBeUndefined();
    expect(await db.select().from(documents)).toEqual([]);
    // Someone else's account can't delete it (it is already gone here, and so is a wrong id).
    expect(await deleteSpot(account.id, draft)).toEqual({ ok: false, error: "Parkeringsplatsen finns inte." });
  });

  it("waits for upcoming bookings, then archives a booked one: paused, hidden, its cars gone, the bookings kept", async () => {
    const { spotId, account } = await makeBookableSpot();
    const driver = await makeUser("Dora Förare");
    const b = await makeConfirmedBooking(spotId, driver.id, hoursFromNow(24), hoursFromNow(26));
    await db.insert(spotVehicleApprovals).values({ spotId, reg: "ABC123" });
    expect(await deleteSpot(account.id, spotId)).toEqual({ ok: false, error: expect.stringContaining("kommande bokningar") });

    await happened(b.id);
    expect(await deleteSpot(account.id, spotId)).toEqual({ ok: true });
    expect(await spotRow(spotId)).toMatchObject({ status: "paused", review: "draft", deletedAt: expect.any(Date) });
    expect(await getSpot(spotId)).toBeNull();
    expect(await db.select().from(spotVehicleApprovals)).toEqual([]);
    expect((await db.select().from(bookings).where(eq(bookings.id, b.id)))[0].spotId).toBe(spotId);
    expect((await adminSearchSpots({})).rows.map((r) => r.id)).not.toContain(spotId);
  });
});

describe("deleting a host account", () => {
  it("removes an organisation stuck in verification, with everything in it, and its owner is a driver again", async () => {
    const { host, account } = await makeHost({ kind: "association", name: "Brf Fastnad", orgNumber: "769600-0000", verificationStatus: "pending", payoutStatus: "not_connected" });
    await createSpots(account.id, host.id, spotInput({ title: "Ännu inte inskickad" }));
    await db.insert(hostInvitations).values({ id: "h1", hostAccountId: account.id, email: "kollega@example.com", invitedBy: host.id, expiresAt: hoursFromNow(24) });
    const colleague = await makeUser("Kollega");
    await db.insert(hostAccountMembers).values({ hostAccountId: account.id, userId: colleague.id, role: "admin" });

    // Only the owner.
    expect(await deleteHostAccount(account.id, colleague.id)).toEqual({ ok: false, error: "Bara kontots ägare kan ta bort det." });
    expect(await deleteHostAccount(account.id, host.id)).toEqual({ ok: true });
    expect(await accountRow(account.id)).toBeUndefined();
    expect(await db.select().from(spots)).toEqual([]);
    expect(await listAccountsForUser(host.id)).toEqual([]);
    expect(await listAccountsForUser(colleague.id)).toEqual([]);
  });

  it("keeps a booked account for the bookkeeping, without members, and out of the admin lists", async () => {
    const { spotId, account, host } = await makeBookableSpot();
    const driver = await makeUser("Dora Förare");
    const b = await makeConfirmedBooking(spotId, driver.id, hoursFromNow(24), hoursFromNow(26));
    expect(await deleteHostAccount(account.id, host.id)).toEqual({ ok: false, error: expect.stringContaining("kommande bokningar") });
    await happened(b.id);
    expect(await deleteHostAccount(account.id, host.id)).toEqual({ ok: true });
    expect(await accountRow(account.id)).toMatchObject({ deletedAt: expect.any(Date) });
    expect(await spotRow(spotId)).toMatchObject({ deletedAt: expect.any(Date), status: "paused" });
    expect(await db.select().from(hostAccountMembers).where(eq(hostAccountMembers.hostAccountId, account.id))).toEqual([]);
    expect((await searchAccounts({})).rows.map((r) => r.account.id)).not.toContain(account.id);
  });
});
