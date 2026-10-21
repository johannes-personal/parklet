import "server-only";
import { randomUUID } from "node:crypto";
import { getStripe, PaymentsMisconfigured, stripeConfig } from "./stripe";

/**
 * Payment provider boundary. PAYMENT_PROVIDER picks it for new bookings; each
 * booking remembers its provider (`payment_provider`), so a booking paid in the
 * mock is never refunded through Stripe.
 *
 * - stripe: Stripe Connect. Parklet never holds the money itself. The driver pays
 *   on Stripe Checkout (src/server/checkout.ts) with a destination charge: the
 *   PaymentIntent is created on the platform with `transfer_data.destination` =
 *   the host's connected account and `application_fee_amount` = Parklet's service
 *   fee. Stripe carries the licence, KYC/AML on hosts (src/server/payouts.ts),
 *   SCA/3-D Secure for drivers and the payouts. Bookings are confirmed when the
 *   driver returns from Checkout or by the webhook, whichever comes first.
 * - mock: walks the same states (hold → checkout → confirm) without moving money,
 *   for development and the demo. Refused in production unless NEXT_PUBLIC_DEMO=1.
 */
export type ProviderName = "mock" | "stripe";

export interface PaymentProvider {
  readonly name: ProviderName;
  /** Mock only: simulate the provider reporting a successful charge. */
  simulateSuccess?(bookingId: string): Promise<{ ref: string }>;
  /** Pays `amountOre` of the charge `ref` back to the driver. Safe to repeat. */
  refund(input: { ref: string; amountOre: number }): Promise<void>;
  /** Closes an unpaid checkout so it can't be paid any more. Best effort: one that's already closed is fine. */
  closeCheckout?(sessionId: string): Promise<void>;
}

const mockProvider: PaymentProvider = {
  name: "mock",
  async simulateSuccess() {
    return { ref: `mock_pi_${randomUUID()}` };
  },
  async refund() {},
};

const stripeProvider: PaymentProvider = {
  name: "stripe",
  async refund({ ref, amountOre }) {
    // A destination charge: take the host's share back from their connected account
    // (reverse_transfer) and Parklet's fee back from the platform (refund_application_fee),
    // so the driver gets everything they paid. Stripe keeps its own processing fee.
    await getStripe().refunds.create(
      { payment_intent: ref, amount: amountOre, reverse_transfer: true, refund_application_fee: true },
      // The same refund twice (a retry, or two cancellations racing) is one refund.
      { idempotencyKey: `refund:${ref}:${amountOre}` },
    );
  },
  async closeCheckout(sessionId) {
    try {
      await getStripe().checkout.sessions.expire(sessionId);
    } catch (err) {
      console.warn("[payments] could not expire checkout session", sessionId, err instanceof Error ? err.message : err);
    }
  },
};

/** The provider new bookings use. Throws when it is misconfigured rather than falling back to the mock. */
export function paymentProviderName(): ProviderName {
  const name = process.env.PAYMENT_PROVIDER || "mock";
  if (name === "stripe") {
    stripeConfig();
    return "stripe";
  }
  if (name === "mock") {
    if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_DEMO !== "1") {
      throw new PaymentsMisconfigured("PAYMENT_PROVIDER=mock takes no money; in production it is only allowed for the demo (NEXT_PUBLIC_DEMO=1)");
    }
    return "mock";
  }
  throw new PaymentsMisconfigured(`Unknown PAYMENT_PROVIDER "${name}"`);
}

/** A provider by name (a booking's `paymentProvider`), or the configured one. */
export function getPaymentProvider(name: string = paymentProviderName()): PaymentProvider {
  if (name === "mock") return mockProvider;
  if (name === "stripe") return stripeProvider;
  throw new PaymentsMisconfigured(`Unknown payment provider "${name}"`);
}
