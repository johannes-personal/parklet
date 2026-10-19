import "server-only";
import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { db } from "@/db";
import { mailOutbox } from "@/db/schema";
import { appUrl } from "@/lib/app-url";
import { isDeliverableAddress } from "@/lib/email";
import { renderEmail, type EmailContent } from "@/lib/email-template";

export type Mail = { to: string; subject: string; text: string; html?: string };

/** Send one of Parklet's designed e-mails (src/lib/email-template.ts). */
export async function sendEmail(to: string, subject: string, content: EmailContent) {
  const { html, text } = renderEmail(content, { appUrl: appUrl() });
  await sendMail({ to, subject, text, html });
}

/**
 * Every e-mail is logged and stored in the mail_outbox table, where Parklet
 * admins can read it at /admin/epost (so the demo's approval, invitation and
 * reset links can be followed even for the demo accounts' made-up addresses).
 *
 * With RESEND_API_KEY set, mail to real addresses is also sent through Resend
 * (resend.com, EU region available), from MAIL_FROM. Addresses on reserved
 * test domains such as @parklet.test are never sent. A failed send is logged
 * and does not fail the action that sent it; the copy in the outbox remains.
 *
 * If MAIL_OUTBOX is set, mails are also appended to that JSON-lines file
 * (used by the end-to-end tests).
 */
export async function sendMail(mail: Mail): Promise<void> {
  console.info(`[mail] to=${mail.to} subject="${mail.subject}"`);
  await db.insert(mailOutbox).values(mail);
  if (process.env.MAIL_OUTBOX) {
    const file = path.resolve(/*turbopackIgnore: true*/ process.env.MAIL_OUTBOX);
    await mkdir(path.dirname(file), { recursive: true });
    await appendFile(file, JSON.stringify({ ...mail, at: new Date().toISOString() }) + "\n");
  }
  if (process.env.RESEND_API_KEY && isDeliverableAddress(mail.to)) await sendWithResend(mail);
}

async function sendWithResend(mail: Mail) {
  try {
    const res = await fetch(process.env.RESEND_API_URL ?? "https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        // Resend drops a repeated request with the same key, e.g. a retried function.
        "Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM ?? "Parklet <onboarding@resend.dev>",
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        ...(mail.html ? { html: mail.html } : {}),
        ...(process.env.MAIL_REPLY_TO ? { reply_to: process.env.MAIL_REPLY_TO } : {}),
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.error(`[mail] Resend refused the mail: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  } catch (err) {
    console.error("[mail] Resend request failed", err instanceof Error ? err.message : err);
  }
}
