import "server-only";
import { api, ApiError, cols, embed, must, names, parse, parseAll, rpc, toDb } from "@/db/api";
import { bookings, hostAccountMembers, spots, users, vehicles, type Booking, type Spot, type Vehicle } from "@/db/schema";
import { isWithinWindows } from "@/lib/availability";
import { calculatePrice, durationMinutes, type PriceBreakdown } from "@/lib/pricing";
import { formatSek } from "@/lib/money";
import { formatDateTime, formatDuration, formatRange } from "@/lib/time";
import { isUuid } from "./ids";
import { notifyAccount, notifyUsers } from "./notifications";
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

const B = names(bookings);
const M = names(hostAccountMembers);

/** Bookings that occupy their slot (see the exclusion constraint): confirmed, or held and not yet expired. */
export const holdingFilter = (now: Date) => `${B.status}.eq.confirmed,and(${B.status}.eq.pending_payment,${B.holdExpiresAt}.gt.${now.toISOString()})`;

/** Upcoming busy ranges on a spot, shown to drivers without revealing who booked. */
export async function listBusyRanges(spotId: string, from = new Date()): Promise<Pick<Booking, "startsAt" | "endsAt">[]> {
  const rows = must(
    await api()
      .from("bookings")
      .select(cols(bookings, ["startsAt", "endsAt"]))
      .eq(B.spotId, spotId)
      .or(holdingFilter(new Date()))
      .gt(B.endsAt, from.toISOString())
      .order(B.startsAt)
      .limit(20),
    "listBusyRanges",
  );
  return parseAll(bookings, rows);
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
    // One step in the database (0010_http_api.sql): lock the spot so concurrent bookings
    // queue instead of deadlocking on the exclusion constraint, release stale holds,
    // remember the plate for next time and place the hold.
    const bookingId = await rpc<string>("parklet_create_booking", {
      p_spot_id: spot.id,
      p_driver_id: input.driverId,
      p_starts_at: input.start.toISOString(),
      p_ends_at: input.end.toISOString(),
      p_vehicle_reg: input.vehicleReg,
      p_vehicle_registration: spot.requiresVehicleRegistration ? "pending" : "not_required",
      p_base_ore: price.baseOre,
      p_fee_ore: price.feeOre,
      p_total_ore: price.totalOre,
      p_payment_provider: getPaymentProvider().name,
      p_hold_minutes: HOLD_MINUTES,
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
  if (!isUuid(bookingId)) return { ok: false, error: "Bokningen finns inte." };
  const now = new Date();
  const updated = must(
    await api()
      .from("bookings")
      .update(toDb(bookings, { status: "confirmed", paymentStatus: "paid", paymentRef, confirmedAt: now, holdExpiresAt: null }))
      .eq(B.id, bookingId)
      .eq(B.status, "pending_payment")
      .gt(B.holdExpiresAt, now.toISOString())
      .select(B.id),
    "confirmPayment",
  );
  if (updated.length) {
    await announceBooking(bookingId);
    return { ok: true };
  }
  const b = must(await api().from("bookings").select(B.status).eq(B.id, bookingId).maybeSingle(), "confirmPayment") as { status: string } | null;
  if (b?.status === "confirmed") return { ok: true };
  return { ok: false, error: "Reservationen hann gå ut innan betalningen genomfördes. Ingen betalning har dragits. Boka igen." };
}

/** Tell the host about a new booking (and the car to register), and send the driver a confirmation. */
async function announceBooking(bookingId: string) {
  const row = must(
    await api()
      .from("bookings")
      .select(`${cols(bookings)},${embed("spot", spots, undefined, { inner: true })},${embed("driver", users, ["name"], { inner: true, fk: "bookings_driver_id_users_id_fk" })}`)
      .eq(B.id, bookingId)
      .maybeSingle(),
    "announceBooking",
  ) as (Record<string, unknown> & { spot: unknown; driver: { name: string } }) | null;
  if (!row) return;
  const booking = parse(bookings, row);
  const spot = parse(spots, row.spot);
  const driverName = row.driver.name;
  const when = formatRange(booking.startsAt, booking.endsAt);
  const register = booking.vehicleRegistration === "pending";
  const details: [string, string][] = [
    ["Plats", `${spot.title}, ${spot.address}, ${spot.city}`],
    ["Tid", when],
    ["Bil", booking.vehicleReg],
  ];
  await notifyAccount(spot.hostAccountId, {
    kind: register ? "vehicle_registration" : "booking_new",
    title: register ? `Registrera ${booking.vehicleReg} – ny bokning av ${spot.title}` : `Ny bokning: ${spot.title}`,
    body:
      `${driverName.split(" ")[0]} har bokat ${spot.title}.` +
      (register
        ? `\n\nFöreningen kräver att bilen registreras. Registrera ${booking.vehicleReg} i föreningens parkeringssystem före ${formatDateTime(booking.startsAt)} och markera den som registrerad i Parklet, så att föraren vet att det är klart.`
        : ""),
    details: [...details, ["Din intäkt", formatSek(booking.baseOre)]],
    href: `/bokning/${booking.id}`,
    cta: register ? "Markera bilen som registrerad" : "Visa bokningen",
  });
  await notifyUsers([booking.driverId], {
    kind: "booking_confirmed",
    title: `Bokningsbekräftelse: ${spot.title}`,
    body:
      `Din parkering är bokad och betald. Vägbeskrivning och eventuell portkod finns i bokningen.` +
      (register ? `\n\nPlatsen kräver att bilen registreras av uthyraren. Vi meddelar dig när ${booking.vehicleReg} är registrerad.` : ""),
    details: [...details, ["Totalt betalt", formatSek(booking.totalOre)], ["Boknings-id", booking.id.slice(0, 8).toUpperCase()]],
    href: `/bokning/${booking.id}`,
    cta: "Visa bokningen",
  });
}

/** 23P01 = exclusion_violation: the slot overlaps a booking that holds it. */
function isExclusionViolation(err: unknown): boolean {
  return err instanceof ApiError && err.code === "23P01";
}

async function isAccountMember(accountId: string, userId: string) {
  const rows = must(await api().from("host_account_members").select(M.userId).eq(M.hostAccountId, accountId).eq(M.userId, userId).limit(1), "isAccountMember");
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

const SPOT_KEYS = [
  "id",
  "title",
  "address",
  "city",
  "lat",
  "lng",
  "hostAccountId",
  "cancellationHours",
  "accessInstructions",
  "requiresVehicleRegistration",
  "vehicleRegistrationNote",
] as const;
const BOOKING_WITH_SPOT = `${cols(bookings)},${embed("spot", spots, SPOT_KEYS, { inner: true })}`;

function bookingWithSpot(row: unknown) {
  const r = row as { spot: unknown };
  return { ...parse(bookings, row), spot: parse(spots, r.spot) as BookingWithSpot["spot"] };
}

/** A booking visible to the given user: they are either the driver or an administrator of the host account. */
export async function getBookingForUser(bookingId: string, userId: string): Promise<BookingWithSpot | null> {
  if (!isUuid(bookingId)) return null;
  const row = must(await api().from("bookings").select(BOOKING_WITH_SPOT).eq(B.id, bookingId).maybeSingle(), "getBookingForUser");
  if (!row) return null;
  const booking = bookingWithSpot(row);
  const viewerIsHost = await isAccountMember(booking.spot.hostAccountId, userId);
  if (booking.driverId !== userId && !viewerIsHost) return null;
  const names = await firstNames([booking.driverId]);
  return { ...booking, driverName: names.get(booking.driverId) ?? "", viewerIsHost };
}

export async function listDriverBookings(driverId: string): Promise<BookingWithSpot[]> {
  const rows = must(
    await api()
      .from("bookings")
      .select(BOOKING_WITH_SPOT)
      .eq(B.driverId, driverId)
      .in(B.status, ["confirmed", "cancelled", "pending_payment"])
      .order(B.startsAt, { ascending: false })
      .limit(200),
    "listDriverBookings",
  );
  return rows.map((r: unknown) => ({ ...bookingWithSpot(r), driverName: "", viewerIsHost: false }));
}

export async function listAccountBookings(accountId: string): Promise<BookingWithSpot[]> {
  const rows = must(
    await api()
      .from("bookings")
      .select(BOOKING_WITH_SPOT)
      .eq(`spot.${names(spots).hostAccountId}`, accountId)
      .in(B.status, ["confirmed", "cancelled"])
      .gt(B.endsAt, new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString())
      .order(B.startsAt)
      .limit(200),
    "listAccountBookings",
  ).map(bookingWithSpot);
  const firstNameOf = await firstNames(rows.map((r: { driverId: string }) => r.driverId));
  return rows.map((r: ReturnType<typeof bookingWithSpot>) => ({ ...r, driverName: firstNameOf.get(r.driverId) ?? "", viewerIsHost: true }));
}

async function firstNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = must<{ id: string; name: string }[]>(await api().from("users").select("id,name").in(names(users).id, unique), "firstNames");
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
    must(await api().from("bookings").update({ [B.status]: "expired" }).eq(B.id, booking.id).eq(B.status, "pending_payment"), "cancelBooking");
    return { ok: true };
  }
  if (booking.status !== "confirmed") return { ok: false, error: "Bokningen är inte aktiv." };
  if (booking.endsAt <= now) return { ok: false, error: "Bokningen har redan passerat." };

  const asHost = booking.viewerIsHost && booking.driverId !== userId;
  // While the host still hasn't registered the car, the driver can always cancel with a full refund.
  const waitingForHost = booking.vehicleRegistration === "pending";
  if (!asHost && !waitingForHost && now > driverCancellationDeadline(booking, booking.spot.cancellationHours)) {
    return { ok: false, error: "Det är för sent att avboka kostnadsfritt. Kontakta supporten om något har hänt." };
  }

  // Only one cancellation wins: the update requires the booking to still be confirmed.
  const updated = must(
    await api()
      .from("bookings")
      .update(toDb(bookings, { status: "cancelled", cancelledAt: now, cancelledBy: asHost ? "host" : "driver", paymentStatus: "refunded" }))
      .eq(B.id, booking.id)
      .eq(B.status, "confirmed")
      .select(B.id),
    "cancelBooking",
  );
  if (updated.length === 0) return { ok: false, error: "Bokningen är inte aktiv." };
  if (booking.paymentRef) {
    try {
      await getPaymentProvider().refund({ ref: booking.paymentRef, amountOre: booking.totalOre });
    } catch (err) {
      // Put the booking back, so a failed refund doesn't leave a cancelled booking unpaid back.
      await api()
        .from("bookings")
        .update(toDb(bookings, { status: "confirmed", cancelledAt: null, cancelledBy: null, paymentStatus: "paid" }))
        .eq(B.id, booking.id);
      throw err;
    }
  }
  const when = formatRange(booking.startsAt, booking.endsAt);
  if (asHost) {
    await notifyUsers([booking.driverId], {
      kind: "booking_cancelled",
      title: `Din bokning av ${booking.spot.title} är avbokad`,
      body: `Uthyraren har avbokat din bokning ${when}. Du får tillbaka hela beloppet, ${formatSek(booking.totalOre)}, inom några bankdagar.`,
      href: `/bokning/${booking.id}`,
    });
  } else {
    await notifyAccount(booking.spot.hostAccountId, {
      kind: "booking_cancelled",
      title: `Avbokning: ${booking.spot.title}`,
      body: `${booking.driverName} har avbokat ${when}. Platsen är ledig igen.`,
      href: `/bokning/${booking.id}`,
    });
  }
  return { ok: true };
}

/** The host confirms that the driver's car has been registered in the association's parking system. */
export async function markVehicleRegistered(bookingId: string, userId: string) {
  const booking = await getBookingForUser(bookingId, userId);
  if (!booking || !booking.viewerIsHost) return false;
  const updated = must(
    await api()
      .from("bookings")
      .update(toDb(bookings, { vehicleRegistration: "done", vehicleRegisteredAt: new Date() }))
      .eq(B.id, bookingId)
      .eq(B.vehicleRegistration, "pending")
      .select(B.id),
    "markVehicleRegistered",
  );
  if (updated.length && booking.status === "confirmed") {
    await notifyUsers([booking.driverId], {
      kind: "vehicle_registered",
      title: `${booking.vehicleReg} är registrerad för ${booking.spot.title}`,
      body: `Uthyraren har registrerat din bil i föreningens system. Du kan parkera ${formatRange(booking.startsAt, booking.endsAt)}.`,
      href: `/bokning/${booking.id}`,
    });
  }
  return true;
}

export async function listVehicles(userId: string): Promise<Vehicle[]> {
  const V = names(vehicles);
  return parseAll(vehicles, must(await api().from("vehicles").select(cols(vehicles)).eq(V.userId, userId).order(V.createdAt), "listVehicles"));
}
