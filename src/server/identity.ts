import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { hostAccountMembers, hostAccounts, users } from "@/db/schema";

/**
 * Electronic identification. Production: BankID / Freja eID through a broker
 * such as Criipto, Signicat or ZignSec (OIDC). The broker returns a verified
 * name and personnummer. The MVP keeps only a pseudonymous reference; see
 * the note on users.identityVerifiedAt about DAC7.
 *
 * The MVP ships a mock that verifies instantly, so the host flow can be
 * exercised without credentials.
 */
export async function verifyIdentityMock(userId: string) {
  await db
    .update(users)
    .set({ identityVerifiedAt: new Date(), identityProvider: "mock-bankid", identityRef: `mock_${randomUUID()}` })
    .where(eq(users.id, userId));

  // A household account is verified by its owner's identity.
  const households = await db
    .select({ id: hostAccounts.id })
    .from(hostAccounts)
    .innerJoin(hostAccountMembers, eq(hostAccountMembers.hostAccountId, hostAccounts.id))
    .where(and(eq(hostAccountMembers.userId, userId), eq(hostAccountMembers.role, "owner"), eq(hostAccounts.kind, "household")));
  for (const h of households) {
    await db.update(hostAccounts).set({ verificationStatus: "verified", reviewedAt: new Date() }).where(eq(hostAccounts.id, h.id));
  }
}

export async function isIdentityVerified(userId: string): Promise<boolean> {
  const [row] = await db.select({ at: users.identityVerifiedAt }).from(users).where(eq(users.id, userId)).limit(1);
  return Boolean(row?.at);
}
