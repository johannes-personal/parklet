import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountDashboard } from "@/components/host/account-dashboard";
import { NoAccountAccess } from "@/components/host/host-access";
import { requireUser } from "@/lib/auth/session";
import { getAccountForMember } from "@/server/host-accounts";

export const metadata: Metadata = { title: "Uthyrarkonto" };

type P = PageProps<"/uthyrare/[accountId]">;

export default function AccountPage(props: P) {
  return (
    <Suspense fallback={<div className="mx-auto h-96 w-full max-w-5xl animate-pulse px-4 py-10" />}>
      <Dashboard {...props} />
    </Suspense>
  );
}

async function Dashboard({ params, searchParams }: P) {
  const { accountId } = await params;
  const sp = await searchParams;
  const user = await requireUser(`/uthyrare/${accountId}`);
  const account = await getAccountForMember(accountId, user.id);
  if (!account) return <NoAccountAccess user={user} accountId={accountId} returnTo={`/uthyrare/${accountId}`} />;
  return <AccountDashboard user={user} account={account} payoutsConnected={Boolean(sp.utbetalning)} />;
}
