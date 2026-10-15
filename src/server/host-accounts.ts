import "server-only";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { documents, hostAccountMembers, hostAccounts, hostInvitations, users, type HostAccount, type HostKind } from "@/db/schema";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { sendMail } from "./mailer";
import { isUuid } from "./ids";

export type MembershipRole = "owner" | "admin";
export type AccountWithRole = HostAccount & { role: MembershipRole };

export const HOST_KIND_LABEL: Record<HostKind, string> = {
  household: "Privatperson",
  association: "Bostadsrättsförening",
  company: "Företag eller fastighetsägare",
};

export async function listAccountsForUser(userId: string): Promise<AccountWithRole[]> {
  const rows = await db
    .select({ account: hostAccounts, role: hostAccountMembers.role })
    .from(hostAccountMembers)
    .innerJoin(hostAccounts, eq(hostAccounts.id, hostAccountMembers.hostAccountId))
    .where(eq(hostAccountMembers.userId, userId))
    .orderBy(asc(hostAccounts.createdAt));
  return rows.map((r) => ({ ...r.account, role: r.role }));
}

/** The account if the user is a member of it, otherwise null. All host pages and actions go through this. */
export async function getAccountForMember(accountId: string, userId: string): Promise<AccountWithRole | null> {
  if (!isUuid(accountId)) return null;
  const [row] = await db
    .select({ account: hostAccounts, role: hostAccountMembers.role })
    .from(hostAccountMembers)
    .innerJoin(hostAccounts, eq(hostAccounts.id, hostAccountMembers.hostAccountId))
    .where(and(eq(hostAccountMembers.userId, userId), eq(hostAccounts.id, accountId)))
    .limit(1);
  return row ? { ...row.account, role: row.role } : null;
}

export async function createHostAccount(input: {
  userId: string;
  kind: HostKind;
  name: string;
  orgNumber: string | null;
  signatoryRole: string | null;
  identityVerified: boolean;
}): Promise<string> {
  return db.transaction(async (tx) => {
    const [account] = await tx
      .insert(hostAccounts)
      .values({
        kind: input.kind,
        name: input.name,
        orgNumber: input.orgNumber,
        signatoryRole: input.signatoryRole,
        // Households are verified through the owner's e-ID; organisations by manual review of their documents.
        verificationStatus: input.kind === "household" && input.identityVerified ? "verified" : "unverified",
      })
      .returning({ id: hostAccounts.id });
    await tx.insert(hostAccountMembers).values({ hostAccountId: account.id, userId: input.userId, role: "owner" });
    return account.id;
  });
}

export async function listAccountDocuments(accountId: string) {
  return db
    .select()
    .from(documents)
    .where(and(eq(documents.hostAccountId, accountId), isNull(documents.spotId)))
    .orderBy(asc(documents.createdAt));
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
  await db.update(hostAccounts).set({ verificationStatus: "pending", reviewNote: null }).where(eq(hostAccounts.id, accountId));
  return { ok: true };
}

/** Mock of Stripe Connect onboarding: production redirects to a hosted KYC flow and activates on the account.updated webhook. */
export async function connectPayoutsMock(accountId: string) {
  await db
    .update(hostAccounts)
    .set({ payoutStatus: "active", payoutAccountRef: `acct_mock_${accountId.slice(0, 8)}` })
    .where(eq(hostAccounts.id, accountId));
}

export async function listMembers(accountId: string) {
  return db
    .select({ userId: users.id, name: users.name, email: users.email, role: hostAccountMembers.role })
    .from(hostAccountMembers)
    .innerJoin(users, eq(users.id, hostAccountMembers.userId))
    .where(eq(hostAccountMembers.hostAccountId, accountId))
    .orderBy(asc(hostAccountMembers.createdAt));
}

export async function listPendingInvitations(accountId: string) {
  return db
    .select({ email: hostInvitations.email, expiresAt: hostInvitations.expiresAt })
    .from(hostInvitations)
    .where(and(eq(hostInvitations.hostAccountId, accountId), isNull(hostInvitations.acceptedAt), gt(hostInvitations.expiresAt, new Date())));
}

export async function inviteAdmin(account: HostAccount, invitedBy: { id: string; name: string }, email: string) {
  const token = generateToken();
  await db.insert(hostInvitations).values({
    id: hashToken(token),
    hostAccountId: account.id,
    email,
    invitedBy: invitedBy.id,
    expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
  });
  const url = `${process.env.APP_URL ?? "http://localhost:3000"}/inbjudan/${token}`;
  await sendMail({
    to: email,
    subject: `${invitedBy.name} har bjudit in dig att administrera ${account.name} på Parklet`,
    text: `Hej!\n\n${invitedBy.name} vill att du blir administratör för uthyrarkontot "${account.name}" på Parklet.\n\nAcceptera inbjudan (giltig i 7 dagar):\n${url}\n`,
  });
}

export async function getInvitation(token: string) {
  const [row] = await db
    .select({ invitation: hostInvitations, accountName: hostAccounts.name })
    .from(hostInvitations)
    .innerJoin(hostAccounts, eq(hostAccounts.id, hostInvitations.hostAccountId))
    .where(eq(hostInvitations.id, hashToken(token)))
    .limit(1);
  return row ?? null;
}

export async function acceptInvitation(token: string, user: { id: string; email: string }) {
  const found = await getInvitation(token);
  if (!found || found.invitation.acceptedAt || found.invitation.expiresAt < new Date()) {
    return { ok: false as const, error: "Inbjudan är ogiltig eller har gått ut." };
  }
  if (found.invitation.email !== user.email) {
    return { ok: false as const, error: `Inbjudan skickades till ${found.invitation.email}. Logga in med den adressen för att acceptera.` };
  }
  await db.transaction(async (tx) => {
    await tx
      .insert(hostAccountMembers)
      .values({ hostAccountId: found.invitation.hostAccountId, userId: user.id, role: "admin" })
      .onConflictDoNothing();
    await tx.update(hostInvitations).set({ acceptedAt: new Date() }).where(eq(hostInvitations.id, found.invitation.id));
  });
  return { ok: true as const, accountId: found.invitation.hostAccountId };
}
