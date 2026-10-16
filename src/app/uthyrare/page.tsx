import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Badge } from "@/components/status-badge";
import { requireUser } from "@/lib/auth/session";
import { HOST_KIND_LABEL, listAccountsForUser } from "@/server/host-accounts";

export const metadata: Metadata = { title: "Uthyrning" };

export default function HostIndexPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold">Uthyrning</h1>
      <Suspense fallback={<div className="card mt-6 h-32 animate-pulse" />}>
        <Accounts />
      </Suspense>
    </div>
  );
}

async function Accounts() {
  const user = await requireUser("/uthyrare");
  const accounts = await listAccountsForUser(user.id);
  if (accounts.length === 0) redirect("/uthyrare/nytt");
  if (accounts.length === 1) redirect(`/uthyrare/${accounts[0].id}`);
  return (
    <>
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
    </>
  );
}
