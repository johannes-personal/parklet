import "server-only";
import type Stripe from "stripe";
import { api, cols, must, names, parse, toDb } from "@/db/api";
import { bookings, stripeEvents } from "@/db/schema";
import { formatSek } from "@/lib/money";
import { releaseCheckoutSession, settleCheckoutSession } from "./checkout";
import { notifyAdmins } from "./notifications";
import { syncPayoutAccount } from "./payouts";

/**
 * Stripe's webhook events (POST /api/stripe/webhook). Subscribe the endpoint for
 * your account to the checkout.session.* and refund events below, and a second
 * endpoint for connected accounts to account.updated.
 *
 * Stripe delivers at least once and in no particular order, so every handler only
 * moves a booking or account forward from the state it expects, and a handled event
 * is recorded so a redelivery is acknowledged without running again. An event is
 * recorded only after it was handled: if handling fails, Stripe retries it.
 */

const B = names(bookings);
const E = names(stripeEvents);

export const HANDLED_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "account.updated",
  "charge.refunded",
  "refund.failed",
  "refund.updated",
] as const;

export async function handleStripeEvent(event: Stripe.Event): Promise<"handled" | "duplicate" | "ignored"> {
  if (!(HANDLED_EVENTS as readonly string[]).includes(event.type)) return "ignored";
  const seen = must<unknown[]>(await api().from("stripe_events").select(E.id).eq(E.id, event.id).limit(1), "handleStripeEvent");
  if (seen.length) return "duplicate";

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await settleCheckoutSession(event.data.object);
      break;
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired":
      await releaseCheckoutSession(event.data.object.id);
      break;
    case "account.updated":
      await syncPayoutAccount(event.data.object.id);
      break;
    case "charge.refunded":
      await chargeRefunded(event.data.object);
      break;
    case "refund.failed":
    case "refund.updated":
      if (event.data.object.status === "failed") await refundFailed(event.data.object);
      break;
  }

  must(await api().from("stripe_events").upsert(toDb(stripeEvents, { id: event.id, type: event.type }), { ignoreDuplicates: true }), "handleStripeEvent");
  return "handled";
}

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : (v?.id ?? null));

async function bookingByPayment(paymentIntent: string | null) {
  if (!paymentIntent) return null;
  const row = must(await api().from("bookings").select(cols(bookings)).eq(B.paymentRef, paymentIntent).maybeSingle(), "bookingByPayment");
  return row ? parse(bookings, row) : null;
}

/**
 * The whole charge was refunded. Parklet's own cancellations have recorded that
 * already; this catches refunds made in Stripe's dashboard, which also end the booking.
 */
async function chargeRefunded(charge: Stripe.Charge) {
  if (!charge.refunded) return; // partly refunded: nothing changes for the booking
  const booking = await bookingByPayment(idOf(charge.payment_intent));
  if (!booking || booking.paymentStatus === "refunded") return;
  must(
    await api()
      .from("bookings")
      .update(
        toDb(bookings, {
          paymentStatus: "refunded",
          ...(booking.status === "confirmed" ? { status: "cancelled" as const, cancelledAt: new Date() } : {}),
        }),
      )
      .eq(B.id, booking.id)
      .eq(B.paymentStatus, "paid"),
    "chargeRefunded",
  );
}

/**
 * A refund Stripe accepted failed later (e.g. the card was closed). The booking goes
 * back to "cancelled but paid", which always means money is owed back, and the admins
 * are told to sort it out with the driver.
 */
async function refundFailed(refund: Stripe.Refund) {
  const booking = await bookingByPayment(idOf(refund.payment_intent));
  if (!booking) return;
  const reopened = must<unknown[]>(
    await api().from("bookings").update(toDb(bookings, { paymentStatus: "paid" })).eq(B.id, booking.id).eq(B.paymentStatus, "refunded").select(B.id),
    "refundFailed",
  );
  // refund.failed and refund.updated both report it: tell the admins once.
  if (!reopened.length) return;
  await notifyAdmins({
    kind: "refund_failed",
    title: "Återbetalning misslyckades hos Stripe",
    body: `Återbetalningen av ${formatSek(refund.amount)} för bokning ${booking.id} (betalning ${booking.paymentRef}) misslyckades: ${refund.failure_reason ?? "okänd orsak"}. Kontakta föraren och återbetala på annat sätt.`,
    href: "/admin",
  });
}
