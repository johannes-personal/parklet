import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings, hostAccounts, spots } from "@/db/schema";
import { cancelBooking, confirmPayment, createBooking, markVehicleRegistered } from "@/server/bookings";
import { searchSpots } from "@/server/search";
import { makeBookableSpot, makeUser, resetDb } from "./helpers";

const hoursFromNow = (h: number) => new Date(Math.ceil((Date.now() + h * 3600_000) / 900_000) * 900_000);

beforeEach(resetDb);
afterAll(async () => {
  await db.$client.end();
});

describe("booking flow against Postgres", () => {
  it("holds, confirms and prevents overlapping bookings", async () => {
    const { spotId } = await makeBookableSpot();
    const a = await makeUser();
    const b = await makeUser();
    const start = hoursFromNow(24);
    const end = hoursFromNow(27);

    const first = await createBooking({ driverId: a.id, spotId, start, end, vehicleReg: "ABC123" });
    expect(first.ok).toBe(true);

    // Overlapping request while the first one is only held (not yet paid) is rejected.
    const second = await createBooking({ driverId: b.id, spotId, start: hoursFromNow(26), end: hoursFromNow(28), vehicleReg: "XYZ987" });
    expect(second).toMatchObject({ ok: false });

    if (!first.ok) throw new Error();
    expect(await confirmPayment(first.bookingId, "ref_1")).toEqual({ ok: true });
    // Back-to-back is fine: ranges are half-open.
    const adjacent = await createBooking({ driverId: b.id, spotId, start: end, end: hoursFromNow(29), vehicleReg: "XYZ987" });
    expect(adjacent.ok).toBe(true);
  });

  it("lets the database pick exactly one winner when requests race", async () => {
    const { spotId } = await makeBookableSpot();
    const drivers = await Promise.all([1, 2, 3, 4, 5].map(() => makeUser()));
    const start = hoursFromNow(48);
    const end = hoursFromNow(50);
    const results = await Promise.all(drivers.map((d) => createBooking({ driverId: d.id, spotId, start, end, vehicleReg: "ABC123" })));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("releases expired holds", async () => {
    const { spotId } = await makeBookableSpot();
    const a = await makeUser();
    const b = await makeUser();
    const start = hoursFromNow(24);
    const end = hoursFromNow(26);
    const first = await createBooking({ driverId: a.id, spotId, start, end, vehicleReg: "ABC123" });
    if (!first.ok) throw new Error(first.error);
    await db.update(bookings).set({ holdExpiresAt: sql`now() - interval '1 minute'` }).where(eq(bookings.id, first.bookingId));

    expect(await confirmPayment(first.bookingId, "late")).toMatchObject({ ok: false });
    expect((await createBooking({ driverId: b.id, spotId, start, end, vehicleReg: "XYZ987" })).ok).toBe(true);
  });

  it("only lists bookable spots in search", async () => {
    const { spotId, account } = await makeBookableSpot();
    const center = { lat: 57.7, lng: 11.97 };
    expect((await searchSpots({ center, start: null, end: null })).results.map((r) => r.id)).toEqual([spotId]);

    await db.update(hostAccounts).set({ payoutStatus: "not_connected" }).where(eq(hostAccounts.id, account.id));
    expect((await searchSpots({ center, start: null, end: null })).results).toHaveLength(0);

    await db.update(hostAccounts).set({ payoutStatus: "active" }).where(eq(hostAccounts.id, account.id));
    await db.update(spots).set({ review: "pending_review" }).where(eq(spots.id, spotId));
    expect((await searchSpots({ center, start: null, end: null })).results).toHaveLength(0);
  });

  it("hides spots that are booked during the searched time", async () => {
    const { spotId } = await makeBookableSpot();
    const driver = await makeUser();
    const start = hoursFromNow(24);
    const end = hoursFromNow(26);
    const r = await createBooking({ driverId: driver.id, spotId, start, end, vehicleReg: "ABC123" });
    if (!r.ok) throw new Error(r.error);
    const center = { lat: 57.7, lng: 11.97 };
    expect((await searchSpots({ center, start, end })).results).toHaveLength(0);
    expect((await searchSpots({ center, start: end, end: hoursFromNow(28) })).results).toHaveLength(1);
  });

  it("enforces notice for spots that require vehicle registration, and tracks it", async () => {
    const { spotId, host } = await makeBookableSpot({ requiresVehicleRegistration: true, minNoticeMinutes: 1440 });
    const driver = await makeUser();
    const tooSoon = await createBooking({ driverId: driver.id, spotId, start: hoursFromNow(2), end: hoursFromNow(4), vehicleReg: "ABC123" });
    expect(tooSoon).toMatchObject({ ok: false });

    const ok = await createBooking({ driverId: driver.id, spotId, start: hoursFromNow(30), end: hoursFromNow(32), vehicleReg: "ABC123" });
    if (!ok.ok) throw new Error(ok.error);
    const [row] = await db.select().from(bookings).where(eq(bookings.id, ok.bookingId));
    expect(row.vehicleRegistration).toBe("pending");

    expect(await markVehicleRegistered(ok.bookingId, driver.id)).toBe(false); // drivers cannot tick it
    expect(await markVehicleRegistered(ok.bookingId, host.id)).toBe(true);
    const [after] = await db.select().from(bookings).where(eq(bookings.id, ok.bookingId));
    expect(after.vehicleRegistration).toBe("done");
  });

  it("applies the free cancellation window for drivers but not hosts", async () => {
    const { spotId, host } = await makeBookableSpot({ cancellationHours: 24 });
    const driver = await makeUser();
    const r = await createBooking({ driverId: driver.id, spotId, start: hoursFromNow(5), end: hoursFromNow(7), vehicleReg: "ABC123" });
    if (!r.ok) throw new Error(r.error);
    await confirmPayment(r.bookingId, "ref");
    expect(await cancelBooking(r.bookingId, driver.id)).toMatchObject({ ok: false });
    expect(await cancelBooking(r.bookingId, host.id)).toEqual({ ok: true });
    const [row] = await db.select().from(bookings).where(eq(bookings.id, r.bookingId));
    expect(row).toMatchObject({ status: "cancelled", cancelledBy: "host", paymentStatus: "refunded" });
  });

  it("does not let hosts book their own spots", async () => {
    const { spotId, host } = await makeBookableSpot();
    expect(await createBooking({ driverId: host.id, spotId, start: hoursFromNow(5), end: hoursFromNow(7), vehicleReg: "ABC123" })).toMatchObject({
      ok: false,
    });
  });
});
