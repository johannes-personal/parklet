import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { checkoutSessionParams } from "@/server/checkout";
import { connectedAccountParams, payoutStatusOf } from "@/server/payouts";
import { getStripe, verifyWebhook } from "@/server/stripe";

/**
 * Against Stripe's test mode, with the same requests the app makes, to catch a change
 * in Stripe's API (or in our account's Connect settings) that e2e/fake-stripe.mjs
 * can't. Runs with `npm run test:live` when STRIPE_SECRET_KEY is a test key
 * (sk_test_… or rk_test_…) and skips otherwise; it never runs against a live key.
 *
 * Optional: STRIPE_TEST_CONNECTED_ACCOUNT, an Express test account that has finished
 * onboarding (acct_…), to create a Checkout Session with a real destination charge.
 * Without it the session is created without the transfer.
 */
const key = process.env.STRIPE_SECRET_KEY ?? "";
const enabled = /^(sk|rk)_test_/.test(key);

describe.skipIf(!enabled)("Stripe's test mode", () => {
  const created: string[] = [];
  let stripe: Stripe;
  beforeAll(() => {
    // Not used against the API: only the signature test needs one.
    process.env.STRIPE_WEBHOOK_SECRET ||= "whsec_live_test";
    delete process.env.STRIPE_API_BASE;
    stripe = getStripe();
  });
  afterAll(async () => {
    for (const id of created) await stripe.accounts.del(id).catch(() => {});
  });

  it.each([
    ["household", "individual"],
    ["association", "non_profit"],
    ["company", "company"],
  ] as const)("creates a %s's Express account and an onboarding link for it", async (kind, businessType) => {
    const account = { id: "00000000-0000-4000-8000-000000000000", kind, name: kind === "household" ? "Test Testsson" : "Testföreningen", orgNumber: kind === "household" ? null : "556012-5790" };
    const acct = await stripe.accounts.create(connectedAccountParams(account, "test@example.com", "Test Testsson"));
    created.push(acct.id);
    expect(acct).toMatchObject({ country: "SE", default_currency: "sek", business_type: businessType, charges_enabled: false, payouts_enabled: false });
    expect(acct.controller?.stripe_dashboard?.type).toBe("express");
    expect(payoutStatusOf(acct)).toBe("onboarding");

    const link = await stripe.accountLinks.create({
      account: acct.id,
      type: "account_onboarding",
      collection_options: { fields: "eventually_due" },
      return_url: "https://example.com/uthyrare/x/utbetalningar/klar",
      refresh_url: "https://example.com/uthyrare/x/utbetalningar/ny-lank",
    });
    expect(link.url).toMatch(/^https:\/\/connect\.stripe\.com\//);
  });

  it("creates the Checkout Session the app creates, held for 31 minutes, and expires it", async () => {
    const destination = process.env.STRIPE_TEST_CONNECTED_ACCOUNT;
    const start = new Date(Date.now() + 24 * 3600_000);
    const booking = { id: "00000000-0000-4000-8000-000000000001", startsAt: start, endsAt: new Date(start.getTime() + 2 * 3600_000), vehicleReg: "ABC123", baseOre: 4000, feeOre: 500, spot: { title: "Testplats" } };
    const params = checkoutSessionParams(booking, destination ?? "acct_unused", "test@example.com");
    if (!destination) {
      // An account that hasn't finished onboarding can't receive transfers.
      delete params.payment_intent_data!.transfer_data;
      delete params.payment_intent_data!.application_fee_amount;
    }
    const session = await stripe.checkout.sessions.create(params);
    expect(session).toMatchObject({ status: "open", currency: "sek", amount_total: 4500, locale: "sv", metadata: { booking_id: booking.id } });
    expect(session.expires_at - session.created).toBeGreaterThanOrEqual(30 * 60);
    expect(session.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    const expired = await stripe.checkout.sessions.expire(session.id);
    expect(expired.status).toBe("expired");
  });

  it("verifies webhook signatures with the configured secret", () => {
    const payload = JSON.stringify({ id: "evt_live_test", object: "event", type: "account.updated", data: { object: { id: "acct_x" } } });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET!.split(",")[0].trim() });
    expect(verifyWebhook(payload, header).id).toBe("evt_live_test");
    expect(() => verifyWebhook(payload.replace("acct_x", "acct_y"), header)).toThrow();
  });
});
