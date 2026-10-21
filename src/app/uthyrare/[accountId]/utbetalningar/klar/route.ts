import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getAccountForMember } from "@/server/host-accounts";
import { isStripeAccountRef, syncPayoutAccount } from "@/server/payouts";

/**
 * Where Stripe's onboarding sends the host back. Returning says nothing about the
 * outcome (the host may just have left), so the status is checked with Stripe here,
 * before the dashboard shows it; account.updated keeps it current afterwards.
 */
export async function GET(req: Request, ctx: RouteContext<"/uthyrare/[accountId]/utbetalningar/klar">) {
  const { accountId } = await ctx.params;
  const url = new URL(req.url);
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL(`/logga-in?next=${encodeURIComponent(`/uthyrare/${accountId}`)}`, url));
  const account = await getAccountForMember(accountId, user.id);
  if (!account) return NextResponse.redirect(new URL(`/uthyrare/${accountId}`, url));
  let status: string = account.payoutStatus;
  if (isStripeAccountRef(account.payoutAccountRef)) {
    try {
      status = (await syncPayoutAccount(account.payoutAccountRef)) ?? status;
    } catch (err) {
      console.error("[payouts] could not check the account after onboarding", accountId, err);
    }
  }
  return NextResponse.redirect(new URL(`/uthyrare/${accountId}?utbetalning=${status}`, url));
}
