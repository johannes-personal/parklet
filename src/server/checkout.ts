import "server-only";
import type Stripe from "stripe";
import { api, ApiError, cols, embed, must, names, parse, toDb } from "@/db/api";
import { bookings, hostAccounts, spots, type Booking } from "@/db/schema";
import { appUrl } from "@/lib/app-url";
import { formatSek } from "@/lib/money";
import { formatRange } from "@/lib/time";
import { announceBooking } from "./bookings";
import { isUuid } from "./ids";
import { notifyAdmins, notifyUsers } from "./notifications";
import { getPaymentProvider } from "./payments";
import { dropMockPayoutAccount, isStripeAccountRef } from "./payouts";
import { returnBase } from "./request-origin";
import { getStripe } from "./stripe";

/**
 * Paying a held booking on Stripe Checkout (hosted), as a destination charge to the
 * host's connected account with Parklet's service fee as the application fee.
 *
 * The hold and the Checkout Session end together. A booking holds its slot for 15
 * minutes (HOLD_MINUTES) while the driver looks at the summary; a Checkout Session
 * lives at least 30 minutes. So when the driver goes on to pay, the hold is moved to
 * the session's own expiry: for exactly as long as Stripe accepts a payment, the slot
 * is the driver's, and once Stripe can't take one any more it is released, by the
 * `checkout.session.expired` webhook or, if that never arrives, by the hold running
 * out (search and new bookings ignore expired holds).
 *
 * A payment can still arrive for a booking that no longer holds its slot: the driver
 * cancelled the pending booking in another tab while Stripe's page was open, or a
 * payment that completed late was reported after the hold ran out. It is kept if the
 * slot is still free (the exclusion constraint decides, so never a double booking)
 * and refunded in full otherwise.
 */

const B = names(bookings);
const A = names(hostAccounts);
/** Stripe's minimum lifetime of a Checkout Session is 30 minutes; a minute's margin for clock skew. */
export const CHECKOUT_SESSION_SECONDS = 31 * 60;

type StartResult = { ok: true; url: string } | { ok: false; error: string };
type BookingForCheckout = Booking & { spot: { title: string; hostAccountId: string } };

const EXPIRED = "Reservationen har gått ut. Ingen betalning har dragits. Boka igen.";

async function loadBooking(bookingId: string): Promise<BookingForCheckout | null> {
  if (!isUuid(bookingId)) return null;
  const row = must<(Record<string, unknown> & { spot: { title: string; hostAccountId: string } }) | null>(
    await api()
      .from("bookings")
      .select(`${cols(bookings)},${embed("spot", spots, ["title", "hostAccountId"], { inner: true })}`)
      .eq(B.id, bookingId)
      .maybeSingle(),
    "loadBooking",
  );
  return row ? { ...parse<typeof bookings, Booking>(bookings, row), spot: row.spot } : null;
}

/** The host's connected account, if it can take payments. One left over from the mock is disconnected. */
async function destinationFor(hostAccountId: string): Promise<string | null> {
  const row = must<{ ref: string | null; status: string } | null>(
    await api().from("host_accounts").select(`ref:${A.payoutAccountRef},status:${A.payoutStatus}`).eq(A.id, hostAccountId).maybeSingle(),
    "destinationFor",
  );
  if (row?.status !== "active" || !row.ref) return null;
  if (isStripeAccountRef(row.ref)) return row.ref;
  await dropMockPayoutAccount(hostAccountId);
  return null;
}

/**
 * The driver's "Betala" on /betala/[id]: the Checkout Session's URL, creating the
 * session the first time. Going back and pressing it again reuses the open session,
 * so the hold can't be stretched by starting over.
 */
export async function startCheckout(bookingId: string, driver: { id: string; email: string }, now = new Date()): Promise<StartResult> {
  const booking = await loadBooking(bookingId);
  if (!booking || booking.driverId !== driver.id) return { ok: false, error: "Bokningen finns inte." };
  if (booking.status === "confirmed") return { ok: true, url: `/bokning/${booking.id}` };
  if (booking.status !== "pending_payment" || !booking.holdExpiresAt || booking.holdExpiresAt <= now) return { ok: false, error: EXPIRED };
  if (booking.checkoutSessionId) return reuse(booking.checkoutSessionId, booking.id);

  const destination = await destinationFor(booking.spot.hostAccountId);
  if (!destination) return { ok: false, error: "Uthyraren kan inte ta emot betalningar just nu. Ingen betalning har dragits." };

  const session = await getStripe().checkout.sessions.create(checkoutSessionParams(booking, destination, driver.email, now, await returnBase()));

  // The hold now ends with the session. Only while the hold is still valid, and only
  // one session per booking (two quick clicks: the other session is closed again).
  const stored = must<{ id: string }[]>(
    await api()
      .from("bookings")
      .update(toDb(bookings, { checkoutSessionId: session.id, holdExpiresAt: new Date(session.expires_at * 1000) }))
      .eq(B.id, booking.id)
      .eq(B.status, "pending_payment")
      .gt(B.holdExpiresAt, new Date().toISOString())
      .is(B.checkoutSessionId, null)
      .select(B.id),
    "startCheckout",
  );
  if (stored.length && session.url) return { ok: true, url: session.url };
  await getPaymentProvider("stripe").closeCheckout?.(session.id);
  const again = await loadBooking(booking.id);
  if (again?.checkoutSessionId && again.status === "pending_payment") return reuse(again.checkoutSessionId, booking.id);
  return { ok: false, error: EXPIRED };
}

/** The Checkout Session for a booking: SEK in öre, Swedish, the fee to Parklet and the rest to the host. */
export function checkoutSessionParams(
  booking: Pick<Booking, "id" | "startsAt" | "endsAt" | "vehicleReg" | "baseOre" | "feeOre"> & { spot: { title: string } },
  destination: string,
  email: string,
  now = new Date(),
  base = appUrl(),
): Stripe.Checkout.SessionCreateParams {
  const description = `${booking.spot.title}, ${formatRange(booking.startsAt, booking.endsAt)}, ${booking.vehicleReg}`;
  const metadata = { booking_id: booking.id };
  return {
    mode: "payment",
    locale: "sv",
    currency: "sek",
    customer_email: email,
    client_reference_id: booking.id,
    metadata,
    line_items: [
      { quantity: 1, price_data: { currency: "sek", unit_amount: booking.baseOre, product_data: { name: `Parkering: ${booking.spot.title}`, description } } },
      { quantity: 1, price_data: { currency: "sek", unit_amount: booking.feeOre, product_data: { name: "Serviceavgift (inkl. moms)" } } },
    ],
    payment_intent_data: {
      // The host gets the parking price, Parklet keeps its service fee.
      application_fee_amount: booking.feeOre,
      transfer_data: { destination },
      description: `Parklet: ${description}`,
      metadata,
    },
    expires_at: Math.floor(now.getTime() / 1000) + CHECKOUT_SESSION_SECONDS,
    success_url: `${base}/betala/${booking.id}/klar?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/betala/${booking.id}?avbruten=1`,
  };
}

async function reuse(sessionId: string, bookingId: string): Promise<StartResult> {
  const session = await getStripe().checkout.sessions.retrieve(sessionId);
  if (session.status === "open" && session.url) return { ok: true, url: session.url };
  if (session.status === "complete") return { ok: true, url: `/betala/${bookingId}/klar?session_id=${session.id}` };
  return { ok: false, error: EXPIRED };
}

export type SettleOutcome = "confirmed" | "already" | "processing" | "refunded" | "unknown";

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : (v?.id ?? null));

/**
 * A completed Checkout Session, from the return URL or the webhook (whichever comes
 * first; both may run at once). Idempotent.
 */
export async function settleCheckoutSession(session: Stripe.Checkout.Session, now = new Date()): Promise<SettleOutcome> {
  const booking = await loadBooking(session.metadata?.booking_id ?? session.client_reference_id ?? "");
  if (!booking) {
    console.error("[checkout] session without a booking", session.id);
    return "unknown";
  }
  // Paid later (an asynchronous payment method): checkout.session.async_payment_succeeded follows.
  if (session.payment_status !== "paid") return "processing";
  const paymentRef = idOf(session.payment_intent);
  if (!paymentRef) throw new Error(`Checkout session ${session.id} is paid but has no PaymentIntent`);
  if (booking.paymentRef === paymentRef) return booking.paymentStatus === "refunded" ? "refunded" : "already";

  const amountOre = session.amount_total ?? 0;
  // The booking's own session, charged what the booking costs (it always is: Parklet set the
  // price). Anything else, e.g. a second session paid after a double click, goes back.
  if (booking.checkoutSessionId !== session.id || amountOre !== booking.totalOre || session.currency !== "sek") {
    await getPaymentProvider("stripe").refund({ ref: paymentRef, amountOre });
    await notifyAdmins({
      kind: "payment_unexpected",
      accountId: booking.spot.hostAccountId,
      title: `Oväntad betalning återbetald: ${booking.spot.title}`,
      body: `Betalningen ${paymentRef} (${formatSek(amountOre)}, session ${session.id}) hörde inte till bokningens betalning och har återbetalats automatiskt. Bokning ${booking.id}.`,
      href: "/admin",
    });
    return "refunded";
  }

  if ((booking.status === "pending_payment" || booking.status === "expired") && booking.endsAt > now) {
    try {
      // Also after the hold ran out: while the row is still pending nobody else can hold the
      // slot, and an expired one is only revived if the exclusion constraint lets it.
      const updated = must<{ id: string }[]>(
        await api()
          .from("bookings")
          .update(toDb(bookings, { status: "confirmed", paymentStatus: "paid", paymentRef, confirmedAt: now, holdExpiresAt: null }))
          .eq(B.id, booking.id)
          .in(B.status, ["pending_payment", "expired"])
          .is(B.paymentRef, null)
          .select(B.id),
        "settleCheckoutSession",
      );
      if (updated.length) {
        await announceBooking(booking.id);
        return "confirmed";
      }
      // Settled by the other path at the same moment.
      const again = await loadBooking(booking.id);
      if (again?.paymentRef === paymentRef) return again.paymentStatus === "refunded" ? "refunded" : "already";
    } catch (err) {
      // 23P01: the slot was released and someone else holds it now.
      if (!(err instanceof ApiError && err.code === "23P01")) throw err;
    }
  }
  return refundLatePayment(booking, paymentRef, amountOre);
}

/** A payment the booking can't take any more: all of it goes back to the driver. */
async function refundLatePayment(booking: BookingForCheckout, paymentRef: string, amountOre: number): Promise<SettleOutcome> {
  await getPaymentProvider("stripe").refund({ ref: paymentRef, amountOre });
  // Recorded once (the booking keeps the refunded charge), and only then is the driver told.
  const marked = must<{ id: string }[]>(
    await api()
      .from("bookings")
      .update(toDb(bookings, { status: "expired", paymentRef, paymentStatus: "refunded", holdExpiresAt: null }))
      .eq(B.id, booking.id)
      .in(B.status, ["pending_payment", "expired"])
      .is(B.paymentRef, null)
      .select(B.id),
    "refundLatePayment",
  );
  if (!marked.length) return "refunded";
  await notifyUsers([booking.driverId], {
    kind: "payment_refunded",
    accountId: booking.spot.hostAccountId,
    title: `Betalningen för ${booking.spot.title} återbetalas`,
    body: `Betalningen kom fram efter att reservationen hade gått ut, och platsen ${formatRange(booking.startsAt, booking.endsAt)} är inte längre ledig. Du får tillbaka hela beloppet, ${formatSek(amountOre)}, inom några bankdagar.`,
    href: `/bokning/${booking.id}`,
  });
  return "refunded";
}

/** The session ended without a payment (expired, or an asynchronous payment failed): release the hold. */
export async function releaseCheckoutSession(sessionId: string): Promise<boolean> {
  const released = must<{ id: string }[]>(
    await api().from("bookings").update({ [B.status]: "expired" }).eq(B.checkoutSessionId, sessionId).eq(B.status, "pending_payment").select(B.id),
    "releaseCheckoutSession",
  );
  return released.length > 0;
}

/** The driver came back from Checkout: settle from Stripe's own record of the session, not from the URL. */
export async function completeCheckoutReturn(bookingId: string, sessionId: string): Promise<SettleOutcome> {
  if (!/^cs_\w+$/.test(sessionId)) return "unknown";
  const session = await getStripe().checkout.sessions.retrieve(sessionId);
  if ((session.metadata?.booking_id ?? session.client_reference_id) !== bookingId || session.status !== "complete") return "unknown";
  return settleCheckoutSession(session);
}
