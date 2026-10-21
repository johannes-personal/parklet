import { NextResponse } from "next/server";
import { completeCheckoutReturn } from "@/server/checkout";

/**
 * Stripe Checkout's success URL. Confirms the booking right away from Stripe's own
 * record of the session (the webhook may come later, or have come first: both are
 * idempotent), then shows it.
 */
export async function GET(req: Request, ctx: RouteContext<"/betala/[id]/klar">) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  let outcome;
  try {
    outcome = await completeCheckoutReturn(id, url.searchParams.get("session_id") ?? "");
  } catch (err) {
    console.error("[checkout] return failed", id, err);
    outcome = "error";
  }
  const to =
    outcome === "confirmed" || outcome === "already"
      ? `/bokning/${id}?bekraftad=1`
      : outcome === "processing"
        ? `/bokning/${id}?behandlas=1`
        : outcome === "refunded"
          ? `/bokning/${id}`
          : `/betala/${id}?fel=1`;
  return NextResponse.redirect(new URL(to, url));
}
