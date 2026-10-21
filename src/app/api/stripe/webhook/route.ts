import { handleStripeEvent } from "@/server/stripe-webhooks";
import { PaymentsMisconfigured, verifyWebhook } from "@/server/stripe";

/**
 * Stripe's webhooks (see src/server/stripe-webhooks.ts for the events). The body is
 * read as text: the signature is over the exact bytes Stripe sent.
 */
export async function POST(req: Request) {
  const payload = await req.text();
  let event;
  try {
    event = verifyWebhook(payload, req.headers.get("stripe-signature"));
  } catch (err) {
    if (err instanceof PaymentsMisconfigured) {
      console.error("[stripe webhook]", err.message);
      return new Response("Payments are not configured", { status: 503 });
    }
    return new Response("Invalid signature", { status: 400 });
  }
  try {
    const result = await handleStripeEvent(event);
    return Response.json({ received: true, result });
  } catch (err) {
    // Stripe retries a failed delivery for up to three days.
    console.error("[stripe webhook] handling failed", event.type, event.id, err);
    return new Response("Handling failed", { status: 500 });
  }
}
