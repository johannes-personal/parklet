import "server-only";
import { and, count, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings, hostAccountMembers, hostAccounts, notifications, spots, users } from "@/db/schema";
import { appUrl } from "@/lib/app-url";
import type { CurrentUser } from "@/lib/auth/session";
import { sendEmail } from "./mailer";

/**
 * What hosts and drivers are told, in the header's bell and by e-mail.
 *
 * Two kinds of item:
 * - notifications: things that happened (a booking, a cancellation, a review
 *   decision). Stored per user and marked read when the bell is opened.
 * - to-dos: things a host still has to do (register a car, connect payouts).
 *   Worked out from the current state, so they disappear once done.
 */

export type NotificationInput = {
  kind: string;
  title: string;
  /** Paragraphs separated by blank lines. */
  body: string;
  href: string;
  /** Extra rows for the e-mail, e.g. time and price. */
  details?: [string, string][];
  /** The e-mail's button label (default "Öppna i Parklet"). */
  cta?: string;
};

/** Store a notification for each user and, unless `email: false`, send it as a designed e-mail too. */
export async function notifyUsers(userIds: string[], n: NotificationInput, { email = true } = {}) {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return;
  await db.insert(notifications).values(ids.map((userId) => ({ userId, kind: n.kind, title: n.title, body: n.body, href: n.href })));
  if (!email) return;
  const recipients = await db.select({ email: users.email }).from(users).where(inArray(users.id, ids));
  for (const r of recipients) {
    await sendEmail(r.email, n.title, {
      heading: n.title,
      paragraphs: n.body.split("\n\n"),
      details: n.details,
      button: { label: n.cta ?? "Öppna i Parklet", url: `${appUrl()}${n.href}` },
      footnote: "Du får det här mejlet för att du har ett konto på Parklet.",
    });
  }
}

/** Parklet's administrators (reviewers). */
export async function notifyAdmins(n: NotificationInput, opts?: { email?: boolean }) {
  const admins = await db.select({ id: users.id }).from(users).where(eq(users.isAdmin, true));
  await notifyUsers(
    admins.map((a) => a.id),
    n,
    opts,
  );
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

/** Open review work for Parklet's admins. */
export async function adminTodos(): Promise<Todo[]> {
  const [[spotsPending], [accountsPending]] = await Promise.all([
    db.select({ n: count() }).from(spots).where(eq(spots.review, "pending_review")),
    db.select({ n: count() }).from(hostAccounts).where(eq(hostAccounts.verificationStatus, "pending")),
  ]);
  const todos: Todo[] = [];
  if (spotsPending.n > 0) todos.push({ key: "admin:spots", title: `Granska ${spotsPending.n === 1 ? "en plats" : `${spotsPending.n} platser`}`, href: "/admin" });
  if (accountsPending.n > 0) {
    todos.push({ key: "admin:accounts", title: `Verifiera ${accountsPending.n === 1 ? "en organisation" : `${accountsPending.n} organisationer`}`, href: "/admin" });
  }
  return todos;
}

export type BellItem = { id: string; title: string; href: string; createdAt: string; read: boolean };
export type BellData = { todos: Todo[]; items: BellItem[]; unread: number };

/** Everything the header's bell shows, or null when it shouldn't be shown (people who neither host nor review and have no news). */
export async function bellData(user: CurrentUser): Promise<BellData | null> {
  const host = await isHost(user.id);
  const [hostTasks, adminTasks, items, unread] = await Promise.all([
    host ? hostTodos(user) : [],
    user.isAdmin ? adminTodos() : [],
    listNotifications(user.id),
    unreadCount(user.id),
  ]);
  if (!host && !user.isAdmin && items.length === 0) return null;
  return {
    todos: [...adminTasks, ...hostTasks],
    items: items.map((n) => ({ id: n.id, title: n.title, href: n.href, createdAt: n.createdAt.toISOString(), read: n.readAt != null })),
    unread,
  };
}
