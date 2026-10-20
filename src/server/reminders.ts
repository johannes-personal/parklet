import "server-only";
import { api, cols, embed, must, names, parse, toDb } from "@/db/api";
import { bookings, spots, users } from "@/db/schema";
import { formatDateTime, formatTime } from "@/lib/time";
import { notifyAccount, notifyAdmins, notifyUsers } from "./notifications";

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
const B = names(bookings);

export async function runRegistrationReminders(now = new Date()) {
  const at = now.toISOString();
  /** Confirmed bookings whose car still has to be registered, as an update that claims them. */
  const claim = (values: Partial<typeof bookings.$inferInsert>) =>
    api().from("bookings").update(toDb(bookings, values)).eq(B.status, "confirmed").eq(B.vehicleRegistration, "pending").gt(B.endsAt, at);

  const remind = must<{ id: string }[]>(
    await claim({ vehicleReminderSentAt: now })
      .is(B.vehicleReminderSentAt, null)
      .gt(B.startsAt, at)
      .lte(B.startsAt, new Date(now.getTime() + REMINDER_BEFORE_START_MS).toISOString())
      .select(B.id),
    "runRegistrationReminders",
  );
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

  const overdue = must<{ id: string }[]>(
    await claim({ vehicleOverdueNotifiedAt: now }).is(B.vehicleOverdueNotifiedAt, null).lte(B.startsAt, at).select(B.id),
    "runRegistrationReminders",
  );
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
    // Support may need to step in; they see it in the bell and in the daily summary.
    await notifyAdmins(
      {
        kind: "admin_vehicle_overdue",
        title: `Bil ej registrerad vid start: ${b.spot.title}`,
        body: `Bokningen har börjat men ${b.booking.vehicleReg} är inte markerad som registrerad.`,
        href: `/admin/platser/${b.booking.spotId}`,
      },
      { email: false },
    );
  }
  return { reminded: remind.length, overdue: overdue.length };
}

async function load(id: string) {
  const row = must<(Record<string, unknown> & { spot: { title: string; hostAccountId: string }; driver: { name: string } }) | null>(
    await api()
      .from("bookings")
      .select(`${cols(bookings)},${embed("spot", spots, ["title", "hostAccountId"], { inner: true })},${embed("driver", users, ["name"], { inner: true })}`)
      .eq(B.id, id)
      .maybeSingle(),
    "runRegistrationReminders",
  );
  if (!row) return null;
  // Only the first name is shared with the host.
  return { booking: parse(bookings, row), spot: row.spot, driverName: row.driver.name.split(" ")[0] };
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
