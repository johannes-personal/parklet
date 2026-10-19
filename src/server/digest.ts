import "server-only";
import { and, asc, count, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
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
  const since = new Date(now.getTime() - 24 * 3600_000);
  const [pendingSpots, pendingAccounts, newSpots, newAccounts, newUsers, booked, cancelled, overdue] = await Promise.all([
    db
      .select({ id: spots.id, title: spots.title, submittedAt: spots.submittedAt })
      .from(spots)
      .where(eq(spots.review, "pending_review"))
      .orderBy(asc(spots.submittedAt)),
    db
      .select({ id: hostAccounts.id, name: hostAccounts.name, createdAt: hostAccounts.createdAt })
      .from(hostAccounts)
      .where(eq(hostAccounts.verificationStatus, "pending"))
      .orderBy(asc(hostAccounts.createdAt)),
    db.select({ n: count() }).from(spots).where(gte(spots.createdAt, since)),
    db.select({ n: count() }).from(hostAccounts).where(gte(hostAccounts.createdAt, since)),
    db.select({ n: count() }).from(users).where(gte(users.createdAt, since)),
    db
      .select({ n: count(), ore: sql<number>`coalesce(sum(${bookings.totalOre}), 0)`.mapWith(Number) })
      .from(bookings)
      .where(and(eq(bookings.status, "confirmed"), gte(bookings.confirmedAt, since))),
    db.select({ n: count() }).from(bookings).where(and(eq(bookings.status, "cancelled"), gte(bookings.cancelledAt, since))),
    db.select({ n: count() }).from(bookings).where(gte(bookings.vehicleOverdueNotifiedAt, since)),
  ]);

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

  const admins = await db.select({ email: users.email }).from(users).where(eq(users.isAdmin, true));
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
