import { appUrl } from "@/lib/app-url";
import "server-only";
import { api, cols, embed, must, names, parse, parseAll, rpc, toDb } from "@/db/api";
import { documents, hostAccountMembers, hostAccounts, hostInvitations, users, type DocumentRow, type HostAccount, type HostKind } from "@/db/schema";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { sendEmail } from "./mailer";
import { notifyAdmins } from "./notifications";
import { isUuid } from "./ids";

const A = names(hostAccounts);
const M = names(hostAccountMembers);
const D = names(documents);
const I = names(hostInvitations);

export type MembershipRole = "owner" | "admin";
export type AccountWithRole = HostAccount & { role: MembershipRole };

export const HOST_KIND_LABEL: Record<HostKind, string> = {
  household: "Privatperson",
  association: "Bostadsrättsförening",
  company: "Företag eller fastighetsägare",
};

const MEMBERSHIP = `role,${embed("account", hostAccounts, undefined, { inner: true })}`;
const withRole = (r: { role: MembershipRole; account: unknown }): AccountWithRole => ({ ...parse(hostAccounts, r.account), role: r.role });

export async function listAccountsForUser(userId: string): Promise<AccountWithRole[]> {
  const rows = must<{ role: MembershipRole; account: unknown }[]>(
    await api().from("host_account_members").select(MEMBERSHIP).eq(M.userId, userId),
    "listAccountsForUser",
  ).map(withRole);
  return rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

/** The account if the user is a member of it, otherwise null. All host pages and actions go through this. */
export async function getAccountForMember(accountId: string, userId: string): Promise<AccountWithRole | null> {
  if (!isUuid(accountId)) return null;
  const row = must<{ role: MembershipRole; account: unknown } | null>(
    await api().from("host_account_members").select(MEMBERSHIP).eq(M.userId, userId).eq(M.hostAccountId, accountId).maybeSingle(),
    "getAccountForMember",
  );
  return row ? withRole(row) : null;
}

export async function createHostAccount(input: {
  userId: string;
  kind: HostKind;
  name: string;
  orgNumber: string | null;
  signatoryRole: string | null;
  identityVerified: boolean;
  registry?: { name: string; form: string | null; status: string } | null;
}): Promise<string> {
  // One step: the account and its owner.
  return rpc<string>("parklet_create_host_account", {
    p_owner_id: input.userId,
    p_account: toDb(hostAccounts, {
      kind: input.kind,
      name: input.name,
      orgNumber: input.orgNumber,
      signatoryRole: input.signatoryRole,
      ...(input.registry
        ? { registryCheckedAt: new Date(), registryName: input.registry.name, registryForm: input.registry.form, registryStatus: input.registry.status }
        : {}),
      // Households are verified through the owner's e-ID; organisations by manual review of their documents.
      verificationStatus: input.kind === "household" && input.identityVerified ? "verified" : "unverified",
    }),
  });
}

export async function listAccountDocuments(accountId: string): Promise<DocumentRow[]> {
  return parseAll(
    documents,
    must(await api().from("documents").select(cols(documents)).eq(D.hostAccountId, accountId).is(D.spotId, null).order(D.createdAt), "listAccountDocuments"),
  );
}

/** Organisation submits its documents for review. */
export async function submitAccountForReview(accountId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const docs = await listAccountDocuments(accountId);
  if (!docs.some((d) => d.kind === "org_registration")) {
    return { ok: false, error: "Ladda upp ett registreringsbevis eller utdrag från Bolagsverket." };
  }
  if (!docs.some((d) => d.kind === "board_minutes" || d.kind === "signatory_proof")) {
    return { ok: false, error: "Ladda upp ett styrelseprotokoll eller firmatecknarbevis som visar att du får företräda organisationen." };
  }
  const [account] = must<Pick<HostAccount, "name" | "orgNumber" | "kind">[]>(
    await api()
      .from("host_accounts")
      .update(toDb(hostAccounts, { verificationStatus: "pending", reviewNote: null }))
      .eq(A.id, accountId)
      .select(cols(hostAccounts, ["name", "orgNumber", "kind"])),
    "submitAccountForReview",
  );
  if (account) {
    await notifyAdmins({
      kind: "admin_account_submitted",
      title: `Ny organisation att verifiera: ${account.name}`,
      body: `${account.name} har skickat in underlag för verifiering.`,
      details: [
        ["Organisation", `${account.name}${account.orgNumber ? `, ${account.orgNumber}` : ""}`],
        ["Typ", HOST_KIND_LABEL[account.kind]],
      ],
      href: `/admin/konton/${accountId}`,
      cta: "Granska organisationen",
    });
  }
  return { ok: true };
}

/** Mock of Stripe Connect onboarding: production redirects to a hosted KYC flow and activates on the account.updated webhook. */
export async function connectPayoutsMock(accountId: string) {
  must(
    await api()
      .from("host_accounts")
      .update(toDb(hostAccounts, { payoutStatus: "active", payoutAccountRef: `acct_mock_${accountId.slice(0, 8)}` }))
      .eq(A.id, accountId),
    "connectPayoutsMock",
  );
}

export async function listMembers(accountId: string): Promise<{ userId: string; name: string; email: string; role: MembershipRole }[]> {
  const rows = must<{ userId: string; role: MembershipRole; user: { name: string; email: string } }[]>(
    await api()
      .from("host_account_members")
      .select(`userId:${M.userId},role,${embed("user", users, ["name", "email"], { inner: true })}`)
      .eq(M.hostAccountId, accountId)
      .order(M.createdAt),
    "listMembers",
  );
  return rows.map((r) => ({ userId: r.userId, name: r.user.name, email: r.user.email, role: r.role }));
}

export async function listPendingInvitations(accountId: string) {
  return parseAll<typeof hostInvitations, { email: string; expiresAt: Date }>(
    hostInvitations,
    must(
      await api()
        .from("host_invitations")
        .select(cols(hostInvitations, ["email", "expiresAt"]))
        .eq(I.hostAccountId, accountId)
        .is(I.acceptedAt, null)
        .gt(I.expiresAt, new Date().toISOString()),
      "listPendingInvitations",
    ),
  );
}

export async function inviteAdmin(account: HostAccount, invitedBy: { id: string; name: string }, email: string) {
  const token = generateToken();
  must(
    await api()
      .from("host_invitations")
      .insert(
        toDb(hostInvitations, {
          id: hashToken(token),
          hostAccountId: account.id,
          email,
          invitedBy: invitedBy.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        }),
      ),
    "inviteAdmin",
  );
  const url = `${appUrl()}/inbjudan/${token}`;
  await sendEmail(email, `${invitedBy.name} har bjudit in dig att administrera ${account.name} på Parklet`, {
    heading: `Bli administratör för ${account.name}`,
    paragraphs: [
      `${invitedBy.name} vill att du blir administratör för uthyrarkontot "${account.name}" på Parklet. Som administratör kan du lägga upp och ändra platser, se bokningar och registrera bilar.`,
      "Inbjudan gäller i 7 dagar. Har du inget Parklet-konto skapar du ett när du accepterar.",
    ],
    button: { label: "Acceptera inbjudan", url },
  });
}

export async function getInvitation(token: string) {
  const row = must<(Record<string, unknown> & { account: { name: string } }) | null>(
    await api()
      .from("host_invitations")
      .select(`${cols(hostInvitations)},${embed("account", hostAccounts, ["name"], { inner: true })}`)
      .eq(I.id, hashToken(token))
      .maybeSingle(),
    "getInvitation",
  );
  if (!row) return null;
  const { account, ...invitation } = row;
  return { invitation: parse(hostInvitations, invitation), accountName: account.name };
}

export async function acceptInvitation(token: string, user: { id: string; email: string }) {
  const found = await getInvitation(token);
  if (!found || found.invitation.acceptedAt || found.invitation.expiresAt < new Date()) {
    return { ok: false as const, error: "Inbjudan är ogiltig eller har gått ut." };
  }
  if (found.invitation.email !== user.email) {
    return { ok: false as const, error: `Inbjudan skickades till ${found.invitation.email}. Logga in med den adressen för att acceptera.` };
  }
  // One step, and only once.
  const accountId = await rpc<string | null>("parklet_accept_invitation", { p_invitation_id: found.invitation.id, p_user_id: user.id });
  if (!accountId) return { ok: false as const, error: "Inbjudan är ogiltig eller har gått ut." };
  return { ok: true as const, accountId };
}
