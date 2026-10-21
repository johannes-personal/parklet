import "server-only";
import Stripe from "stripe";

/**
 * The Stripe client, for PAYMENT_PROVIDER=stripe (src/server/payments.ts).
 *
 * Configure with STRIPE_SECRET_KEY (sk_test_… until launch) and
 * STRIPE_WEBHOOK_SECRET (whsec_…, from the webhook endpoint in Stripe's
 * dashboard, or from `stripe listen` locally). Stripe sends events about
 * connected accounts (account.updated) to an endpoint of their own with its own
 * secret, so the variable takes several, comma-separated. Half-configured is an error, not a
 * reason to fall back to the mock: a missing webhook secret would leave bookings
 * unconfirmed and holds unreleased whenever the driver doesn't come back.
 *
 * STRIPE_API_BASE points the client at a local fake (e2e/fake-stripe.mjs) and is
 * for tests only: it is refused together with a live key.
 */

export class PaymentsMisconfigured extends Error {}

type StripeConfig = { secretKey: string; webhookSecrets: string[]; apiBase: URL | null; testMode: boolean };

export function stripeConfig(): StripeConfig {
  const { STRIPE_SECRET_KEY: secretKey, STRIPE_WEBHOOK_SECRET: webhookSecret, STRIPE_API_BASE } = process.env;
  const missing = [!secretKey && "STRIPE_SECRET_KEY", !webhookSecret && "STRIPE_WEBHOOK_SECRET"].filter(Boolean);
  if (missing.length) throw new PaymentsMisconfigured(`PAYMENT_PROVIDER=stripe needs ${missing.join(" and ")}`);
  if (!/^(sk|rk)_(test|live)_/.test(secretKey!)) throw new PaymentsMisconfigured("STRIPE_SECRET_KEY must be a secret (sk_…) or restricted (rk_…) key");
  const testMode = /^(sk|rk)_test_/.test(secretKey!);
  const apiBase = STRIPE_API_BASE ? new URL(STRIPE_API_BASE) : null;
  if (apiBase && !testMode) throw new PaymentsMisconfigured("STRIPE_API_BASE is for tests and can't be used with a live key");
  const webhookSecrets = webhookSecret!.split(",").map((w) => w.trim()).filter(Boolean);
  return { secretKey: secretKey!, webhookSecrets, apiBase, testMode };
}

let client: { key: string; base: string; stripe: Stripe } | null = null;

export function getStripe(): Stripe {
  const config = stripeConfig();
  const base = config.apiBase?.href ?? "";
  if (client?.key !== config.secretKey || client.base !== base) {
    client = {
      key: config.secretKey,
      base,
      stripe: new Stripe(config.secretKey, {
        // No apiVersion: the client uses the one its (exactly pinned) package version is built for.
        maxNetworkRetries: 2,
        timeout: 20_000,
        telemetry: false,
        appInfo: { name: "Parklet" },
        ...(config.apiBase
          ? {
              host: config.apiBase.hostname,
              port: config.apiBase.port || (config.apiBase.protocol === "https:" ? 443 : 80),
              protocol: config.apiBase.protocol === "https:" ? "https" : "http",
            }
          : {}),
      }),
    };
  }
  return client.stripe;
}

/** Verifies the `Stripe-Signature` header and parses the event; throws on a bad signature or a stale timestamp. */
export function verifyWebhook(payload: string, signature: string | null): Stripe.Event {
  if (!signature) throw new Error("No Stripe-Signature header");
  const stripe = getStripe();
  let failure: unknown;
  for (const secret of stripeConfig().webhookSecrets) {
    try {
      return stripe.webhooks.constructEvent(payload, signature, secret);
    } catch (err) {
      failure = err;
    }
  }
  throw failure;
}

export function isStripeTestMode(): boolean {
  return stripeConfig().testMode;
}
