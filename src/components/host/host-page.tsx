import { NoAccountAccess } from "@/components/host/host-access";
import { requireUser, type CurrentUser } from "@/lib/auth/session";
import { type AccountWithRole, getAccountForMember, HOST_KIND_LABEL } from "@/server/host-accounts";

/** The signed-in administrator and the account, or the page to show someone who isn't one. */
export async function loadHostAccount(accountId: string, path: string): Promise<{ user: CurrentUser; account: AccountWithRole } | { denied: React.ReactNode }> {
  const user = await requireUser(path);
  const account = await getAccountForMember(accountId, user.id);
  if (!account) return { denied: <NoAccountAccess user={user} accountId={accountId} returnTo={path} /> };
  return { user, account };
}

/** A host page's heading: the account it belongs to, then what the page is. */
export function HostHeading({ account, title, children }: { account: AccountWithRole; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-sm text-muted">
          {account.name} · {HOST_KIND_LABEL[account.kind]}
        </p>
        <h1 className="text-2xl font-bold">{title}</h1>
      </div>
      {children}
    </div>
  );
}
