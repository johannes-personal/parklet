import "server-only";
import { api, must, names, rpc } from "@/db/api";
import { users } from "@/db/schema";
import { appUrl } from "@/lib/app-url";
import { formatSek } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { sendEmail } from "./mailer";

/**
 * The admins' morning summary: what is waiting for review (and for how
 * long), and what happened in the last 24 hours. Sent only when there is
 * something to report.
 */
export async function sendAdminDigest(now = new Date()) {
  const since = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const d = await rpc<{
    pending_spots: { id: string; title: string }[];
    pending_spot_count: number;
    pending_accounts: { id: string; name: string }[];
    pending_account_count: number;
    oldest_waiting: string | null;
    new_spots: number;
    new_accounts: number;
    new_users: number;
    booked: number;
    booked_ore: number;
    cancelled: number;
    overdue: number;
  }>("parklet_admin_digest", { p_since: since });

  const waiting = d.pending_spot_count + d.pending_account_count;
  const happened = d.new_spots + d.new_accounts + d.new_users + d.booked + d.cancelled + d.overdue;
  if (waiting === 0 && happened === 0) return { sent: 0 };

  const oldest = d.oldest_waiting ? new Date(d.oldest_waiting) : null;
  const paragraphs = [
    waiting
      ? `${d.pending_spot_count} ${d.pending_spot_count === 1 ? "plats" : "platser"} och ${d.pending_account_count} ${d.pending_account_count === 1 ? "organisation" : "organisationer"} väntar på granskning${oldest ? `, den äldsta sedan ${formatDateTime(oldest)}` : ""}.`
      : "Inget väntar på granskning.",
    ...(d.pending_spots.length
      ? [`Platser:\n${d.pending_spots.map((s) => `• ${s.title} – ${appUrl()}/admin/platser/${s.id}`).join("\n")}${d.pending_spot_count > d.pending_spots.length ? `\n… och ${d.pending_spot_count - d.pending_spots.length} till` : ""}`]
      : []),
    ...(d.pending_accounts.length
      ? [`Uthyrarkonton:\n${d.pending_accounts.map((a) => `• ${a.name} – ${appUrl()}/admin/konton/${a.id}`).join("\n")}${d.pending_account_count > d.pending_accounts.length ? `\n… och ${d.pending_account_count - d.pending_accounts.length} till` : ""}`]
      : []),
  ];
  const details: [string, string][] = [
    ["Nya bokningar", d.booked ? `${d.booked} (${formatSek(Number(d.booked_ore))})` : "0"],
    ["Avbokningar", String(d.cancelled)],
    ["Bilar ej registrerade vid start", String(d.overdue)],
    ["Nya platser", String(d.new_spots)],
    ["Nya uthyrarkonton", String(d.new_accounts)],
    ["Nya användare", String(d.new_users)],
  ];

  const U = names(users);
  const admins = must<{ email: string }[]>(await api().from("users").select(U.email).eq(U.isAdmin, true), "sendAdminDigest");
  for (const a of admins) {
    await sendEmail(a.email, waiting ? `Parklet: ${waiting} att granska` : "Parklet: dagens sammanfattning", {
      heading: "Dagens sammanfattning",
      preheader: paragraphs[0],
      paragraphs: [...paragraphs, "Senaste dygnet:"],
      details,
      button: { label: "Öppna granskningen", url: `${appUrl()}/admin` },
      footnote: "Skickas varje morgon till Parklets administratörer när det finns något att rapportera.",
    }, { kind: "digest" });
  }
  return { sent: admins.length, waiting, happened };
}
