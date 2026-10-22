import "server-only";
import { api, cols, embed, must, mustCount, names, parse, parseAll, toDb } from "@/db/api";
import { bookings, hostAccountMembers, hostAccounts, notifications, spots, users, type HostAccount } from "@/db/schema";
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

const N = names(notifications);
const U = names(users);
const M = names(hostAccountMembers);
const S = names(spots);
const B = names(bookings);
const A = names(hostAccounts);

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
  /** The host account it concerns, for the e-mail log (set by notifyAccount). */
  accountId?: string;
};

/** Store a notification for each user and, unless `email: false`, send it as a designed e-mail too. */
export async function notifyUsers(userIds: string[], n: NotificationInput, { email = true } = {}) {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return;
  must(
    await api()
      .from("notifications")
      .insert(ids.map((userId) => toDb(notifications, { userId, kind: n.kind, title: n.title, body: n.body, href: n.href }))),
    "notifyUsers",
  );
  if (!email) return;
  const recipients = must<{ email: string }[]>(await api().from("users").select(U.email).in(U.id, ids), "notifyUsers");
  for (const r of recipients) {
    await sendEmail(r.email, n.title, {
      heading: n.title,
      paragraphs: n.body.split("\n\n"),
      details: n.details,
      button: { label: n.cta ?? "Öppna i Parklet", url: `${appUrl()}${n.href}` },
      footnote: "Du får det här mejlet för att du har ett konto på Parklet.",
    }, { kind: n.kind, hostAccountId: n.accountId });
  }
}

/** Parklet's administrators (reviewers). */
export async function notifyAdmins(n: NotificationInput, opts?: { email?: boolean }) {
  const admins = must<{ id: string }[]>(await api().from("users").select(U.id).eq(U.isAdmin, true), "notifyAdmins");
  await notifyUsers(
    admins.map((a) => a.id),
    n,
    opts,
  );
}

/** Everyone who administers a host account. */
export async function notifyAccount(accountId: string, n: NotificationInput, opts?: { email?: boolean }) {
  const members = must<{ id: string }[]>(await api().from("host_account_members").select(`id:${M.userId}`).eq(M.hostAccountId, accountId), "notifyAccount");
  await notifyUsers(
    members.map((m) => m.id),
    { ...n, accountId },
    opts,
  );
}

export type Todo = { key: string; title: string; href: string };

/** Open tasks for a host, across all their accounts. Empty for users who don't host. */
export async function hostTodos(user: CurrentUser): Promise<Todo[]> {
  const accounts = must<{ role: "owner" | "admin"; account: unknown }[]>(
    await api().from("host_account_members").select(`role,${embed("account", hostAccounts, undefined, { inner: true })}`).eq(M.userId, user.id),
    "hostTodos",
  ).map((r) => ({ role: r.role, account: parse(hostAccounts, r.account) as HostAccount }));
  if (accounts.length === 0) return [];
  const ids = accounts.map((a) => a.account.id);
  const several = accounts.length > 1;
  const suffix = (name: string) => (several ? ` (${name})` : "");

  const [carRows, spotResult] = await Promise.all([
    api()
      .from("bookings")
      .select(`id,${embed("spot", spots, ["hostAccountId"], { inner: true })}`)
      .in(`spot.${S.hostAccountId}`, ids)
      .eq(B.status, "confirmed")
      .eq(B.vehicleRegistration, "pending")
      .gt(B.endsAt, new Date().toISOString()),
    api()
      .from("spots")
      .select(`${cols(spots, ["id", "title", "review", "landlordApproval"])},accountId:${S.hostAccountId}`)
      .in(S.hostAccountId, ids)
      .is(S.deletedAt, null)
      .in(S.review, ["draft", "rejected"]),
  ]);
  const carsPerAccount = new Map<string, number>();
  for (const r of must<{ spot: { hostAccountId: string } }[]>(carRows, "hostTodos")) {
    carsPerAccount.set(r.spot.hostAccountId, (carsPerAccount.get(r.spot.hostAccountId) ?? 0) + 1);
  }
  const spotRows = must<{ id: string; accountId: string; title: string; review: string; landlordApproval: string }[]>(spotResult, "hostTodos");

  const todos: Todo[] = [];
  const first = accounts[0].account.id;
  if (!user.identityVerified) todos.push({ key: "bankid", title: "Legitimera dig med BankID", href: `/konto/verifiera?next=/uthyrare/${first}` });
  for (const { account, role } of accounts) {
    const n = carsPerAccount.get(account.id) ?? 0;
    if (n > 0) {
      todos.push({ key: `cars:${account.id}`, title: `Registrera ${n === 1 ? "en bil" : `${n} bilar`}${suffix(account.name)}`, href: `/uthyrare/${account.id}/granska#bilar` });
    }
    if (account.kind !== "household" && (account.verificationStatus === "unverified" || account.verificationStatus === "rejected")) {
      todos.push({ key: `verify:${account.id}`, title: `Skicka in underlag för att verifiera ${account.name}`, href: `/uthyrare/${account.id}` });
    }
    if (account.kind === "household" && account.verificationStatus === "rejected" && role === "owner" && user.identityVerified) {
      todos.push({ key: `reverify:${account.id}`, title: `Legitimera dig igen så att kontot granskas på nytt${suffix(account.name)}`, href: `/konto/verifiera?next=/uthyrare/${account.id}` });
    }
    // While Stripe is verifying ("pending") there is nothing for the owner to do.
    if ((account.payoutStatus === "not_connected" || account.payoutStatus === "onboarding") && role === "owner") {
      todos.push({ key: `payout:${account.id}`, title: `Koppla utbetalningskonto${suffix(account.name)}`, href: `/uthyrare/${account.id}` });
    }
    if (account.payoutStatus === "restricted" && role === "owner") {
      todos.push({ key: `payout:${account.id}`, title: `Komplettera uppgifterna för utbetalningar${suffix(account.name)}`, href: `/uthyrare/${account.id}` });
    }
  }
  for (const s of spotRows) {
    const href = `/uthyrare/${s.accountId}/platser/${s.id}`;
    if (s.review === "rejected") todos.push({ key: `spot:${s.id}`, title: `Komplettera ${s.title}`, href });
    // Waiting for the landlord, or refused by them: nothing the host can finish.
    else if (s.landlordApproval !== "requested" && s.landlordApproval !== "declined") todos.push({ key: `spot:${s.id}`, title: `Slutför och skicka in ${s.title}`, href });
  }
  return todos;
}

export async function listNotifications(userId: string, limit = 8) {
  return parseAll(
    notifications,
    must(await api().from("notifications").select(cols(notifications)).eq(N.userId, userId).order(N.createdAt, { ascending: false }).limit(limit), "listNotifications"),
  );
}

export async function unreadCount(userId: string): Promise<number> {
  return mustCount(await api().from("notifications").select(N.id, { count: "exact", head: true }).eq(N.userId, userId).is(N.readAt, null), "unreadCount");
}

export async function markAllRead(userId: string) {
  must(await api().from("notifications").update(toDb(notifications, { readAt: new Date() })).eq(N.userId, userId).is(N.readAt, null), "markAllRead");
}

export async function isHost(userId: string): Promise<boolean> {
  const rows = must(await api().from("host_account_members").select(M.hostAccountId).eq(M.userId, userId).limit(1), "isHost");
  return rows.length > 0;
}

/** Open review work for Parklet's admins. */
export async function adminTodos(): Promise<Todo[]> {
  const [spotCount, accountCount] = await Promise.all([
    api().from("spots").select(S.id, { count: "exact", head: true }).eq(S.review, "pending_review"),
    api().from("host_accounts").select(A.id, { count: "exact", head: true }).eq(A.verificationStatus, "pending").is(A.deletedAt, null),
  ]);
  const spotsPending = { n: mustCount(spotCount, "adminTodos") };
  const accountsPending = { n: mustCount(accountCount, "adminTodos") };
  const todos: Todo[] = [];
  if (spotsPending.n > 0) todos.push({ key: "admin:spots", title: `Granska ${spotsPending.n === 1 ? "en parkeringsplats" : `${spotsPending.n} parkeringsplatser`}`, href: "/admin" });
  if (accountsPending.n > 0) {
    todos.push({ key: "admin:accounts", title: `Granska ${accountsPending.n === 1 ? "ett uthyrarkonto" : `${accountsPending.n} uthyrarkonton`}`, href: "/admin" });
  }
  return todos;
}

export type BellItem = { id: string; title: string; href: string; createdAt: string; read: boolean };
export type BellData = { todos: Todo[]; items: BellItem[]; unread: number };

/**
 * What the header's bell shows. Every signed-in user has a bell, empty or not: it is the
 * bell that keeps itself up to date (the header isn't re-rendered on client-side
 * navigation), so one that only appeared with the first notification showed up only
 * after a reload.
 */
export async function bellData(user: CurrentUser): Promise<BellData> {
  const host = await isHost(user.id);
  const [hostTasks, adminTasks, items, unread] = await Promise.all([
    host ? hostTodos(user) : [],
    user.isAdmin ? adminTodos() : [],
    listNotifications(user.id),
    unreadCount(user.id),
  ]);
  return {
    todos: [...adminTasks, ...hostTasks],
    items: items.map((n) => ({ id: n.id, title: n.title, href: n.href, createdAt: n.createdAt.toISOString(), read: n.readAt != null })),
    unread,
  };
}
