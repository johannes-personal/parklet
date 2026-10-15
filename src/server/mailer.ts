import "server-only";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { db } from "@/db";
import { mailOutbox } from "@/db/schema";

export type Mail = { to: string; subject: string; text: string };

/**
 * Outbox mailer used until a real provider (Postmark, Resend, SES) is wired
 * in: every e-mail is logged and stored in the mail_outbox table, where
 * Parklet admins can read it at /admin/epost (so the demo's approval,
 * invitation and reset links can be followed). If MAIL_OUTBOX is set, mails
 * are also appended to that JSON-lines file (used by the end-to-end tests).
 */
export async function sendMail(mail: Mail): Promise<void> {
  console.info(`[mail] to=${mail.to} subject="${mail.subject}"`);
  await db.insert(mailOutbox).values(mail);
  if (process.env.MAIL_OUTBOX) {
    const file = path.resolve(/*turbopackIgnore: true*/ process.env.MAIL_OUTBOX);
    await mkdir(path.dirname(file), { recursive: true });
    await appendFile(file, JSON.stringify({ ...mail, at: new Date().toISOString() }) + "\n");
  }
}
