import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { bookings, documents, hostAccountMembers, hostAccounts, sessions, users, vehicles } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { deleteOwnAccount } from "@/server/account-deletion";
import { closeDb, db } from "./direct-db";
import { getBooking, getSpotRow, hoursFromNow, makeBookableSpot, makeConfirmedBooking, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(async () => {
  await closeDb();
});

const PASSWORD = "ett riktigt bra lösenord";
const withPassword = async (userId: string) => db.update(users).set({ passwordHash: await hashPassword(PASSWORD) }).where(eq(users.id, userId));
const userRow = async (id: string) => (await db.select().from(users).where(eq(users.id, id)))[0];
/** Moves a booking into the past, as if it had happened. */
const happened = (id: string) => db.update(bookings).set({ startsAt: hoursFromNow(-30), endsAt: hoursFromNow(-28) }).where(eq(bookings.id, id));

describe("deleting your own account", () => {
  it("needs the password", async () => {
    const driver = await makeUser("Dora Förare");
    await withPassword(driver.id);
    expect(await deleteOwnAccount(driver.id, "fel")).toEqual({ ok: false, error: "Fel lösenord." });
    expect((await userRow(driver.id)).email).toBe(driver.email);
  });

  it("waits for upcoming bookings, and then removes the person but keeps the bookings", async () => {
    const { spotId } = await makeBookableSpot();
    const driver = await makeUser("Dora Förare", { personnummerEncrypted: "v1.x", identityName: "Dora Förare" });
    await withPassword(driver.id);
    const booking = await makeConfirmedBooking(spotId, driver.id, hoursFromNow(24), hoursFromNow(26));
    await db.insert(vehicles).values({ userId: driver.id, reg: "XYZ987" });
    await db.insert(sessions).values({ id: "s1", userId: driver.id, expiresAt: hoursFromNow(24) });

    expect(await deleteOwnAccount(driver.id, PASSWORD)).toEqual({ ok: false, error: expect.stringContaining("kommande bokningar") });

    await happened(booking.id);
    expect(await deleteOwnAccount(driver.id, PASSWORD)).toEqual({ ok: true });
    const gone = await userRow(driver.id);
    expect(gone).toMatchObject({ name: "Borttagen användare", identityName: null, personnummerEncrypted: null, identityVerifiedAt: null });
    expect(gone.email).toMatch(/@parklet\.invalid$/);
    expect(gone.passwordHash).not.toBe(driver.passwordHash);
    expect(await db.select().from(vehicles).where(eq(vehicles.userId, driver.id))).toEqual([]);
    expect(await db.select().from(sessions).where(eq(sessions.userId, driver.id))).toEqual([]);
    // The booking stays, for the bookkeeping.
    expect(await getBooking(booking.id)).toMatchObject({ driverId: driver.id, status: "confirmed" });
    // The address can be used for a new account.
    expect(await db.select().from(users).where(eq(users.email, driver.email))).toEqual([]);
  });

  it("pauses a host's spots, removes the documents and the name, and keeps the identity for DAC7 when they were paid", async () => {
    const { host, account, spotId } = await makeBookableSpot();
    await db.update(users).set({ personnummerEncrypted: "v1.x", identityName: "Hanna Värd" }).where(eq(users.id, host.id));
    await withPassword(host.id);
    await db.insert(documents).values({ hostAccountId: account.id, spotId, uploadedBy: host.id, kind: "ownership_proof", filename: "lagfart.pdf", storageKey: "x/lagfart.pdf", mimeType: "application/pdf", sizeBytes: 10 });
    const driver = await makeUser("Dora Förare");
    const booking = await makeConfirmedBooking(spotId, driver.id, hoursFromNow(24), hoursFromNow(26));

    // A booking on the host's spot is still to come.
    expect(await deleteOwnAccount(host.id, PASSWORD)).toEqual({ ok: false, error: expect.stringContaining("på dina parkeringsplatser") });

    await happened(booking.id);
    expect(await deleteOwnAccount(host.id, PASSWORD)).toEqual({ ok: true });
    expect((await getSpotRow(spotId)).status).toBe("paused");
    expect(await db.select().from(documents).where(eq(documents.hostAccountId, account.id))).toEqual([]);
    expect((await db.select().from(hostAccounts).where(eq(hostAccounts.id, account.id)))[0].name).toBe("Borttagen uthyrare");
    // Paid as a host this year: the identity stays for the report to Skatteverket.
    expect(await userRow(host.id)).toMatchObject({ name: "Borttagen användare", personnummerEncrypted: "v1.x", identityName: "Hanna Värd" });
  });

  it("is refused for an account owned together with others, and for admins", async () => {
    const { host, account } = await makeBookableSpot();
    await withPassword(host.id);
    const colleague = await makeUser("Kollega");
    await db.insert(hostAccountMembers).values({ hostAccountId: account.id, userId: colleague.id, role: "admin" });
    expect(await deleteOwnAccount(host.id, PASSWORD)).toEqual({ ok: false, error: expect.stringContaining("fler administratörer") });

    // The co-administrator can leave: only their membership goes.
    await withPassword(colleague.id);
    expect(await deleteOwnAccount(colleague.id, PASSWORD)).toEqual({ ok: true });
    expect((await db.select().from(hostAccountMembers).where(eq(hostAccountMembers.hostAccountId, account.id))).map((m) => m.userId)).toEqual([host.id]);

    const admin = await makeUser("Admin", { isAdmin: true });
    await withPassword(admin.id);
    expect(await deleteOwnAccount(admin.id, PASSWORD)).toEqual({ ok: false, error: expect.stringContaining("administratör") });
  });
});
