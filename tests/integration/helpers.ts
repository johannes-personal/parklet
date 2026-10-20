import { db } from "./direct-db";
import { bookings, hostAccountMembers, hostAccounts, mailOutbox, notifications, spots, users, type HostAccount } from "@/db/schema";
import { asc, eq, sql } from "drizzle-orm";
import type { SpotInput } from "@/lib/validation";
import { createSpots } from "@/server/spots";
import { confirmPayment, createBooking } from "@/server/bookings";

export async function resetDb() {
  await db.execute(
    sql`TRUNCATE bookings, availability_windows, documents, document_blobs, mail_outbox, spots, host_invitations, host_account_members, host_accounts, vehicles, password_reset_tokens, sessions, notifications, identity_requests, app_secrets, users CASCADE`,
  );
}

/** A time on the quarter hour, `h` hours from now. */
export const hoursFromNow = (h: number) => new Date(Math.ceil((Date.now() + h * 3600_000) / 900_000) * 900_000);

let n = 0;
export async function makeUser(name = "Test Person", extra: Partial<typeof users.$inferInsert> = {}) {
  n++;
  const [u] = await db
    .insert(users)
    .values({ email: `user${n}-${Date.now()}@example.com`, name, passwordHash: "x", identityVerifiedAt: new Date(), ...extra })
    .returning();
  return u;
}

/** A Parklet administrator (reviewer). */
export const makeAdmin = (name = "Admin Person") => makeUser(name, { isAdmin: true });

/** A household host account with its owner; verified with payouts connected unless overridden. */
export async function makeHost(overrides: Partial<typeof hostAccounts.$inferInsert> = {}, name = "Host Person") {
  const host = await makeUser(name);
  const [account] = await db
    .insert(hostAccounts)
    .values({ kind: "household", name: host.name, verificationStatus: "verified", payoutStatus: "active", ...overrides })
    .returning();
  await db.insert(hostAccountMembers).values({ hostAccountId: account.id, userId: host.id, role: "owner" });
  return { host, account: account as HostAccount };
}

/** A valid spot form as the host would submit it (weekday daytime driveway). */
export function spotInput(overrides: Partial<SpotInput> = {}): SpotInput {
  return {
    title: "Uppfart",
    description: "",
    address: "Testgatan 1",
    city: "Göteborg",
    lat: 57.7,
    lng: 11.97,
    spotType: "driveway",
    covered: false,
    evCharging: false,
    maxHeightCm: null,
    pricePerHourOre: 2000,
    pricePerDayOre: null,
    minDurationMinutes: 60,
    minNoticeMinutes: 0,
    cancellationHours: 2,
    accessInstructions: "",
    visibility: "public",
    schedule: { mode: "weekdaysDaytime" },
    rightBasis: "owns",
    landlordKind: null,
    landlordName: "",
    landlordEmail: "",
    requiresVehicleRegistration: false,
    vehicleRegistrationNote: "",
    ...overrides,
  };
}

/** A verified household host with payouts connected and one approved, always-available spot. */
export async function makeBookableSpot(overrides: Partial<typeof spots.$inferInsert> = {}) {
  const { host, account } = await makeHost();
  const [id] = await createSpots(
    account.id,
    host.id,
    spotInput({
      title: "Testplats",
      spotType: "outdoor",
      pricePerDayOre: 15000,
      accessInstructions: "Koden är 1234",
      schedule: { mode: "always" },
    }),
  );
  await db
    .update(spots)
    .set({ review: "approved", ...overrides })
    .where(sql`${spots.id} = ${id}`);
  return { host, account, spotId: id };
}

/** A booking that is held and paid, the way checkout does it. Returns the booking row. */
export async function makeConfirmedBooking(spotId: string, driverId: string, start: Date, end: Date, paymentRef = `ref_${start.getTime()}`) {
  const r = await createBooking({ driverId, spotId, start, end, vehicleReg: "ABC123" });
  if (!r.ok) throw new Error(r.error);
  const confirmed = await confirmPayment(r.bookingId, paymentRef);
  if (!confirmed.ok) throw new Error(confirmed.error);
  return getBooking(r.bookingId);
}

export async function getBooking(id: string) {
  const [row] = await db.select().from(bookings).where(eq(bookings.id, id));
  return row;
}

export async function getSpotRow(id: string) {
  const [row] = await db.select().from(spots).where(eq(spots.id, id));
  return row;
}

export const mailTo = (to: string) => db.select().from(mailOutbox).where(eq(mailOutbox.to, to)).orderBy(asc(mailOutbox.id));
export const allMail = () => db.select().from(mailOutbox).orderBy(asc(mailOutbox.id));
export const notificationsOf = (userId: string) =>
  db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(asc(notifications.createdAt), asc(notifications.kind));
export const allNotifications = () => db.select().from(notifications).orderBy(asc(notifications.createdAt), asc(notifications.kind));
