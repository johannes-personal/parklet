import "server-only";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

export type Mail = { to: string; subject: string; text: string };

/**
 * Development mailer: prints emails to the server log and appends them to
 * storage/outbox.jsonl so links (password reset, BRF approval, invitations)
 * can be followed locally and in end-to-end tests. Swap for Postmark, Resend
 * or SES in production by implementing the same function.
 */
export async function sendMail(mail: Mail): Promise<void> {
  if (process.env.NODE_ENV === "production" && !process.env.MAIL_OUTBOX) {
    throw new Error("No mail provider configured");
  }
  console.info(`\n[mail] to=${mail.to} subject="${mail.subject}"\n${mail.text}\n`);
  const file = process.env.MAIL_OUTBOX ?? path.join(process.cwd(), "storage", "outbox.jsonl");
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, JSON.stringify({ ...mail, at: new Date().toISOString() }) + "\n");
}
