"use server";

import { appUrl } from "@/lib/app-url";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { api, ApiError, cols, must, names, rpc, toDb } from "@/db/api";
import { passwordResetTokens, users, type User } from "@/db/schema";
import type { FormState } from "@/components/form";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { rateLimit } from "@/lib/auth/rate-limit";
import { endSession, safeNext, startSession } from "@/lib/auth/session";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { emailSchema, fieldErrors, passwordSchema, registerSchema } from "@/lib/validation";
import { sendEmail } from "@/server/mailer";

async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

const U = names(users);
const T = names(passwordResetTokens);

async function userIdByEmail(email: string): Promise<string | null> {
  const row = must<{ id: string } | null>(await api().from("users").select("id").eq(U.email, email).maybeSingle(), "userIdByEmail");
  return row?.id ?? null;
}

// A real hash so that unknown e-mails take as long to reject as wrong passwords.
const DUMMY_HASH = hashPassword("not-a-real-password-just-timing");

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const values = { email };
  if (!email || !password) return { error: "Fyll i e-post och lösenord.", values };

  if (!rateLimit(`login:${email}`, 8, 15 * 60_000) || !rateLimit(`login-ip:${await clientIp()}`, 30, 15 * 60_000)) {
    return { error: "För många inloggningsförsök. Vänta en stund och försök igen.", values };
  }

  const user = must<Pick<User, "id" | "passwordHash"> | null>(
    await api().from("users").select(cols(users, ["id", "passwordHash"])).eq(U.email, email).maybeSingle(),
    "loginAction",
  );
  const ok = await verifyPassword(password, user?.passwordHash ?? (await DUMMY_HASH));
  if (!user || !ok) return { error: "Fel e-postadress eller lösenord.", values };

  await startSession(user.id);
  redirect(safeNext(formData.get("next"), "/"));
}

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const raw = {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    terms: formData.get("terms") ?? undefined,
  };
  const values = { name: raw.name, email: raw.email };
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  if (!rateLimit(`register-ip:${await clientIp()}`, 10, 60 * 60_000)) {
    return { error: "För många nya konton från din anslutning. Försök igen senare.", values };
  }

  const taken = { fieldErrors: { email: "Det finns redan ett konto med den e-postadressen. Logga in eller återställ lösenordet." }, values };
  if (await userIdByEmail(parsed.data.email)) return taken;
  let userId: string;
  try {
    const row = must<{ id: string }>(
      await api()
        .from("users")
        .insert(toDb(users, { name: parsed.data.name, email: parsed.data.email, passwordHash: await hashPassword(parsed.data.password) }))
        .select("id")
        .single(),
      "registerAction",
    );
    userId = row.id;
  } catch (err) {
    // Registered by a second request in the meantime.
    if (err instanceof ApiError && err.code === "23505") return taken;
    throw err;
  }
  await startSession(userId);
  redirect(safeNext(formData.get("next"), "/"));
}

export async function logoutAction() {
  await endSession();
  redirect("/");
}

/** Sign out and sign in again with another account, then come back (links meant for another account). */
export async function switchAccountAction(formData: FormData) {
  await endSession();
  redirect(`/logga-in?next=${encodeURIComponent(safeNext(formData.get("next"), "/"))}`);
}

export async function requestResetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = emailSchema.safeParse(formData.get("email") ?? "");
  if (!parsed.success) return { fieldErrors: { email: "Ange en giltig e-postadress." } };
  const email = parsed.data;
  const done: FormState = { success: "Om det finns ett konto med den adressen har vi skickat en länk för att välja ett nytt lösenord. Länken gäller i en timme." };
  if (!rateLimit(`reset:${email}`, 3, 60 * 60_000)) return done;

  const userId = await userIdByEmail(email);
  if (userId) {
    const token = generateToken();
    must(
      await api()
        .from("password_reset_tokens")
        .insert(toDb(passwordResetTokens, { id: hashToken(token), userId, expiresAt: new Date(Date.now() + 3600_000) })),
      "requestResetAction",
    );
    await sendEmail(email, "Välj ett nytt lösenord för Parklet", {
      heading: "Välj ett nytt lösenord",
      paragraphs: ["Någon, förhoppningsvis du, har bett om att få byta lösenord för ditt Parklet-konto. Länken gäller i en timme."],
      button: { label: "Välj nytt lösenord", url: `${appUrl()}/aterstall-losenord/${token}` },
      footnote: "Har du inte bett om detta kan du ignorera mejlet. Ditt lösenord ändras inte.",
    }, { kind: "password_reset" });
  }
  // Same answer whether or not the account exists, so the form cannot be used to probe for users.
  return done;
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const parsed = passwordSchema.safeParse(formData.get("password") ?? "");
  if (!parsed.success) return { fieldErrors: { password: parsed.error.issues[0].message } };

  const invalid: FormState = { error: "Länken är ogiltig eller har gått ut. Begär en ny." };
  const tokenId = hashToken(token);
  // A quick check first, so an invalid link doesn't cost a password hash.
  const valid = must<{ id: string } | null>(
    await api()
      .from("password_reset_tokens")
      .select("id")
      .eq(T.id, tokenId)
      .is(T.usedAt, null)
      .gt(T.expiresAt, new Date().toISOString())
      .maybeSingle(),
    "resetPasswordAction",
  );
  if (!valid) return invalid;

  // Uses the token, sets the password and signs out everywhere else, in one step.
  const userId = await rpc<string | null>("parklet_reset_password", { p_token_id: tokenId, p_password_hash: await hashPassword(parsed.data) });
  if (!userId) return invalid;
  await startSession(userId);
  redirect("/");
}
