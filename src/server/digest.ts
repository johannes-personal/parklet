import "server-only";
import { api, cols, must, mustCount, names, parseAll } from "@/db/api";
import { bookings, hostAccounts, spots, users } from "@/db/schema";
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
  const S = names(spots);
  const A = names(hostAccounts);
  const U = names(users);
  const B = names(bookings);
  const head = { count: "exact", head: true } as const;
  const [spotRows, accountRows, newSpotCount, newAccountCount, newUserCount, bookedRows, cancelledCount, overdueCount] = await Promise.all([
    api().from("spots").select(cols(spots, ["id", "title", "submittedAt"])).eq(S.review, "pending_review").order(S.submittedAt),
    api().from("host_accounts").select(cols(hostAccounts, ["id", "name", "createdAt"])).eq(A.verificationStatus, "pending").order(A.createdAt),
    api().from("spots").select(S.id, head).gte(S.createdAt, since),
    api().from("host_accounts").select(A.id, head).gte(A.createdAt, since),
    api().from("users").select(U.id, head).gte(U.createdAt, since),
    api().from("bookings").select(cols(bookings, ["totalOre"])).eq(B.status, "confirmed").gte(B.confirmedAt, since),
    api().from("bookings").select(B.id, head).eq(B.status, "cancelled").gte(B.cancelledAt, since),
    api().from("bookings").select(B.id, head).gte(B.vehicleOverdueNotifiedAt, since),
  ]);
  const what = "sendAdminDigest";
  const pendingSpots = parseAll<typeof spots, { id: string; title: string; submittedAt: Date | null }>(spots, must(spotRows, what));
  const pendingAccounts = parseAll<typeof hostAccounts, { id: string; name: string; createdAt: Date }>(hostAccounts, must(accountRows, what));
  const bookedTotals = must<{ totalOre: number }[]>(bookedRows, what);
  const newSpots = [{ n: mustCount(newSpotCount, what) }];
  const newAccounts = [{ n: mustCount(newAccountCount, what) }];
  const newUsers = [{ n: mustCount(newUserCount, what) }];
  const booked = [{ n: bookedTotals.length, ore: bookedTotals.reduce((sum, b) => sum + b.totalOre, 0) }];
  const cancelled = [{ n: mustCount(cancelledCount, what) }];
  const overdue = [{ n: mustCount(overdueCount, what) }];

  const waiting = pendingSpots.length + pendingAccounts.length;
  const happened = newSpots[0].n + newAccounts[0].n + newUsers[0].n + booked[0].n + cancelled[0].n + overdue[0].n;
  if (waiting === 0 && happened === 0) return { sent: 0 };

  const oldest = [...pendingSpots.map((s) => s.submittedAt), ...pendingAccounts.map((a) => a.createdAt)]
    .filter((d): d is Date => d != null)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  const paragraphs = [
    waiting
      ? `${pendingSpots.length} ${pendingSpots.length === 1 ? "plats" : "platser"} och ${pendingAccounts.length} ${pendingAccounts.length === 1 ? "organisation" : "organisationer"} väntar på granskning${oldest ? `, den äldsta sedan ${formatDateTime(oldest)}` : ""}.`
      : "Inget väntar på granskning.",
    ...(pendingSpots.length
      ? [`Platser:\n${pendingSpots.slice(0, 8).map((s) => `• ${s.title} – ${appUrl()}/admin/platser/${s.id}`).join("\n")}${pendingSpots.length > 8 ? `\n… och ${pendingSpots.length - 8} till` : ""}`]
      : []),
    ...(pendingAccounts.length ? [`Organisationer:\n${pendingAccounts.slice(0, 8).map((a) => `• ${a.name} – ${appUrl()}/admin/konton/${a.id}`).join("\n")}`] : []),
  ];
  const details: [string, string][] = [
    ["Nya bokningar", booked[0].n ? `${booked[0].n} (${formatSek(booked[0].ore)})` : "0"],
    ["Avbokningar", String(cancelled[0].n)],
    ["Bilar ej registrerade vid start", String(overdue[0].n)],
    ["Nya platser", String(newSpots[0].n)],
    ["Nya uthyrarkonton", String(newAccounts[0].n)],
    ["Nya användare", String(newUsers[0].n)],
  ];

  const admins = must<{ email: string }[]>(await api().from("users").select(U.email).eq(U.isAdmin, true), what);
  for (const a of admins) {
    await sendEmail(a.email, waiting ? `Parklet: ${waiting} att granska` : "Parklet: dagens sammanfattning", {
      heading: "Dagens sammanfattning",
      preheader: paragraphs[0],
      paragraphs: [...paragraphs, "Senaste dygnet:"],
      details,
      button: { label: "Öppna granskningen", url: `${appUrl()}/admin` },
      footnote: "Skickas varje morgon till Parklets administratörer när det finns något att rapportera.",
    });
  }
  return { sent: admins.length, waiting, happened };
}
