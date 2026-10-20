import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, db } from "./direct-db";
import { bookings } from "@/db/schema";
import { REMINDER_BEFORE_START_MS, runRegistrationReminders } from "@/server/reminders";
import { allMail, allNotifications, getBooking, hoursFromNow, makeAdmin, makeBookableSpot, makeConfirmedBooking, makeUser, mailTo, notificationsOf, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(async () => {
  await closeDb();
});

const minutes = (m: number) => m * 60_000;

/** Mail and notifications added since `before`. */
async function newSince(before: { mail: number; notes: number }) {
  return { mail: (await allMail()).slice(before.mail), notes: (await allNotifications()).slice(before.notes) };
}
async function counts() {
  return { mail: (await allMail()).length, notes: (await allNotifications()).length };
}

describe("car registration reminders", () => {
  it("remind the host once before the start, then tell driver, host and admins once at the start", async () => {
    const admin = await makeAdmin();
    const { spotId, host } = await makeBookableSpot({ requiresVehicleRegistration: true });
    const driver = await makeUser("Dora Förare");
    const start = hoursFromNow(24);
    const booking = await makeConfirmedBooking(spotId, driver.id, start, new Date(start.getTime() + 2 * 3600_000));
    expect(booking.vehicleRegistration).toBe("pending");
    const at = (offsetMs: number) => new Date(start.getTime() + offsetMs);

    // Bookings the reminders must leave alone, at the same time on other spots.
    const ignored: string[] = [];
    for (const [status, vehicleRegistration] of [
      ["confirmed", "done"],
      ["cancelled", "pending"],
      ["confirmed", "not_required"],
    ] as const) {
      const other = await makeBookableSpot({ requiresVehicleRegistration: vehicleRegistration !== "not_required" });
      const [row] = await db
        .insert(bookings)
        .values({
          spotId: other.spotId,
          driverId: driver.id,
          startsAt: booking.startsAt,
          endsAt: booking.endsAt,
          status,
          vehicleRegistration,
          vehicleReg: "IGN000",
          baseOre: 2000,
          feeOre: 300,
          totalOre: 2300,
          paymentProvider: "mock",
          paymentStatus: "paid",
          paymentRef: `ref_${status}_${vehicleRegistration}`,
        })
        .returning();
      ignored.push(row.id);
    }

    // Just over three hours before: too early.
    let before = await counts();
    expect(await runRegistrationReminders(at(-REMINDER_BEFORE_START_MS - minutes(1)))).toEqual({ reminded: 0, overdue: 0 });
    expect(await newSince(before)).toEqual({ mail: [], notes: [] });

    // Just under three hours before: one reminder, to the host only.
    before = await counts();
    expect(await runRegistrationReminders(at(-REMINDER_BEFORE_START_MS + minutes(1)))).toEqual({ reminded: 1, overdue: 0 });
    let added = await newSince(before);
    expect(added.notes).toEqual([expect.objectContaining({ userId: host.id, kind: "vehicle_reminder", href: `/bokning/${booking.id}` })]);
    expect(added.notes[0].title).toMatch(/^Påminnelse: registrera ABC123 före kl\. \d\d[:.]\d\d$/);
    expect(added.mail.map((m) => [m.to, m.subject])).toEqual([[host.email, added.notes[0].title]]);

    // Later runs before the start send nothing new.
    before = await counts();
    expect(await runRegistrationReminders(at(-REMINDER_BEFORE_START_MS + minutes(5)))).toEqual({ reminded: 0, overdue: 0 });
    expect(await runRegistrationReminders(at(-minutes(1)))).toEqual({ reminded: 0, overdue: 0 });
    expect(await newSince(before)).toEqual({ mail: [], notes: [] });

    // At the start, still not registered: the driver, the host and the admins are told.
    before = await counts();
    expect(await runRegistrationReminders(at(minutes(1)))).toEqual({ reminded: 0, overdue: 1 });
    added = await newSince(before);
    expect(added.notes.map((n) => [n.userId, n.kind]).sort()).toEqual(
      [
        [driver.id, "vehicle_overdue"],
        [host.id, "vehicle_overdue"],
        [admin.id, "admin_vehicle_overdue"],
      ].sort(),
    );
    expect(added.notes.find((n) => n.userId === driver.id)?.title).toBe("ABC123 är inte registrerad än – vänta med att parkera");
    expect(added.notes.find((n) => n.userId === admin.id)?.href).toBe(`/admin/platser/${spotId}`);
    // E-mail to the driver and the host; the admins see it in the bell and the daily summary only.
    expect(added.mail.map((m) => m.to).sort()).toEqual([driver.email, host.email].sort());
    expect(await mailTo(admin.email)).toEqual([]);
    expect(await getBooking(booking.id)).toMatchObject({ vehicleReminderSentAt: expect.any(Date), vehicleOverdueNotifiedAt: expect.any(Date) });

    // A second run at the start sends nothing new.
    before = await counts();
    expect(await runRegistrationReminders(at(minutes(2)))).toEqual({ reminded: 0, overdue: 0 });
    expect(await newSince(before)).toEqual({ mail: [], notes: [] });

    // Nothing ever went out about the registered, cancelled and not-required bookings.
    for (const id of ignored) {
      expect(await getBooking(id)).toMatchObject({ vehicleReminderSentAt: null, vehicleOverdueNotifiedAt: null });
    }
    expect((await allNotifications()).filter((n) => ignored.some((id) => n.href.includes(id)))).toEqual([]);
    expect((await notificationsOf(driver.id)).map((n) => n.kind).sort()).toEqual(["booking_confirmed", "vehicle_overdue"]);
  });
});
