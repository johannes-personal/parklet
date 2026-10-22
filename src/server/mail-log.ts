import "server-only";
import { api, cols, embed, must, names, parse } from "@/db/api";
import { hostAccounts, mailOutbox, type MailOutbox } from "@/db/schema";
import { listMembers } from "./host-accounts";

const O = names(mailOutbox);

export type LoggedMail = MailOutbox & { accountName: string | null };

/** One sent mail from the log (src/server/mailer.ts), for the admins. */
export async function getMail(id: string): Promise<LoggedMail | null> {
  if (!/^\d{1,12}$/.test(id)) return null;
  const row = must<(Record<string, unknown> & { account: { name: string } | null }) | null>(
    await api().from("mail_outbox").select(`${cols(mailOutbox)},${embed("account", hostAccounts, ["name"])}`).eq(O.id, Number(id)).maybeSingle(),
    "getMail",
  );
  return row ? { ...parse<typeof mailOutbox, MailOutbox>(mailOutbox, row), accountName: row.account?.name ?? null } : null;
}

/**
 * The same mail for a host, if it is one they may read: about their account, and sent
 * to one of its administrators or by them (to the landlord, to an invited administrator),
 * as parklet_admin_search_mail's host view lists them.
 */
export async function getHostMail(accountId: string, id: string): Promise<LoggedMail | null> {
  const mail = await getMail(id);
  if (!mail || mail.hostAccountId !== accountId) return null;
  if (mail.kind === "landlord_approval" || mail.kind === "invitation") return mail;
  const members = await listMembers(accountId);
  return members.some((m) => m.email.toLowerCase() === mail.to.toLowerCase()) ? mail : null;
}
