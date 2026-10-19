import "server-only";
import { and, eq, gt, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings, spots, users } from "@/db/schema";
import { formatDateTime, formatTime } from "@/lib/time";
import { notifyAccount, notifyUsers } from "./notifications";

/** Hosts get a reminder this long before the start if the car still isn't registered. */
export const REMINDER_BEFORE_START_MS = 3 * 3600_000;

/**
 * Follow-up on cars that a BRF has to register:
 * 1. A few hours before the start, remind the host once.
 * 2. If the booking starts and the car still isn't registered, tell the
 *    driver not to park yet (they can cancel with a full refund) and tell the
 *    host again.
 * Each step claims its bookings with an UPDATE … RETURNING, so overlapping
 * runs never send the same message twice.
 */
export async function runRegistrationReminders(now = new Date()) {
  const pending = and(eq(bookings.status, "confirmed"), eq(bookings.vehicleRegistration, "pending"), gt(bookings.endsAt, now));

  const remind = await db
    .update(bookings)
    .set({ vehicleReminderSentAt: now })
    .where(
      and(pending, isNull(bookings.vehicleReminderSentAt), gt(bookings.startsAt, now), lte(bookings.startsAt, new Date(now.getTime() + REMINDER_BEFORE_START_MS))),
    )
    .returning({ id: bookings.id });
  for (const { id } of remind) {
    const b = await load(id);
    if (!b) continue;
    await notifyAccount(b.spot.hostAccountId, {
      kind: "vehicle_reminder",
      title: `Påminnelse: registrera ${b.booking.vehicleReg} före kl. ${formatTime(b.booking.startsAt)}`,
      body: `Bokningen av ${b.spot.title} börjar ${formatDateTime(b.booking.startsAt)} och bilen är inte markerad som registrerad. Registrera den i föreningens system och markera den som registrerad i Parklet.`,
      href: `/bokning/${id}`,
    });
  }

  const overdue = await db
    .update(bookings)
    .set({ vehicleOverdueNotifiedAt: now })
    .where(and(pending, isNull(bookings.vehicleOverdueNotifiedAt), lte(bookings.startsAt, now)))
    .returning({ id: bookings.id });
  for (const { id } of overdue) {
    const b = await load(id);
    if (!b) continue;
    await notifyUsers([b.booking.driverId], {
      kind: "vehicle_overdue",
      title: `${b.booking.vehicleReg} är inte registrerad än – vänta med att parkera`,
      body:
        `Din bokning av ${b.spot.title} har börjat, men uthyraren har inte bekräftat att bilen är registrerad hos föreningen. ` +
        `Parkera inte förrän den är det, annars riskerar du en kontrollavgift. Vi har påmint uthyraren.\n\n` +
        `Vill du hellre avboka får du tillbaka hela beloppet.`,
      href: `/bokning/${id}`,
    });
    await notifyAccount(b.spot.hostAccountId, {
      kind: "vehicle_overdue",
      title: `Bokningen har börjat – ${b.booking.vehicleReg} är inte registrerad`,
      body: `${b.driverName} väntar på att bilen ska registreras för ${b.spot.title}. Registrera den nu och markera den i Parklet. Föraren kan avboka med full återbetalning tills dess.`,
      href: `/bokning/${id}`,
    });
  }
  return { reminded: remind.length, overdue: overdue.length };
}

async function load(id: string) {
  const [row] = await db
    .select({ booking: bookings, spot: { title: spots.title, hostAccountId: spots.hostAccountId }, driverName: sql<string>`split_part(${users.name}, ' ', 1)` })
    .from(bookings)
    .innerJoin(spots, eq(spots.id, bookings.spotId))
    .innerJoin(users, eq(users.id, bookings.driverId))
    .where(eq(bookings.id, id))
    .limit(1);
  return row ?? null;
}

let lastRun = 0;

/**
 * Run the reminders at most every few minutes per server instance, piggybacking
 * on ordinary page views. A scheduler calling /api/cron/paminnelser makes them
 * punctual even when nobody is browsing.
 */
export async function runRemindersOccasionally() {
  if (Date.now() - lastRun < 5 * 60_000) return;
  lastRun = Date.now();
  try {
    await runRegistrationReminders();
  } catch (err) {
    console.error("reminders: run failed", err instanceof Error ? err.message : err);
  }
}
