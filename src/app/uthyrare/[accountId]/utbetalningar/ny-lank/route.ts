import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getAccountForMember } from "@/server/host-accounts";
import { startPayoutOnboarding } from "@/server/payouts";

/**
 * Stripe's refresh URL: an onboarding link is single-use and short-lived, and Stripe
 * sends the host here when it has expired or was already used. A fresh one, for the owner.
 */
export async function GET(req: Request, ctx: RouteContext<"/uthyrare/[accountId]/utbetalningar/ny-lank">) {
  const { accountId } = await ctx.params;
  const url = new URL(req.url);
  const back = new URL(`/uthyrare/${accountId}`, url);
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL(`/logga-in?next=${encodeURIComponent(`/uthyrare/${accountId}`)}`, url));
  const account = await getAccountForMember(accountId, user.id);
  if (!account || account.role !== "owner" || !user.identityVerified || account.payoutStatus === "active") return NextResponse.redirect(back);
  try {
    return NextResponse.redirect(await startPayoutOnboarding(account, user));
  } catch (err) {
    console.error("[payouts] could not create an onboarding link", accountId, err);
    back.searchParams.set("utbetalning", "fel");
    return NextResponse.redirect(back);
  }
}
