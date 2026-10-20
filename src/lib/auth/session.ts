import "server-only";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { cache } from "react";
import { api, embed, must, names, toDb } from "@/db/api";
import { sessions, users } from "@/db/schema";
import { generateToken, hashToken } from "./tokens";

const COOKIE = "parklet_session";
const S = names(sessions);
const SESSION_DAYS = 30;

export type CurrentUser = { id: string; name: string; email: string; isAdmin: boolean; identityVerified: boolean };

/** Create a session for the user and set the cookie. Call from Server Actions only. */
export async function startSession(userId: string) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  must(await api().from("sessions").insert(toDb(sessions, { id: hashToken(token), userId, expiresAt })), "startSession");
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) must(await api().from("sessions").delete().eq(S.id, hashToken(token)), "endSession");
  store.delete(COOKIE);
}

/**
 * The signed-in user, or null. Memoised per request so the header, page and
 * actions share one lookup. Reads cookies, so callers must sit behind
 * <Suspense> (Cache Components).
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  // Session validity depends on the current time, so this is always request-time work.
  await connection();
  if (!token) return null;
  const session = must<{ user: { id: string; name: string; email: string; isAdmin: boolean; identityVerifiedAt: string | null } } | null>(
    await api()
      .from("sessions")
      .select(embed("user", users, ["id", "name", "email", "isAdmin", "identityVerifiedAt"], { inner: true }))
      .eq(S.id, hashToken(token))
      .gt(S.expiresAt, new Date().toISOString())
      .maybeSingle(),
    "getCurrentUser",
  );
  const row = session?.user;
  if (!row) return null;
  return { id: row.id, name: row.name, email: row.email, isAdmin: row.isAdmin, identityVerified: row.identityVerifiedAt != null };
});

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser("/admin");
  if (!user.isAdmin) redirect("/");
  return user;
}

/** The signed-in user, or a redirect to login that returns here afterwards. */
export async function requireUser(returnTo: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/logga-in?next=${encodeURIComponent(returnTo)}`);
  return user;
}

/** Only allow same-site relative redirect targets. */
export function safeNext(next: unknown, fallback = "/"): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}
