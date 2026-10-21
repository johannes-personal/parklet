import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AccountDashboard } from "@/components/host/account-dashboard";
import { HostIntro } from "@/components/host/host-intro";
import { Badge } from "@/components/status-badge";
import { getCurrentUser } from "@/lib/auth/session";
import { HOST_KIND_LABEL, listAccountsForUser } from "@/server/host-accounts";

export const metadata: Metadata = {
  title: "Hyr ut din parkeringsplats",
  description: "Tjäna pengar på din parkeringsplats när du inte använder den. Du bestämmer tider och pris – vi sköter bokning och betalning.",
};

/**
 * The one way into hosting. Without a host account (or signed out) it explains
 * how renting out works and leads to /uthyrare/nytt; with one it shows that
 * account's dashboard; with several it lists them.
 *
 * The single account's dashboard is rendered here, not redirected to: the client
 * router keeps a redirect it has seen, and after switching user on the same device
 * the menu's "Uthyrning" sent the next user to the previous user's account.
 */
export default function HostIndexPage() {
  return (
    <Suspense fallback={<div className="mx-auto h-96 w-full max-w-4xl animate-pulse px-4 py-14" />}>
      <HostHome />
    </Suspense>
  );
}

async function HostHome() {
  const user = await getCurrentUser();
  const accounts = user ? await listAccountsForUser(user.id) : [];
  if (accounts.length === 0) return <HostIntro />;
  if (user && accounts.length === 1) return <AccountDashboard user={user} account={accounts[0]} />;
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">Uthyrning</h1>
      <ul className="mt-6 space-y-3">
        {accounts.map((a) => (
          <li key={a.id}>
            <Link href={`/uthyrare/${a.id}`} className="card flex items-center justify-between p-4 hover:shadow-md">
              <span>
                <span className="block font-semibold">{a.name}</span>
                <span className="text-sm text-muted">
                  {HOST_KIND_LABEL[a.kind]} · {a.role === "owner" ? "Ägare" : "Administratör"}
                </span>
              </span>
              {a.verificationStatus === "verified" ? <Badge kind="ok">Verifierad</Badge> : <Badge kind="warn">Ej verifierad</Badge>}
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/uthyrare/nytt" className="btn-secondary mt-6">
        Skapa ett till uthyrarkonto
      </Link>
    </div>
  );
}
