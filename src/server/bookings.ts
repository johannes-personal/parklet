import "server-only";
import { api, ApiError, cols, embed, must, names, parse, parseAll, rpc, toDb } from "@/db/api";
import { bookings, hostAccountMembers, hostAccounts, spots, users, vehicles, type Booking, type HostAccount, type Spot, type Vehicle } from "@/db/schema";
import { isWithinWindows } from "@/lib/availability";
import { calculatePrice, durationMinutes, type PriceBreakdown } from "@/lib/pricing";
import { formatSek } from "@/lib/money";
import { formatDateTime, formatDuration, formatRange } from "@/lib/time";
import { isUuid } from "./ids";
import { notifyAccount, notifyAdmins, notifyUsers } from "./notifications";
import { getPaymentProvider, paymentProviderName } from "./payments";
import { getSpotWithAccount, isBookable, type SpotWithWindows } from "./spots";
import { approveVehicle, isVehicleApproved } from "./vehicle-approvals";

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
const holdingFilter = (now: Date) => `${B.status}.eq.confirmed,and(${B.status}.eq.pending_payment,${B.holdExpiresAt}.gt.${now.toISOString()})`;

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
  // A car the host has already registered for the spot needs no new registration.
  const registered = spot.requiresVehicleRegistration && (await isVehicleApproved(spot.id, input.vehicleReg));

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
      p_vehicle_registration: !spot.requiresVehicleRegistration ? "not_required" : registered ? "done" : "pending",
      p_base_ore: price.baseOre,
      p_fee_ore: price.feeOre,
      p_total_ore: price.totalOre,
      p_payment_provider: paymentProviderName(),
      p_hold_minutes: HOLD_MINUTES,
    });
    if (registered) {
      must(await api().from("bookings").update(toDb(bookings, { vehicleRegisteredAt: new Date() })).eq(B.id, bookingId), "createBooking");
    }
    return { ok: true, bookingId };
  } catch (err) {
    if (isExclusionViolation(err)) {
      return { ok: false, error: "Tyvärr, någon annan har redan bokat platsen under den här tiden. Välj en annan tid." };
    }
    throw err;
  }
}

/**
 * The mock checkout's confirmation. Idempotent: confirming twice is a no-op.
 * Stripe payments are confirmed by settleCheckoutSession (src/server/checkout.ts),
 * which also handles a payment arriving after the hold.
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
export async function announceBooking(bookingId: string) {
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
  // Registered from the start: a car the host registered for the spot before.
  const known = spot.requiresVehicleRegistration && booking.vehicleRegistration === "done";
  const details: [string, string][] = [
    ["Plats", `${spot.title}, ${spot.address}, ${spot.city}`],
    ["Tid", when],
    ["Bil", booking.vehicleReg],
    ["Bokad", formatDateTime(booking.confirmedAt ?? booking.createdAt)],
  ];
  await notifyAccount(spot.hostAccountId, {
    kind: register ? "vehicle_registration" : "booking_new",
    title: register ? `Registrera ${booking.vehicleReg} – ny bokning av ${spot.title}` : `Ny bokning: ${spot.title}`,
    body:
      `${driverName} har bokat ${spot.title}.` +
      (known ? `\n\n${booking.vehicleReg} är redan registrerad för platsen, så du behöver inte göra något.` : "") +
      (register
        ? `\n\nFöreningen kräver att bilen registreras. Registrera ${booking.vehicleReg} i föreningens parkeringssystem före ${formatDateTime(booking.startsAt)} och markera den som registrerad i Parklet, så att föraren vet att det är klart.`
        : ""),
    details: [...details, ["Din intäkt", formatSek(booking.baseOre)]],
    href: `/bokning/${booking.id}`,
    cta: register ? "Markera bilen som registrerad" : "Visa bokningen",
  });
  await notifyUsers([booking.driverId], {
    kind: "booking_confirmed",
    accountId: spot.hostAccountId,
    title: `Bokningsbekräftelse: ${spot.title}`,
    body:
      `Din parkering är bokad och betald. Vägbeskrivning och eventuell portkod finns i bokningen.` +
      (register ? `\n\nPlatsen kräver att bilen registreras av uthyraren. Vi meddelar dig när ${booking.vehicleReg} är registrerad.` : "") +
      (known ? `\n\n${booking.vehicleReg} är redan registrerad hos föreningen, så du kan parkera direkt när bokningen börjar.` : ""),
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
  const names = await driverNames([booking.driverId]);
  return { ...booking, driverName: names.get(booking.driverId) ?? "", viewerIsHost };
}

/** Any booking, for Parklet's admins: the spot, its host account and the driver. */
export async function getBookingForAdmin(bookingId: string) {
  if (!isUuid(bookingId)) return null;
  const row = must<(Record<string, unknown> & { spot: { account: { id: string; name: string; kind: HostAccount["kind"] } }; driver: { id: string; name: string; email: string } }) | null>(
    await api()
      .from("bookings")
      .select(
        `${cols(bookings)},spot:spots!inner(${cols(spots, ["id", "title", "address", "city"])},${embed("account", hostAccounts, ["id", "name", "kind"], { inner: true })}),${embed("driver", users, ["id", "name", "email"], { inner: true })}`,
      )
      .eq(B.id, bookingId)
      .maybeSingle(),
    "getBookingForAdmin",
  );
  if (!row) return null;
  const { account, ...spot } = row.spot as unknown as Pick<Spot, "id" | "title" | "address" | "city"> & { account: { id: string; name: string; kind: HostAccount["kind"] } };
  return { ...parse<typeof bookings, Booking>(bookings, row), spot, account, driver: row.driver };
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
  const nameOf = await driverNames(rows.map((r: { driverId: string }) => r.driverId));
  return rows.map((r: ReturnType<typeof bookingWithSpot>) => ({ ...r, driverName: nameOf.get(r.driverId) ?? "", viewerIsHost: true }));
}

/** The drivers' full names, as their hosts see them on bookings. */
async function driverNames(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = must<{ id: string; name: string }[]>(await api().from("users").select("id,name").in(names(users).id, unique), "driverNames");
  return new Map(rows.map((r) => [r.id, r.name]));
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
    // Close Stripe's page too. A payment that slips through anyway is kept if the slot is
    // still free and refunded if not (src/server/checkout.ts).
    if (booking.checkoutSessionId) await getPaymentProvider(booking.paymentProvider).closeCheckout?.(booking.checkoutSessionId);
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

  // Only one cancellation wins: the update requires the booking to still be confirmed. The
  // payment stays "paid" until the refund has gone through, so a cancelled booking that is
  // still "paid" always means money is owed back (also if this function dies half-way).
  const updated = must(
    await api()
      .from("bookings")
      .update(toDb(bookings, { status: "cancelled", cancelledAt: now, cancelledBy: asHost ? "host" : "driver" }))
      .eq(B.id, booking.id)
      .eq(B.status, "confirmed")
      .select(B.id),
    "cancelBooking",
  );
  if (updated.length === 0) return { ok: false, error: "Bokningen är inte aktiv." };
  if (booking.paymentRef && booking.paymentStatus === "paid") {
    try {
      await getPaymentProvider(booking.paymentProvider).refund({ ref: booking.paymentRef, amountOre: booking.totalOre });
    } catch (err) {
      await undoCancellation(booking, err);
      throw err;
    }
    must(
      await api().from("bookings").update(toDb(bookings, { paymentStatus: "refunded" })).eq(B.id, booking.id).eq(B.status, "cancelled"),
      "cancelBooking",
    );
  }
  const when = formatRange(booking.startsAt, booking.endsAt);
  if (asHost) {
    await notifyUsers([booking.driverId], {
      kind: "booking_cancelled",
      accountId: booking.spot.hostAccountId,
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

/**
 * The refund failed: make the booking confirmed again, so the driver keeps the spot they
 * paid for. If someone booked the freed time in the meantime that is no longer possible;
 * the booking then stays cancelled and paid, and the admins are told to refund by hand.
 */
async function undoCancellation(booking: BookingWithSpot, cause: unknown) {
  try {
    must(
      await api()
        .from("bookings")
        .update(toDb(bookings, { status: "confirmed", cancelledAt: null, cancelledBy: null }))
        .eq(B.id, booking.id)
        .eq(B.status, "cancelled"),
      "cancelBooking",
    );
  } catch (err) {
    console.error("[cancelBooking] refund failed and the booking could not be restored", booking.id, cause, err);
    await notifyAdmins({
      kind: "refund_failed",
      accountId: booking.spot.hostAccountId,
      title: `Återbetalning misslyckades: ${booking.spot.title}`,
      body: `Bokningen ${formatRange(booking.startsAt, booking.endsAt)} är avbokad men ${formatSek(booking.totalOre)} har inte betalats tillbaka. Återbetala manuellt (bokning ${booking.id}, betalning ${booking.paymentRef}).`,
      href: "/admin",
    });
  }
}

/** The host confirms that the driver's car has been registered in the association's parking system. */
/**
 * The host has registered the booking's car in the association's system. That registers
 * the car for the spot (src/server/vehicle-approvals.ts): this booking and any other
 * waiting with the same car are done, and the next one starts registered.
 */
export async function markVehicleRegistered(bookingId: string, userId: string) {
  const booking = await getBookingForUser(bookingId, userId);
  if (!booking || !booking.viewerIsHost) return false;
  await approveVehicle(booking.spotId, booking.vehicleReg, userId);
  return true;
}

export async function listVehicles(userId: string): Promise<Vehicle[]> {
  const V = names(vehicles);
  return parseAll(vehicles, must(await api().from("vehicles").select(cols(vehicles)).eq(V.userId, userId).order(V.createdAt), "listVehicles"));
}
