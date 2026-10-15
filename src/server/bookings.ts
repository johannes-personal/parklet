import "server-only";
import { and, asc, desc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings, hostAccountMembers, spots, users, vehicles, type Booking, type Spot } from "@/db/schema";
import { isWithinWindows } from "@/lib/availability";
import { calculatePrice, durationMinutes, type PriceBreakdown } from "@/lib/pricing";
import { formatDuration } from "@/lib/time";
import { isUuid } from "./ids";
import { getPaymentProvider } from "./payments";
import { getSpotWithAccount, isBookable, type SpotWithWindows } from "./spots";

export const MAX_BOOKING_DAYS = 30;
/** How long an unpaid booking holds the slot. */
export const HOLD_MINUTES = 15;
/** Allow "now" bookings that were filled in a few minutes ago. */
const START_GRACE_MS = 10 * 60_000;

export type QuoteResult = { ok: true; price: PriceBreakdown } | { ok: false; error: string };

/** Validates a requested time range against the spot's rules (not against other bookings). */
export function checkRules(spot: SpotWithWindows, start: Date, end: Date, now = new Date()): QuoteResult {
  if (!(end > start)) return { ok: false, error: "Sluttiden måste vara efter starttiden." };
  if (start.getTime() < now.getTime() - START_GRACE_MS) return { ok: false, error: "Starttiden har redan passerat." };
  if (spot.minNoticeMinutes > 0 && start.getTime() < now.getTime() + spot.minNoticeMinutes * 60_000) {
    return {
      ok: false,
      error: `Platsen måste bokas minst ${formatDuration(spot.minNoticeMinutes)} i förväg${spot.requiresVehicleRegistration ? " så att bilen hinner registreras" : ""}.`,
    };
  }
  const minutes = durationMinutes(start, end);
  if (minutes < spot.minDurationMinutes) {
    return { ok: false, error: `Minsta bokningstid för den här platsen är ${formatDuration(spot.minDurationMinutes)}.` };
  }
  if (minutes > MAX_BOOKING_DAYS * 1440) return { ok: false, error: `Du kan boka som längst ${MAX_BOOKING_DAYS} dygn i taget.` };
  if (!isWithinWindows(spot.windows, start, end)) {
    return { ok: false, error: "Platsen är inte tillgänglig hela den valda tiden. Se tillgängliga tider." };
  }
  return {
    ok: true,
    price: calculatePrice({ start, end, pricePerHourOre: spot.pricePerHourOre, pricePerDayOre: spot.pricePerDayOre }),
  };
}

/** Holding statuses: these occupy the slot (see the exclusion constraint). */
const holding = sql`(${bookings.status} = 'confirmed' OR (${bookings.status} = 'pending_payment' AND ${bookings.holdExpiresAt} > now()))`;

/** Upcoming busy ranges on a spot, shown to drivers without revealing who booked. */
export async function listBusyRanges(spotId: string, from = new Date()) {
  return db
    .select({ startsAt: bookings.startsAt, endsAt: bookings.endsAt })
    .from(bookings)
    .where(and(eq(bookings.spotId, spotId), holding, gt(bookings.endsAt, from)))
    .orderBy(asc(bookings.startsAt))
    .limit(20);
}

export type CreateBookingResult = { ok: true; bookingId: string } | { ok: false; error: string };

/**
 * Step 1 of checkout: validate and place a time-limited hold on the slot.
 * Step 2 (`confirmPayment`) runs when the payment provider reports success.
 */
export async function createBooking(input: {
  driverId: string;
  spotId: string;
  start: Date;
  end: Date;
  vehicleReg: string;
}): Promise<CreateBookingResult> {
  const row = await getSpotWithAccount(input.spotId);
  if (!row) return { ok: false, error: "Platsen finns inte." };
  const { spot, account } = row;
  if (!isBookable(spot, account)) return { ok: false, error: "Platsen kan inte bokas just nu." };
  if (await isAccountMember(account.id, input.driverId)) return { ok: false, error: "Du kan inte boka en plats som ditt eget uthyrarkonto hyr ut." };

  const rules = checkRules(spot, input.start, input.end);
  if (!rules.ok) return rules;
  const price = rules.price;

  try {
    const bookingId = await db.transaction(async (tx) => {
      // Serialize bookings per spot. Concurrent inserts checking the exclusion constraint
      // otherwise wait on each other's uncommitted rows and can deadlock instead of one
      // winning. NO KEY UPDATE doesn't block foreign-key checks against the spot.
      await tx.execute(sql`select 1 from ${spots} where ${spots.id} = ${spot.id} for no key update`);

      // Release stale holds on this spot so the exclusion constraint only sees live ones.
      await tx
        .update(bookings)
        .set({ status: "expired" })
        .where(and(eq(bookings.spotId, spot.id), eq(bookings.status, "pending_payment"), lt(bookings.holdExpiresAt, new Date())));

      // Remember the plate for next time.
      const [vehicle] = await tx
        .insert(vehicles)
        .values({ userId: input.driverId, reg: input.vehicleReg })
        .onConflictDoUpdate({ target: [vehicles.userId, vehicles.reg], set: { reg: input.vehicleReg } })
        .returning({ id: vehicles.id });

      const [created] = await tx
        .insert(bookings)
        .values({
          spotId: spot.id,
          driverId: input.driverId,
          vehicleId: vehicle.id,
          startsAt: input.start,
          endsAt: input.end,
          status: "pending_payment",
          holdExpiresAt: new Date(Date.now() + HOLD_MINUTES * 60_000),
          vehicleReg: input.vehicleReg,
          vehicleRegistration: spot.requiresVehicleRegistration ? "pending" : "not_required",
          baseOre: price.baseOre,
          feeOre: price.feeOre,
          totalOre: price.totalOre,
          paymentProvider: getPaymentProvider().name,
        })
        .returning({ id: bookings.id });
      return created.id;
    });
    return { ok: true, bookingId };
  } catch (err) {
    if (isExclusionViolation(err)) {
      return { ok: false, error: "Tyvärr, någon annan har redan bokat platsen under den här tiden. Välj en annan tid." };
    }
    throw err;
  }
}

/**
 * Called when the provider reports a successful payment (the mock checkout
 * page, or the Stripe `payment_intent.succeeded` webhook in production).
 * Idempotent: confirming twice is a no-op.
 */
export async function confirmPayment(bookingId: string, paymentRef: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const updated = await db
    .update(bookings)
    .set({ status: "confirmed", paymentStatus: "paid", paymentRef, confirmedAt: new Date(), holdExpiresAt: null })
    .where(and(eq(bookings.id, bookingId), eq(bookings.status, "pending_payment"), gt(bookings.holdExpiresAt, new Date())))
    .returning({ id: bookings.id });
  if (updated.length) return { ok: true };
  const [b] = await db.select({ status: bookings.status }).from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (b?.status === "confirmed") return { ok: true };
  return { ok: false, error: "Reservationen hann gå ut innan betalningen genomfördes. Ingen betalning har dragits. Boka igen." };
}

function isExclusionViolation(err: unknown): boolean {
  // 23P01 = exclusion_violation. Drizzle wraps driver errors, so check the cause too.
  const codes = [err, (err as { cause?: unknown })?.cause].map((e) => (e as { code?: string } | undefined)?.code);
  return codes.includes("23P01");
}

async function isAccountMember(accountId: string, userId: string) {
  const rows = await db
    .select({ u: hostAccountMembers.userId })
    .from(hostAccountMembers)
    .where(and(eq(hostAccountMembers.hostAccountId, accountId), eq(hostAccountMembers.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

export type BookingWithSpot = Booking & {
  spot: Pick<
    Spot,
    | "id"
    | "title"
    | "address"
    | "city"
    | "lat"
    | "lng"
    | "hostAccountId"
    | "cancellationHours"
    | "accessInstructions"
    | "requiresVehicleRegistration"
    | "vehicleRegistrationNote"
  >;
  driverName: string;
  /** True when the viewer administers the spot's host account. */
  viewerIsHost: boolean;
};

const bookingSelect = {
  booking: bookings,
  spot: {
    id: spots.id,
    title: spots.title,
    address: spots.address,
    city: spots.city,
    lat: spots.lat,
    lng: spots.lng,
    hostAccountId: spots.hostAccountId,
    cancellationHours: spots.cancellationHours,
    accessInstructions: spots.accessInstructions,
    requiresVehicleRegistration: spots.requiresVehicleRegistration,
    vehicleRegistrationNote: spots.vehicleRegistrationNote,
  },
};

const memberOfSpotAccount = (userId: string) =>
  sql`exists (select 1 from ${hostAccountMembers} m where m.host_account_id = ${spots.hostAccountId} and m.user_id = ${userId})`;

/** A booking visible to the given user: they are either the driver or an administrator of the host account. */
export async function getBookingForUser(bookingId: string, userId: string): Promise<BookingWithSpot | null> {
  if (!isUuid(bookingId)) return null;
  const [row] = await db
    .select({ ...bookingSelect, viewerIsHost: memberOfSpotAccount(userId).mapWith(Boolean) })
    .from(bookings)
    .innerJoin(spots, eq(spots.id, bookings.spotId))
    .where(and(eq(bookings.id, bookingId), or(eq(bookings.driverId, userId), memberOfSpotAccount(userId))))
    .limit(1);
  if (!row) return null;
  const names = await firstNames([row.booking.driverId]);
  return { ...row.booking, spot: row.spot, driverName: names.get(row.booking.driverId) ?? "", viewerIsHost: row.viewerIsHost };
}

export async function listDriverBookings(driverId: string): Promise<BookingWithSpot[]> {
  const rows = await db
    .select(bookingSelect)
    .from(bookings)
    .innerJoin(spots, eq(spots.id, bookings.spotId))
    .where(and(eq(bookings.driverId, driverId), inArray(bookings.status, ["confirmed", "cancelled", "pending_payment"])))
    .orderBy(desc(bookings.startsAt))
    .limit(200);
  return rows.map((r) => ({ ...r.booking, spot: r.spot, driverName: "", viewerIsHost: false }));
}

export async function listAccountBookings(accountId: string): Promise<BookingWithSpot[]> {
  const rows = await db
    .select(bookingSelect)
    .from(bookings)
    .innerJoin(spots, eq(spots.id, bookings.spotId))
    .where(
      and(
        eq(spots.hostAccountId, accountId),
        inArray(bookings.status, ["confirmed", "cancelled"]),
        gt(bookings.endsAt, new Date(Date.now() - 7 * 24 * 3600 * 1000)),
      ),
    )
    .orderBy(asc(bookings.startsAt))
    .limit(200);
  const names = await firstNames(rows.map((r) => r.booking.driverId));
  return rows.map((r) => ({ ...r.booking, spot: r.spot, driverName: names.get(r.booking.driverId) ?? "", viewerIsHost: true }));
}

async function firstNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, unique));
  // Only first names are shared between drivers and hosts.
  return new Map(rows.map((r) => [r.id, r.name.split(" ")[0]]));
}

export function driverCancellationDeadline(b: Pick<Booking, "startsAt">, cancellationHours: number): Date {
  return new Date(b.startsAt.getTime() - cancellationHours * 3600 * 1000);
}

export type CancelResult = { ok: true } | { ok: false; error: string };

export async function cancelBooking(bookingId: string, userId: string, now = new Date()): Promise<CancelResult> {
  const booking = await getBookingForUser(bookingId, userId);
  if (!booking) return { ok: false, error: "Bokningen finns inte." };
  if (booking.status === "pending_payment" && booking.driverId === userId) {
    await db.update(bookings).set({ status: "expired" }).where(and(eq(bookings.id, booking.id), eq(bookings.status, "pending_payment")));
    return { ok: true };
  }
  if (booking.status !== "confirmed") return { ok: false, error: "Bokningen är inte aktiv." };
  if (booking.endsAt <= now) return { ok: false, error: "Bokningen har redan passerat." };

  const asHost = booking.viewerIsHost && booking.driverId !== userId;
  if (!asHost && now > driverCancellationDeadline(booking, booking.spot.cancellationHours)) {
    return { ok: false, error: "Det är för sent att avboka kostnadsfritt. Kontakta supporten om något har hänt." };
  }

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(bookings)
      .set({ status: "cancelled", cancelledAt: now, cancelledBy: asHost ? "host" : "driver", paymentStatus: "refunded" })
      .where(and(eq(bookings.id, booking.id), eq(bookings.status, "confirmed")))
      .returning({ id: bookings.id });
    if (updated.length && booking.paymentRef) {
      await getPaymentProvider().refund({ ref: booking.paymentRef, amountOre: booking.totalOre });
    }
  });
  return { ok: true };
}

/** The host confirms that the driver's car has been registered in the association's parking system. */
export async function markVehicleRegistered(bookingId: string, userId: string) {
  const booking = await getBookingForUser(bookingId, userId);
  if (!booking || !booking.viewerIsHost) return false;
  await db
    .update(bookings)
    .set({ vehicleRegistration: "done", vehicleRegisteredAt: new Date() })
    .where(and(eq(bookings.id, bookingId), eq(bookings.vehicleRegistration, "pending")));
  return true;
}

export async function listVehicles(userId: string) {
  return db.select().from(vehicles).where(eq(vehicles.userId, userId)).orderBy(asc(vehicles.createdAt));
}
