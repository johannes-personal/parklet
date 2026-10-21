// The app's Stripe code against e2e/fake-stripe.mjs, with webhooks delivered by the
// test (signed like Stripe signs them) straight to the route handler.
import { afterAll, beforeAll } from "vitest";
import { POST as webhook } from "@/app/api/stripe/webhook/route";
import { startFakeStripe } from "../../e2e/fake-stripe.mjs";

export const STRIPE_KEY = "sk_test_vitest";
export const WEBHOOK_SECRET = "whsec_vitest";
const PORT = Number(process.env.TEST_STRIPE_PORT ?? 3314);

type Fake = ReturnType<typeof startFakeStripe>;
export type StripeEvent = { id: string; type: string; account?: string; data: { object: Record<string, unknown> & { id: string } } };

/** Starts the fake for the file and switches the app to Stripe; restores the mock afterwards. */
export function withFakeStripe() {
  const fake = {} as { current: Fake };
  const saved: Record<string, string | undefined> = {};
  const env: Record<string, string> = {
    PAYMENT_PROVIDER: "stripe",
    STRIPE_SECRET_KEY: STRIPE_KEY,
    STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
    STRIPE_API_BASE: `http://localhost:${PORT}`,
    STRIPE_SUPPRESS_NOTICES: "true",
  };
  beforeAll(async () => {
    for (const [k, v] of Object.entries(env)) {
      saved[k] = process.env[k];
      process.env[k] = v;
    }
    fake.current = startFakeStripe({ port: PORT, apiKey: STRIPE_KEY, webhookSecret: WEBHOOK_SECRET, webhookUrl: null });
    await fake.current.listening;
  });
  afterAll(async () => {
    await fake.current.close();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
  const get = () => fake.current;
  return {
    get fake() {
      return get();
    },
    /** The latest event of a type the fake has recorded (Stripe would have sent it). */
    lastEvent(type: string): StripeEvent {
      const event = [...get().state.events].reverse().find((e: StripeEvent) => e.type === type);
      if (!event) throw new Error(`No ${type} event`);
      return event;
    },
    /** Test controls, as e2e uses them (see /__ in the fake). */
    control: (path: string, body?: object) =>
      fetch(`${get().url}/__/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) }).then((r) => r.json()),
  };
}

/** POSTs an event to /api/stripe/webhook, signed with `secret` (the app's by default). */
export async function deliver(event: object, { secret = WEBHOOK_SECRET, timestamp }: { secret?: string; timestamp?: number } = {}) {
  const payload = JSON.stringify(event);
  const { createHmac } = await import("node:crypto");
  const t = timestamp ?? Math.floor(Date.now() / 1000);
  const signature = `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex")}`;
  const res = await webhook(new Request("http://localhost/api/stripe/webhook", { method: "POST", body: payload, headers: { "stripe-signature": signature } }));
  return { status: res.status, body: await res.text() };
}
