import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { api, cols, embed, must, names, tableName, toDb } from "@/db/api";
import { bookings, documents, hostAccountMembers, hostAccounts, identityRequests, notifications, passwordResetTokens, sessions, spots, users, vehicles, type User } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { deleteDocumentFiles } from "./storage";

const U = names(users);
const B = names(bookings);
const M = names(hostAccountMembers);
const A = names(hostAccounts);
const S = names(spots);
const D = names(documents);

/** A deleted user's address: unique, on a domain that can't receive mail, never a login. */
const deletedEmail = () => `borttagen-${randomUUID()}@parklet.invalid`;

export type DeletionResult = { ok: true } | { ok: false; error: string };

/**
 * Deletes the user's own account. The row stays, without the personal data, because
 * bookings refer to their driver and their host account and must be kept for the
 * bookkeeping (seven years); everything else that is theirs goes:
 *
 * - name, e-mail and password (the address is free to register again), sessions, cars,
 *   notifications, reset links and pending BankID requests;
 * - the BankID identity, unless the person was paid as a host this year or last: DAC7
 *   reporting to Skatteverket still needs their name and personnummer;
 * - host accounts they own alone: the spots are paused and the verification documents
 *   deleted; a household account loses the person's name. Co-administrators just leave.
 *
 * Refused while there are upcoming bookings (as driver, or on their spots), for an
 * account they own together with others (that needs a new owner first), and for admins.
 */
export async function deleteOwnAccount(userId: string, password: string): Promise<DeletionResult> {
  const user = must<Pick<User, "id" | "passwordHash" | "isAdmin"> | null>(
    await api().from("users").select(cols(users, ["id", "passwordHash", "isAdmin"])).eq(U.id, userId).maybeSingle(),
    "deleteOwnAccount",
  );
  if (!user || !(await verifyPassword(password, user.passwordHash))) return { ok: false, error: "Fel lösenord." };
  if (user.isAdmin) return { ok: false, error: "Ett administratörskonto tas bort av en annan administratör. Kontakta Parklet." };

  const now = new Date().toISOString();
  const upcoming = must<unknown[]>(
    await api().from("bookings").select(B.id).eq(B.driverId, userId).in(B.status, ["pending_payment", "confirmed"]).gt(B.endsAt, now).limit(1),
    "deleteOwnAccount",
  );
  if (upcoming.length) return { ok: false, error: "Du har kommande bokningar. Avboka dem eller vänta tills de är klara, och ta sedan bort kontot." };

  const memberships = must<{ accountId: string; role: "owner" | "admin" }[]>(
    await api().from("host_account_members").select(`accountId:${M.hostAccountId},role:${M.role}`).eq(M.userId, userId),
    "deleteOwnAccount",
  );
  const owned = memberships.filter((m) => m.role === "owner").map((m) => m.accountId);
  if (owned.length) {
    const others = must<unknown[]>(
      await api().from("host_account_members").select(M.userId).in(M.hostAccountId, owned).neq(M.userId, userId).limit(1),
      "deleteOwnAccount",
    );
    if (others.length) {
      return { ok: false, error: "Du äger ett uthyrarkonto som har fler administratörer. Kontakta Parklet för att lämna över kontot innan du tar bort ditt." };
    }
    const hosted = must<unknown[]>(
      await api()
        .from("bookings")
        .select(`${B.id},${embed("spot", spots, ["hostAccountId"], { inner: true })}`)
        .in(`spot.${S.hostAccountId}`, owned)
        .in(B.status, ["pending_payment", "confirmed"])
        .gt(B.endsAt, now)
        .limit(1),
      "deleteOwnAccount",
    );
    if (hosted.length) return { ok: false, error: "Det finns kommande bokningar på dina platser. Vänta tills de är klara, och ta sedan bort kontot." };
  }

  // Paid as a host this year or last: the identity is kept for the DAC7 report.
  const sinceLastYear = new Date(Date.UTC(new Date().getUTCFullYear() - 1, 0, 1)).toISOString();
  const paidHost = owned.length
    ? must<unknown[]>(
        await api()
          .from("bookings")
          .select(`${B.id},${embed("spot", spots, ["hostAccountId"], { inner: true })}`)
          .in(`spot.${S.hostAccountId}`, owned)
          .eq(B.paymentStatus, "paid")
          .gte(B.startsAt, sinceLastYear)
          .limit(1),
        "deleteOwnAccount",
      ).length > 0
    : false;

  if (owned.length) {
    must(await api().from("spots").update(toDb(spots, { status: "paused" })).in(S.hostAccountId, owned), "deleteOwnAccount");
    const docs = must<{ storageKey: string }[]>(
      await api().from("documents").delete().in(D.hostAccountId, owned).select(cols(documents, ["storageKey"])),
      "deleteOwnAccount",
    );
    await deleteDocumentFiles(docs.map((d) => d.storageKey)).catch((err) => console.error("account deletion: document files", err));
    must(
      await api().from("host_accounts").update(toDb(hostAccounts, { name: "Borttagen uthyrare" })).in(A.id, owned).eq(A.kind, "household"),
      "deleteOwnAccount",
    );
  }
  must(await api().from("host_account_members").delete().eq(M.userId, userId).eq(M.role, "admin"), "deleteOwnAccount");

  await Promise.all(
    [sessions, vehicles, notifications, passwordResetTokens, identityRequests].map(async (table) =>
      must(await api().from(tableName(table)).delete().eq(names(table).userId, userId), "deleteOwnAccount"),
    ),
  );
  must(
    await api()
      .from("users")
      .update(
        toDb(users, {
          email: deletedEmail(),
          name: "Borttagen användare",
          passwordHash: await hashPassword(randomBytes(32).toString("base64url")),
          ...(paidHost
            ? {}
            : { identityVerifiedAt: null, identityProvider: null, identityRef: null, identityName: null, personnummerEncrypted: null }),
        }),
      )
      .eq(U.id, userId),
    "deleteOwnAccount",
  );
  return { ok: true };
}
