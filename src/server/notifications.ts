import "server-only";
import { and, count, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings, hostAccountMembers, hostAccounts, notifications, spots, users } from "@/db/schema";
import { appUrl } from "@/lib/app-url";
import type { CurrentUser } from "@/lib/auth/session";
import { sendMail } from "./mailer";

/**
 * What hosts and drivers are told, in the header's bell and by e-mail.
 *
 * Two kinds of item:
 * - notifications: things that happened (a booking, a cancellation, a review
 *   decision). Stored per user and marked read when the bell is opened.
 * - to-dos: things a host still has to do (register a car, connect payouts).
 *   Worked out from the current state, so they disappear once done.
 */

export type NotificationInput = { kind: string; title: string; body: string; href: string };

/** Store a notification for each user and, unless `email: false`, send it by e-mail too. */
export async function notifyUsers(userIds: string[], n: NotificationInput, { email = true } = {}) {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return;
  await db.insert(notifications).values(ids.map((userId) => ({ userId, ...n })));
  if (!email) return;
  const recipients = await db.select({ email: users.email }).from(users).where(inArray(users.id, ids));
  for (const r of recipients) {
    await sendMail({ to: r.email, subject: n.title, text: `${n.body}\n\n${appUrl()}${n.href}\n` });
  }
}

/** Everyone who administers a host account. */
export async function notifyAccount(accountId: string, n: NotificationInput, opts?: { email?: boolean }) {
  const members = await db.select({ id: hostAccountMembers.userId }).from(hostAccountMembers).where(eq(hostAccountMembers.hostAccountId, accountId));
  await notifyUsers(
    members.map((m) => m.id),
    n,
    opts,
  );
}

export type Todo = { key: string; title: string; href: string };

/** Open tasks for a host, across all their accounts. Empty for users who don't host. */
export async function hostTodos(user: CurrentUser): Promise<Todo[]> {
  const accounts = await db
    .select({ account: hostAccounts, role: hostAccountMembers.role })
    .from(hostAccountMembers)
    .innerJoin(hostAccounts, eq(hostAccounts.id, hostAccountMembers.hostAccountId))
    .where(eq(hostAccountMembers.userId, user.id));
  if (accounts.length === 0) return [];
  const ids = accounts.map((a) => a.account.id);
  const several = accounts.length > 1;
  const suffix = (name: string) => (several ? ` (${name})` : "");

  const [cars, spotRows] = await Promise.all([
    db
      .select({ accountId: spots.hostAccountId, n: count() })
      .from(bookings)
      .innerJoin(spots, eq(spots.id, bookings.spotId))
      .where(
        and(inArray(spots.hostAccountId, ids), eq(bookings.status, "confirmed"), eq(bookings.vehicleRegistration, "pending"), gt(bookings.endsAt, new Date())),
      )
      .groupBy(spots.hostAccountId),
    db
      .select({ id: spots.id, accountId: spots.hostAccountId, title: spots.title, review: spots.review, landlordApproval: spots.landlordApproval })
      .from(spots)
      .where(and(inArray(spots.hostAccountId, ids), inArray(spots.review, ["draft", "rejected"]))),
  ]);

  const todos: Todo[] = [];
  const first = accounts[0].account.id;
  if (!user.identityVerified) todos.push({ key: "bankid", title: "Legitimera dig med BankID", href: `/konto/verifiera?next=/uthyrare/${first}` });
  for (const { account, role } of accounts) {
    const n = cars.find((c) => c.accountId === account.id)?.n ?? 0;
    if (n > 0) {
      todos.push({ key: `cars:${account.id}`, title: `Registrera ${n === 1 ? "en bil" : `${n} bilar`}${suffix(account.name)}`, href: `/uthyrare/${account.id}#bilar` });
    }
    if (account.kind !== "household" && (account.verificationStatus === "unverified" || account.verificationStatus === "rejected")) {
      todos.push({ key: `verify:${account.id}`, title: `Skicka in underlag för att verifiera ${account.name}`, href: `/uthyrare/${account.id}` });
    }
    if (account.payoutStatus !== "active" && role === "owner") {
      todos.push({ key: `payout:${account.id}`, title: `Koppla utbetalningskonto${suffix(account.name)}`, href: `/uthyrare/${account.id}` });
    }
  }
  for (const s of spotRows) {
    const href = `/uthyrare/${s.accountId}/platser/${s.id}`;
    if (s.review === "rejected") todos.push({ key: `spot:${s.id}`, title: `Komplettera ${s.title}`, href });
    else if (s.landlordApproval !== "requested") todos.push({ key: `spot:${s.id}`, title: `Slutför och skicka in ${s.title}`, href });
  }
  return todos;
}

export async function listNotifications(userId: string, limit = 8) {
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit);
}

export async function unreadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.n ?? 0;
}

export async function markAllRead(userId: string) {
  await db
    .update(notifications)
    .set({ readAt: sql`now()` })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

export async function isHost(userId: string): Promise<boolean> {
  const rows = await db.select({ id: hostAccountMembers.hostAccountId }).from(hostAccountMembers).where(eq(hostAccountMembers.userId, userId)).limit(1);
  return rows.length > 0;
}
