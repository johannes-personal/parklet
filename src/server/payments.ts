import "server-only";
import { randomUUID } from "node:crypto";

/**
 * Payment provider boundary.
 *
 * Production design (Stripe Connect, see docs/03-mvp.md): Parklet never holds
 * the money itself. Each booking is a PaymentIntent created on the platform
 * with `transfer_data.destination` = the host's connected account and
 * `application_fee_amount` = Parklet's service fee. Stripe carries the
 * licence, KYC/AML on hosts, SCA/3-D Secure for drivers and the payouts.
 * The booking is confirmed by the `payment_intent.succeeded` webhook, never
 * by the browser.
 *
 * The MVP's mock walks the same states (hold → checkout → confirm) without
 * moving money.
 */
export interface PaymentProvider {
  readonly name: string;
  /** Where to send the driver to pay for a held booking. */
  checkoutUrl(bookingId: string): string;
  /** Mock only: simulate the provider reporting a successful charge. */
  simulateSuccess?(bookingId: string): Promise<{ ref: string }>;
  refund(input: { ref: string; amountOre: number }): Promise<void>;
}

const mockProvider: PaymentProvider = {
  name: "mock",
  checkoutUrl: (bookingId) => `/betala/${bookingId}`,
  async simulateSuccess() {
    return { ref: `mock_pi_${randomUUID()}` };
  },
  async refund() {},
};

export function getPaymentProvider(): PaymentProvider {
  const name = process.env.PAYMENT_PROVIDER ?? "mock";
  if (name === "mock") return mockProvider;
  throw new Error(`Unknown PAYMENT_PROVIDER "${name}"`);
}
