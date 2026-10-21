import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { closeDb, db } from "./direct-db";
import { bookings, hostAccounts, stripeEvents } from "@/db/schema";
import { POST as webhook } from "@/app/api/stripe/webhook/route";
import { GET as checkoutReturn } from "@/app/betala/[id]/klar/route";
import { appUrl } from "@/lib/app-url";
import { cancelBooking, createBooking } from "@/server/bookings";
import { CHECKOUT_SESSION_SECONDS, startCheckout } from "@/server/checkout";
import { getPaymentProvider, paymentProviderName } from "@/server/payments";
import { getStripe } from "@/server/stripe";
import { allMail, allNotifications, getBooking, hoursFromNow, makeAdmin, makeBookableSpot, makeUser, notificationsOf, resetDb } from "./helpers";
import { deliver, withFakeStripe } from "./stripe-helpers";

const stripe = withFakeStripe();
beforeEach(async () => {
  await resetDb();
  stripe.fake.config.webhooks = true;
});
afterAll(async () => {
  vi.restoreAllMocks();
  await closeDb();
});

/* eslint-disable @typescript-eslint/no-explicit-any -- the fake's state is untyped JavaScript */
const state = () => stripe.fake.state as any;
const sessionsOf = (bookingId: string) => Object.values(state().sessions as Record<string, any>).filter((s) => s.metadata.booking_id === bookingId);
const refundsOf = (paymentIntent: string) => Object.values(state().refunds as Record<string, any>).filter((r) => r.payment_intent === paymentIntent);

/** A bookable spot whose host has a connected account, and a held booking on it. */
async function heldBooking(hours = 48) {
  const spot = await makeBookableSpot();
  await db.update(hostAccounts).set({ payoutAccountRef: "acct_vitesthost" }).where(eq(hostAccounts.id, spot.account.id));
  const driver = await makeUser("Dora Förare");
  const r = await createBooking({ driverId: driver.id, spotId: spot.spotId, start: hoursFromNow(hours), end: hoursFromNow(hours + 2), vehicleReg: "ABC123" });
  if (!r.ok) throw new Error(r.error);
  return { ...spot, driver, bookingId: r.bookingId };
}

async function checkout(bookingId: string, driver: { id: string; email: string }) {
  const started = await startCheckout(bookingId, driver);
  if (!started.ok) throw new Error(started.error);
  const session = sessionsOf(bookingId).at(-1);
  return { url: started.url, session };
}

const returnTo = (bookingId: string, sessionId: string) =>
  checkoutReturn(new Request(`http://localhost/betala/${bookingId}/klar?session_id=${sessionId}`), { params: Promise.resolve({ id: bookingId }) });

describe("paying with Stripe Checkout", () => {
  it("is what new bookings use, and holds the slot exactly as long as the session can be paid", async () => {
    expect(paymentProviderName()).toBe("stripe");
    const { bookingId, driver } = await heldBooking();
    const booking = await getBooking(bookingId);
    expect(booking.paymentProvider).toBe("stripe");
    // 15 minutes on the summary page...
    expect(booking.holdExpiresAt!.getTime() - Date.now()).toBeLessThanOrEqual(15 * 60_000);

    const before = Math.floor(Date.now() / 1000);
    const { url, session } = await checkout(bookingId, driver);
    expect(url).toBe(session.url);
    // ...then as long as Stripe's session (at least 30 minutes, Stripe's minimum).
    expect(session.expires_at).toBeGreaterThanOrEqual(before + CHECKOUT_SESSION_SECONDS);
    expect(session.expires_at).toBeLessThanOrEqual(before + CHECKOUT_SESSION_SECONDS + 5);
    expect(await getBooking(bookingId)).toMatchObject({ checkoutSessionId: session.id, holdExpiresAt: new Date(session.expires_at * 1000), status: "pending_payment" });
  });

  it("charges the driver the total in öre, sends the host's share to their account and keeps the fee", async () => {
    const { bookingId, driver } = await heldBooking();
    const booking = await getBooking(bookingId);
    // 2 h × 20 kr = 40 kr, and the minimum service fee of 5 kr.
    expect(booking).toMatchObject({ baseOre: 4000, feeOre: 500, totalOre: 4500 });
    const { session } = await checkout(bookingId, driver);
    expect(session).toMatchObject({ mode: "payment", currency: "sek", locale: "sv", amount_total: 4500, customer_email: driver.email, client_reference_id: bookingId });
    expect(session._line_items.map((li: any) => [li.price_data.currency, li.price_data.unit_amount, li.quantity])).toEqual([
      ["sek", 4000, 1],
      ["sek", 500, 1],
    ]);
    expect(session._payment_intent_data).toMatchObject({ application_fee_amount: 500, transfer_data: { destination: "acct_vitesthost" }, metadata: { booking_id: bookingId } });
    expect(session.success_url).toBe(`${appUrl()}/betala/${bookingId}/klar?session_id={CHECKOUT_SESSION_ID}`);
    expect(session.cancel_url).toBe(`${appUrl()}/betala/${bookingId}?avbruten=1`);
  });

  it("reuses the open session when the driver presses Betala again, so the hold can't be stretched", async () => {
    const { bookingId, driver } = await heldBooking();
    const first = await checkout(bookingId, driver);
    const hold = (await getBooking(bookingId)).holdExpiresAt;
    expect(await startCheckout(bookingId, driver)).toEqual({ ok: true, url: first.url });
    expect(await startCheckout(bookingId, driver)).toEqual({ ok: true, url: first.url });
    expect(sessionsOf(bookingId)).toHaveLength(1);
    expect((await getBooking(bookingId)).holdExpiresAt).toEqual(hold);
  });

  it("refuses to start when the host's account can't take payments, or the hold has run out", async () => {
    const { bookingId, driver, account } = await heldBooking();
    await db.update(hostAccounts).set({ payoutStatus: "restricted" }).where(eq(hostAccounts.id, account.id));
    expect(await startCheckout(bookingId, driver)).toEqual({ ok: false, error: "Uthyraren kan inte ta emot betalningar just nu. Ingen betalning har dragits." });
    await db.update(hostAccounts).set({ payoutStatus: "active" }).where(eq(hostAccounts.id, account.id));
    await db.update(bookings).set({ holdExpiresAt: sql`now() - interval '1 second'` }).where(eq(bookings.id, bookingId));
    expect(await startCheckout(bookingId, driver)).toEqual({ ok: false, error: "Reservationen har gått ut. Ingen betalning har dragits. Boka igen." });
    expect(sessionsOf(bookingId)).toHaveLength(0);
  });

  it("confirms the booking on the return URL, without waiting for the webhook, and the webhook then changes nothing", async () => {
    const { bookingId, driver } = await heldBooking();
    const { session } = await checkout(bookingId, driver);
    await stripe.control(`sessions/${session.id}/pay`);

    const res = await returnTo(bookingId, session.id);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`http://localhost/bokning/${bookingId}?bekraftad=1`);
    const confirmed = await getBooking(bookingId);
    expect(confirmed).toMatchObject({ status: "confirmed", paymentStatus: "paid", paymentRef: state().sessions[session.id].payment_intent, holdExpiresAt: null });
    const notes = await allNotifications();
    expect(notes.map((n) => n.kind).sort()).toEqual(["booking_confirmed", "booking_new"]);
    const mail = await allMail();

    // The webhook arrives afterwards, then Stripe delivers it once more.
    const event = stripe.lastEvent("checkout.session.completed");
    expect(await deliver(event)).toMatchObject({ status: 200, body: JSON.stringify({ received: true, result: "handled" }) });
    expect(await deliver(event)).toMatchObject({ status: 200, body: JSON.stringify({ received: true, result: "duplicate" }) });
    expect(await getBooking(bookingId)).toEqual(confirmed);
    expect(await allNotifications()).toEqual(notes);
    expect(await allMail()).toEqual(mail);
    // Coming back to the return URL again just shows the booking.
    expect((await returnTo(bookingId, session.id)).headers.get("location")).toBe(`http://localhost/bokning/${bookingId}?bekraftad=1`);
  });

  it("confirms the booking from the webhook alone when the driver never comes back", async () => {
    const { bookingId, driver } = await heldBooking();
    const { session } = await checkout(bookingId, driver);
    await stripe.control(`sessions/${session.id}/pay`);
    expect((await deliver(stripe.lastEvent("checkout.session.completed"))).status).toBe(200);
    expect(await getBooking(bookingId)).toMatchObject({ status: "confirmed", paymentStatus: "paid" });
    expect(await db.select().from(stripeEvents)).toHaveLength(1);
  });

  it("does not confirm from a return URL that names another booking's session, or an unpaid one", async () => {
    const a = await heldBooking(48);
    const b = await heldBooking(72);
    const sa = (await checkout(a.bookingId, a.driver)).session;
    await stripe.control(`sessions/${sa.id}/pay`);
    const res = await returnTo(b.bookingId, sa.id);
    expect(res.headers.get("location")).toBe(`http://localhost/betala/${b.bookingId}?fel=1`);
    const sb = (await checkout(b.bookingId, b.driver)).session;
    expect((await returnTo(b.bookingId, sb.id)).headers.get("location")).toBe(`http://localhost/betala/${b.bookingId}?fel=1`);
    expect(await getBooking(b.bookingId)).toMatchObject({ status: "pending_payment", paymentStatus: "unpaid" });
  });

  it("releases the slot when the session expires unpaid, so someone else can book it", async () => {
    const { bookingId, driver, spotId } = await heldBooking();
    const { session } = await checkout(bookingId, driver);
    await stripe.control(`sessions/${session.id}/expire`);
    expect((await deliver(stripe.lastEvent("checkout.session.expired"))).status).toBe(200);
    const released = await getBooking(bookingId);
    expect(released).toMatchObject({ status: "expired", paymentStatus: "unpaid" });

    const other = await makeUser("Snabb Förare");
    const again = await createBooking({ driverId: other.id, spotId, start: released.startsAt, end: released.endsAt, vehicleReg: "XYZ987" });
    expect(again.ok).toBe(true);
  });

  it("closes Stripe's page when the driver cancels the pending booking", async () => {
    const { bookingId, driver } = await heldBooking();
    const { session } = await checkout(bookingId, driver);
    expect(await cancelBooking(bookingId, driver.id)).toEqual({ ok: true });
    expect(state().sessions[session.id].status).toBe("expired");
    expect(await getBooking(bookingId)).toMatchObject({ status: "expired" });
  });

  it("keeps a late payment when the slot is still free", async () => {
    const { bookingId, driver } = await heldBooking();
    const { session } = await checkout(bookingId, driver);
    // The hold ran out (and was even marked expired) while the payment was on its way.
    await db.update(bookings).set({ status: "expired", holdExpiresAt: sql`now() - interval '1 minute'` }).where(eq(bookings.id, bookingId));
    await stripe.control(`sessions/${session.id}/pay`);
    expect((await deliver(stripe.lastEvent("checkout.session.completed"))).status).toBe(200);
    expect(await getBooking(bookingId)).toMatchObject({ status: "confirmed", paymentStatus: "paid" });
    expect(refundsOf(state().sessions[session.id].payment_intent)).toEqual([]);
  });

  it("refunds a late payment in full when someone else has booked the released slot: never a double booking", async () => {
    const { bookingId, driver, spotId } = await heldBooking();
    const { session } = await checkout(bookingId, driver);
    const held = await getBooking(bookingId);
    // The hold runs out and another driver takes the slot.
    await db.update(bookings).set({ holdExpiresAt: sql`now() - interval '1 minute'` }).where(eq(bookings.id, bookingId));
    const other = await makeUser("Snabb Förare");
    const taken = await createBooking({ driverId: other.id, spotId, start: held.startsAt, end: held.endsAt, vehicleReg: "XYZ987" });
    expect(taken.ok).toBe(true);

    await stripe.control(`sessions/${session.id}/pay`);
    const res = await returnTo(bookingId, session.id);
    expect(res.headers.get("location")).toBe(`http://localhost/bokning/${bookingId}`);
    const pi = state().sessions[session.id].payment_intent;
    expect(await getBooking(bookingId)).toMatchObject({ status: "expired", paymentStatus: "refunded", paymentRef: pi });
    expect(refundsOf(pi)).toMatchObject([{ amount: held.totalOre, _reverse_transfer: true, _refund_application_fee: true }]);
    const [note] = await notificationsOf(driver.id);
    expect(note).toMatchObject({ kind: "payment_refunded", title: "Betalningen för Testplats återbetalas" });

    // The webhook for the same payment: no second refund, no second message.
    expect((await deliver(stripe.lastEvent("checkout.session.completed"))).status).toBe(200);
    expect(refundsOf(pi)).toHaveLength(1);
    expect(await notificationsOf(driver.id)).toHaveLength(1);
    const holders = await db.select().from(bookings).where(sql`${bookings.spotId} = ${spotId} and ${bookings.status} in ('pending_payment', 'confirmed')`);
    expect(holders.map((h) => h.driverId)).toEqual([other.id]);
  });
});

describe("refunds through Stripe", () => {
  async function paidBooking() {
    const held = await heldBooking();
    const { session } = await checkout(held.bookingId, held.driver);
    await stripe.control(`sessions/${session.id}/pay`);
    await returnTo(held.bookingId, session.id);
    return { ...held, paymentIntent: state().sessions[session.id].payment_intent as string };
  }

  it("refunds everything on cancellation, reversing the transfer and the application fee", async () => {
    const { bookingId, driver, paymentIntent } = await paidBooking();
    const booking = await getBooking(bookingId);
    expect(await cancelBooking(bookingId, driver.id)).toEqual({ ok: true });
    expect(await getBooking(bookingId)).toMatchObject({ status: "cancelled", paymentStatus: "refunded", cancelledBy: "driver" });
    expect(refundsOf(paymentIntent)).toMatchObject([{ amount: booking.totalOre, status: "succeeded", _reverse_transfer: true, _refund_application_fee: true }]);
    const request = state().requests.find((r: any) => r.path === "/v1/refunds" && r.body.payment_intent === paymentIntent);
    expect(request.idempotencyKey).toBe(`refund:${paymentIntent}:${booking.totalOre}`);
    // Stripe's charge.refunded for it changes nothing more.
    expect((await deliver(stripe.lastEvent("charge.refunded"))).status).toBe(200);
    expect(await getBooking(bookingId)).toMatchObject({ status: "cancelled", paymentStatus: "refunded", cancelledBy: "driver" });
  });

  it("keeps the booking when Stripe refuses the refund", async () => {
    const { bookingId, driver } = await paidBooking();
    vi.spyOn(getPaymentProvider("stripe"), "refund").mockRejectedValueOnce(new Error("stripe down"));
    await expect(cancelBooking(bookingId, driver.id)).rejects.toThrow("stripe down");
    expect(await getBooking(bookingId)).toMatchObject({ status: "confirmed", paymentStatus: "paid", cancelledAt: null });
  });

  it("ends the booking when it is refunded in Stripe's dashboard", async () => {
    const { bookingId, paymentIntent } = await paidBooking();
    await getStripe().refunds.create({ payment_intent: paymentIntent });
    expect((await deliver(stripe.lastEvent("charge.refunded"))).status).toBe(200);
    expect(await getBooking(bookingId)).toMatchObject({ status: "cancelled", paymentStatus: "refunded" });
  });

  it("marks a refund that failed later as owed again and tells the admins once", async () => {
    const admin = await makeAdmin();
    const { bookingId, driver, paymentIntent } = await paidBooking();
    await cancelBooking(bookingId, driver.id);
    const failed = { id: "re_failed", object: "refund", status: "failed", amount: 4500, payment_intent: paymentIntent, failure_reason: "expired_or_canceled_card" };
    expect((await deliver({ id: "evt_refund_failed", type: "refund.failed", data: { object: failed } })).status).toBe(200);
    expect((await deliver({ id: "evt_refund_updated", type: "refund.updated", data: { object: failed } })).status).toBe(200);
    expect(await getBooking(bookingId)).toMatchObject({ status: "cancelled", paymentStatus: "paid" });
    const notes = (await notificationsOf(admin.id)).filter((n) => n.kind === "refund_failed");
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toContain("expired_or_canceled_card");
  });
});

describe("the webhook endpoint", () => {
  const event = { id: "evt_unrelated", type: "customer.created", data: { object: { id: "cus_1" } } };

  it("refuses requests that aren't signed with the endpoint's secret", async () => {
    const unsigned = await webhook(new Request("http://localhost/api/stripe/webhook", { method: "POST", body: JSON.stringify(event) }));
    expect(unsigned.status).toBe(400);
    expect((await deliver(event, { secret: "whsec_someone_else" })).status).toBe(400);
    // A replayed delivery from long ago.
    expect((await deliver(event, { timestamp: Math.floor(Date.now() / 1000) - 3600 })).status).toBe(400);
    expect(await deliver(event)).toMatchObject({ status: 200, body: JSON.stringify({ received: true, result: "ignored" }) });
  });

  it("accepts the secret of the connected-accounts endpoint too", async () => {
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_vitest, whsec_connect";
    try {
      expect((await deliver(event, { secret: "whsec_connect" })).status).toBe(200);
      expect((await deliver(event, { secret: "whsec_other" })).status).toBe(400);
    } finally {
      process.env.STRIPE_WEBHOOK_SECRET = "whsec_vitest";
    }
  });

  it("answers 500 when handling fails, so Stripe retries, and doesn't record the event", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { bookingId, driver } = await heldBooking();
    const { session } = await checkout(bookingId, driver);
    await stripe.control(`sessions/${session.id}/pay`);
    const completed = stripe.lastEvent("checkout.session.completed");
    const broken = { ...completed, data: { object: { ...completed.data.object, payment_intent: null } } };
    expect((await deliver(broken)).status).toBe(500);
    expect(await db.select().from(stripeEvents)).toEqual([]);
    expect((await deliver(completed)).status).toBe(200);
    expect(await getBooking(bookingId)).toMatchObject({ status: "confirmed" });
    consoleError.mockRestore();
  });
});

describe("configuration", () => {
  it("fails loudly when Stripe is half-configured instead of falling back to the mock", async () => {
    const saved = { ...process.env };
    try {
      delete process.env.STRIPE_WEBHOOK_SECRET;
      expect(() => paymentProviderName()).toThrow("PAYMENT_PROVIDER=stripe needs STRIPE_WEBHOOK_SECRET");
      delete process.env.STRIPE_SECRET_KEY;
      expect(() => paymentProviderName()).toThrow("needs STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET");
      Object.assign(process.env, { STRIPE_SECRET_KEY: "sk_live_x", STRIPE_WEBHOOK_SECRET: "whsec_x" });
      expect(() => paymentProviderName()).toThrow("STRIPE_API_BASE is for tests");
      const spot = await makeBookableSpot();
      const driver = await makeUser();
      await expect(createBooking({ driverId: driver.id, spotId: spot.spotId, start: hoursFromNow(24), end: hoursFromNow(26), vehicleReg: "ABC123" })).rejects.toThrow(
        "STRIPE_API_BASE is for tests",
      );
      Object.assign(process.env, { PAYMENT_PROVIDER: "mock", NODE_ENV: "production" });
      delete process.env.NEXT_PUBLIC_DEMO;
      expect(() => paymentProviderName()).toThrow("only allowed for the demo");
      process.env.NEXT_PUBLIC_DEMO = "1";
      expect(paymentProviderName()).toBe("mock");
    } finally {
      for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
      Object.assign(process.env, saved);
    }
  });
});
