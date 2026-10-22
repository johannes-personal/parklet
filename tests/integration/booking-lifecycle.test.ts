import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { closeDb, db } from "./direct-db";
import { bookings, hostAccounts, spots } from "@/db/schema";
import { cancelBooking, confirmPayment, createBooking, markVehicleRegistered } from "@/server/bookings";
import { getPaymentProvider } from "@/server/payments";
import {
  allMail,
  allNotifications,
  getBooking,
  hoursFromNow,
  makeAdmin,
  makeBookableSpot,
  makeConfirmedBooking,
  makeUser,
  mailTo,
  notificationsOf,
  resetDb,
} from "./helpers";

beforeEach(resetDb);
afterEach(() => {
  vi.restoreAllMocks();
});
afterAll(async () => {
  await closeDb();
});

const NOT_BOOKABLE = { ok: false, error: "Platsen kan inte bokas just nu." };
const HOLD_EXPIRED = { ok: false, error: "Reservationen hann gå ut innan betalningen genomfördes. Ingen betalning har dragits. Boka igen." };
const TOO_LATE = { ok: false, error: "Det är för sent att avboka kostnadsfritt. Kontakta supporten om något har hänt." };

describe("booking a spot by its id", () => {
  const cases: [string, (ids: { spotId: string; accountId: string }) => Promise<unknown>][] = [
    ["the spot is paused", ({ spotId }) => db.update(spots).set({ status: "paused" }).where(eq(spots.id, spotId))],
    ["the spot is waiting for review", ({ spotId }) => db.update(spots).set({ review: "pending_review" }).where(eq(spots.id, spotId))],
    ["the host account is unverified", ({ accountId }) => db.update(hostAccounts).set({ verificationStatus: "unverified" }).where(eq(hostAccounts.id, accountId))],
    ["payouts aren't connected", ({ accountId }) => db.update(hostAccounts).set({ payoutStatus: "not_connected" }).where(eq(hostAccounts.id, accountId))],
  ];
  for (const [when, prepare] of cases) {
    it(`is refused when ${when}`, async () => {
      const { spotId, account } = await makeBookableSpot();
      await prepare({ spotId, accountId: account.id });
      const driver = await makeUser();
      expect(await createBooking({ driverId: driver.id, spotId, start: hoursFromNow(24), end: hoursFromNow(26), vehicleReg: "ABC123" })).toEqual(NOT_BOOKABLE);
      expect(await db.select().from(bookings)).toEqual([]);
    });
  }
});

describe("cancelling", () => {
  it("twice at the same time refunds once", async () => {
    const { spotId } = await makeBookableSpot();
    const driver = await makeUser();
    const booking = await makeConfirmedBooking(spotId, driver.id, hoursFromNow(48), hoursFromNow(50), "ref_twice");
    const refund = vi.spyOn(getPaymentProvider(), "refund");

    const results = await Promise.all([cancelBooking(booking.id, driver.id), cancelBooking(booking.id, driver.id)]);
    expect(results).toEqual(expect.arrayContaining([{ ok: true }, { ok: false, error: "Bokningen är inte aktiv." }]));
    expect(refund).toHaveBeenCalledTimes(1);
    expect(refund).toHaveBeenCalledWith({ ref: "ref_twice", amountOre: booking.totalOre });
    expect(await getBooking(booking.id)).toMatchObject({ status: "cancelled", paymentStatus: "refunded", cancelledBy: "driver" });
  });

  it("is free after the deadline while the car's registration is pending, but not once it is registered", async () => {
    const { spotId, host } = await makeBookableSpot({ requiresVehicleRegistration: true, cancellationHours: 24 });
    const driver = await makeUser();
    const refund = vi.spyOn(getPaymentProvider(), "refund");

    // Starts in 5 hours: the 24-hour free cancellation has passed, but the host hasn't registered the car.
    const pending = await makeConfirmedBooking(spotId, driver.id, hoursFromNow(5), hoursFromNow(7), "ref_pending");
    expect(pending.vehicleRegistration).toBe("pending");
    expect(await cancelBooking(pending.id, driver.id)).toEqual({ ok: true });
    expect(refund).toHaveBeenCalledWith({ ref: "ref_pending", amountOre: pending.totalOre });
    expect(await getBooking(pending.id)).toMatchObject({ status: "cancelled", paymentStatus: "refunded", cancelledBy: "driver" });

    const registered = await makeConfirmedBooking(spotId, driver.id, hoursFromNow(8), hoursFromNow(10), "ref_registered");
    expect(await markVehicleRegistered(registered.id, host.id)).toBe(true);
    expect(await cancelBooking(registered.id, driver.id)).toEqual(TOO_LATE);
    expect(await getBooking(registered.id)).toMatchObject({ status: "confirmed", paymentStatus: "paid", vehicleRegistration: "done" });
    expect(refund).toHaveBeenCalledTimes(1);
  });

  it("stays cancelled and paid, and tells the admins, when the refund fails after the slot was booked again", async () => {
    const admin = await makeAdmin();
    const { spotId } = await makeBookableSpot();
    const driver = await makeUser();
    const other = await makeUser("Snabb Förare");
    const booking = await makeConfirmedBooking(spotId, driver.id, hoursFromNow(48), hoursFromNow(50), "ref_lost");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(getPaymentProvider(), "refund").mockImplementationOnce(async () => {
      // While the provider is failing, someone else books the freed slot.
      await db.insert(bookings).values({
        spotId,
        driverId: other.id,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        status: "confirmed",
        vehicleReg: "XYZ987",
        baseOre: booking.baseOre,
        feeOre: booking.feeOre,
        totalOre: booking.totalOre,
        paymentProvider: "mock",
        paymentStatus: "paid",
        paymentRef: "ref_other",
      });
      throw new Error("provider down");
    });

    await expect(cancelBooking(booking.id, driver.id)).rejects.toThrow("provider down");
    expect(await getBooking(booking.id)).toMatchObject({ status: "cancelled", paymentStatus: "paid", cancelledBy: "driver" });
    const [note] = (await notificationsOf(admin.id)).filter((n) => n.kind === "refund_failed");
    expect(note).toMatchObject({ title: "Återbetalning misslyckades: Testplats", href: "/admin" });
    expect(note.body).toContain(`bokning ${booking.id}, betalning ref_lost`);
    expect((await mailTo(admin.email)).map((m) => m.subject)).toEqual(["Återbetalning misslyckades: Testplats"]);
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("could not be restored"), booking.id, expect.anything(), expect.anything());
  });

  it("restores the booking, without bothering the admins, when the refund fails and the slot is still free", async () => {
    const admin = await makeAdmin();
    const { spotId } = await makeBookableSpot();
    const driver = await makeUser();
    const booking = await makeConfirmedBooking(spotId, driver.id, hoursFromNow(48), hoursFromNow(50));
    vi.spyOn(getPaymentProvider(), "refund").mockRejectedValueOnce(new Error("provider down"));
    await expect(cancelBooking(booking.id, driver.id)).rejects.toThrow("provider down");
    expect(await getBooking(booking.id)).toMatchObject({ status: "confirmed", paymentStatus: "paid", cancelledAt: null, cancelledBy: null });
    expect(await notificationsOf(admin.id)).toEqual([]);
  });
});

describe("confirming a payment", () => {
  it("twice is a no-op the second time: no new notifications or e-mail", async () => {
    const { spotId } = await makeBookableSpot();
    const driver = await makeUser();
    const r = await createBooking({ driverId: driver.id, spotId, start: hoursFromNow(24), end: hoursFromNow(26), vehicleReg: "ABC123" });
    if (!r.ok) throw new Error(r.error);

    expect(await confirmPayment(r.bookingId, "ref_1")).toEqual({ ok: true });
    const first = await getBooking(r.bookingId);
    expect(first).toMatchObject({ status: "confirmed", paymentStatus: "paid", paymentRef: "ref_1", holdExpiresAt: null });
    const notes = await allNotifications();
    const mail = await allMail();
    // The host is told about the booking, the driver gets a confirmation.
    expect(notes.map((n) => n.kind).sort()).toEqual(["booking_confirmed", "booking_new"]);
    expect(mail).toHaveLength(2);
    // The host sees who booked by their full name.
    expect(notes.find((n) => n.kind === "booking_new")!.body).toContain(`${driver.name} har bokat`);

    expect(await confirmPayment(r.bookingId, "ref_1")).toEqual({ ok: true });
    expect(await getBooking(r.bookingId)).toEqual(first);
    expect(await allNotifications()).toEqual(notes);
    expect(await allMail()).toEqual(mail);
  });

  it("is refused once the hold has expired", async () => {
    const { spotId } = await makeBookableSpot();
    const driver = await makeUser();
    const r = await createBooking({ driverId: driver.id, spotId, start: hoursFromNow(24), end: hoursFromNow(26), vehicleReg: "ABC123" });
    if (!r.ok) throw new Error(r.error);
    await db.update(bookings).set({ holdExpiresAt: sql`now() - interval '1 second'` }).where(eq(bookings.id, r.bookingId));

    expect(await confirmPayment(r.bookingId, "ref_late")).toEqual(HOLD_EXPIRED);
    expect(await getBooking(r.bookingId)).toMatchObject({ status: "pending_payment", paymentStatus: "unpaid", paymentRef: null, confirmedAt: null });
    expect(await allNotifications()).toEqual([]);
  });

  it("is refused for a booking that has expired", async () => {
    const { spotId } = await makeBookableSpot();
    const driver = await makeUser();
    const r = await createBooking({ driverId: driver.id, spotId, start: hoursFromNow(24), end: hoursFromNow(26), vehicleReg: "ABC123" });
    if (!r.ok) throw new Error(r.error);
    // The driver abandons checkout: the hold is released.
    expect(await cancelBooking(r.bookingId, driver.id)).toEqual({ ok: true });
    expect(await getBooking(r.bookingId)).toMatchObject({ status: "expired" });

    expect(await confirmPayment(r.bookingId, "ref_late")).toEqual(HOLD_EXPIRED);
    expect(await getBooking(r.bookingId)).toMatchObject({ status: "expired", paymentStatus: "unpaid", paymentRef: null });
    expect(await allNotifications()).toEqual([]);
  });

  it("is refused for an id that isn't a booking", async () => {
    expect(await confirmPayment("not-a-uuid", "ref")).toEqual({ ok: false, error: "Bokningen finns inte." });
  });
});
