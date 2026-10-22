import type { Metadata } from "next";
import { Suspense } from "react";
import { InvitationActions, MemberButtons } from "@/components/host/admin-forms";
import { InviteForm } from "@/components/host/forms";
import { HostHeading, loadHostAccount } from "@/components/host/host-page";
import { formatDateTime } from "@/lib/time";
import { listMembers, listPendingInvitations } from "@/server/host-accounts";

export const metadata: Metadata = { title: "Administratörer – uthyrarkonto", robots: { index: false } };

type P = PageProps<"/uthyrare/[accountId]/administratorer">;

/** Who administers the account: invite, take back or resend invitations, remove, hand over. */
export default function HostAdminsPage(props: P) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <Suspense fallback={<div className="card h-96 animate-pulse" />}>
        <Content {...props} />
      </Suspense>
    </div>
  );
}

async function Content({ params }: P) {
  const { accountId } = await params;
  const loaded = await loadHostAccount(accountId, `/uthyrare/${accountId}/administratorer`);
  if ("denied" in loaded) return loaded.denied;
  const { account, user } = loaded;
  const owner = account.role === "owner";

  if (account.kind === "household") {
    return (
      <div className="space-y-4">
        <HostHeading account={account} title="Administratörer" />
        <p className="card p-6 text-ink-soft">
          Ett privat uthyrarkonto har bara en administratör: du. Hyr du ut för en förening eller ett företag, med fler administratörer, skapar du ett
          uthyrarkonto av den typen.
        </p>
      </div>
    );
  }

  const [members, invites] = await Promise.all([listMembers(accountId), listPendingInvitations(accountId)]);
  return (
    <div className="space-y-6">
      <HostHeading account={account} title="Administratörer" />
      <p className="text-ink-soft">
        Administratörer lägger upp och ändrar parkeringsplatser, ser bokningar och registrerar bilar. Ägaren kopplar dessutom utbetalningskontot, tar
        bort andra administratörer och kan ta bort kontot.
      </p>

      <section className="card overflow-hidden" aria-labelledby="medlemmar">
        <h2 id="medlemmar" className="sr-only">
          Administratörer
        </h2>
        <table className="w-full text-left text-sm">
          <thead className="hidden border-b border-line bg-canvas text-xs tracking-wide text-muted uppercase md:table-header-group">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Namn</th>
              <th className="px-4 py-2.5 font-semibold">Roll</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {members.map((m) => {
              const self = m.userId === user.id;
              const buttons =
                m.role === "owner"
                  ? []
                  : owner
                    ? [
                        { op: "owner" as const, label: "Gör till ägare", confirm: `Göra ${m.name} till kontots ägare? Du blir kvar som administratör.` },
                        { op: "remove" as const, label: "Ta bort", confirm: `Ta bort ${m.name} som administratör?` },
                      ]
                    : self
                      ? [{ op: "remove" as const, label: "Lämna kontot", confirm: "Lämna kontot? Du kommer inte längre åt det." }]
                      : [];
              return (
                <tr key={m.userId} className="grid gap-2 px-4 py-3 md:table-row md:p-0">
                  <td className="md:px-4 md:py-3">
                    <span className="font-medium">
                      {m.name}
                      {self ? " (du)" : ""}
                    </span>
                    <span className="block break-all text-muted">{m.email}</span>
                  </td>
                  <td className="text-ink-soft md:px-4 md:py-3">{m.role === "owner" ? "Ägare" : "Administratör"}</td>
                  <td className="md:px-4 md:py-3">{buttons.length ? <MemberButtons accountId={accountId} userId={m.userId} buttons={buttons} /> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="space-y-3" aria-labelledby="inbjudningar">
        <h2 id="inbjudningar" className="text-lg font-semibold">
          Inbjudningar
        </h2>
        {invites.length ? (
          <ul className="card divide-y divide-line">
            {invites.map((i) => (
              <li key={i.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <span className="text-sm">
                  <span className="block font-medium break-all">{i.email}</span>
                  <span className="text-muted">
                    Skickad {formatDateTime(i.createdAt)}, gäller till {formatDateTime(i.expiresAt)}
                  </span>
                </span>
                <InvitationActions accountId={accountId} invitationId={i.id} email={i.email} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Inga inbjudningar väntar på svar.</p>
        )}
        <div className="card p-4">
          <p className="mb-2 text-sm font-medium">Bjud in en administratör</p>
          <InviteForm accountId={accountId} />
        </div>
      </section>
    </div>
  );
}
