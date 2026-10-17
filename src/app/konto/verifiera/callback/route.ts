import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { completeVerification } from "@/server/identity";

const errorParam = { cancelled: "avbruten", expired: "utgangen", failed: "misslyckad" } as const;

/** Idura redirects here after BankID. The session cookie is SameSite=Lax, so it is sent on this top-level redirect. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/logga-in?next=%2Fkonto%2Fverifiera", url));

  const result = await completeVerification(user.id, url);
  if (result.ok) return NextResponse.redirect(new URL(result.next, url));
  const back = new URL("/konto/verifiera", url);
  back.searchParams.set("fel", errorParam[result.reason]);
  back.searchParams.set("next", result.next);
  return NextResponse.redirect(back);
}
