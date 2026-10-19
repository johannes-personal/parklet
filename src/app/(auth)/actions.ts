"use server";

import { appUrl } from "@/lib/app-url";
import { and, eq, gt, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { passwordResetTokens, sessions, users } from "@/db/schema";
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

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
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

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, parsed.data.email)).limit(1);
  if (existing) {
    return { fieldErrors: { email: "Det finns redan ett konto med den e-postadressen. Logga in eller återställ lösenordet." }, values };
  }
  const [user] = await db
    .insert(users)
    .values({ name: parsed.data.name, email: parsed.data.email, passwordHash: await hashPassword(parsed.data.password) })
    .returning({ id: users.id });
  await startSession(user.id);
  redirect(safeNext(formData.get("next"), "/"));
}

export async function logoutAction() {
  await endSession();
  redirect("/");
}

export async function requestResetAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = emailSchema.safeParse(formData.get("email") ?? "");
  if (!parsed.success) return { fieldErrors: { email: "Ange en giltig e-postadress." } };
  const email = parsed.data;
  const done: FormState = { success: "Om det finns ett konto med den adressen har vi skickat en länk för att välja ett nytt lösenord. Länken gäller i en timme." };
  if (!rateLimit(`reset:${email}`, 3, 60 * 60_000)) return done;

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (user) {
    const token = generateToken();
    await db.insert(passwordResetTokens).values({ id: hashToken(token), userId: user.id, expiresAt: new Date(Date.now() + 3600_000) });
    await sendEmail(email, "Välj ett nytt lösenord för Parklet", {
      heading: "Välj ett nytt lösenord",
      paragraphs: ["Någon, förhoppningsvis du, har bett om att få byta lösenord för ditt Parklet-konto. Länken gäller i en timme."],
      button: { label: "Välj nytt lösenord", url: `${appUrl()}/aterstall-losenord/${token}` },
      footnote: "Har du inte bett om detta kan du ignorera mejlet. Ditt lösenord ändras inte.",
    });
  }
  // Same answer whether or not the account exists, so the form cannot be used to probe for users.
  return done;
}

export async function resetPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const parsed = passwordSchema.safeParse(formData.get("password") ?? "");
  if (!parsed.success) return { fieldErrors: { password: parsed.error.issues[0].message } };

  const [row] = await db
    .select()
    .from(passwordResetTokens)
    .where(and(eq(passwordResetTokens.id, hashToken(token)), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, new Date())))
    .limit(1);
  if (!row) return { error: "Länken är ogiltig eller har gått ut. Begär en ny." };

  const passwordHash = await hashPassword(parsed.data);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash }).where(eq(users.id, row.userId));
    await tx.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, row.id));
    // Sign out everywhere else.
    await tx.delete(sessions).where(eq(sessions.userId, row.userId));
  });
  await startSession(row.userId);
  redirect("/");
}
