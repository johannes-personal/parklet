/**
 * Demo data for local development. Run with `npm run db:seed`.
 * Wipes all data first — never point this at production.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { bookings, documents, hostAccountMembers, hostAccounts, spots, users, vehicles } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { calculatePrice } from "@/lib/pricing";
import type { Schedule } from "@/lib/schedule";
import { createSpots } from "@/server/spots";
import { storeDocument } from "@/server/storage";

/** A one-page PDF with a line of text, standing in for an uploaded document. */
function demoPdf(text: string): Buffer {
  const content = `BT /F1 18 Tf 72 760 Td (${text.replace(/[()\\]/g, "")}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((body, i) => {
    const at = Buffer.byteLength(pdf, "latin1");
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed in production");

await db.execute(
  sql`TRUNCATE bookings, availability_windows, documents, document_blobs, mail_outbox, spots, host_invitations, host_account_members, host_accounts, vehicles, password_reset_tokens, sessions, users CASCADE`,
);

// SEED_PASSWORD=random gives every demo account a throwaway random password
// (for public deployments: nobody can log in as them; an admin can still take
// one over with "Glömt lösenord" and the e-mail outbox).
const password =
  process.env.SEED_PASSWORD === "random"
    ? (await import("node:crypto")).randomBytes(24).toString("base64url")
    : (process.env.SEED_PASSWORD ?? "parklet-demo-1");
const hash = await hashPassword(password);
const now = new Date();

async function user(email: string, name: string, extra: Partial<typeof users.$inferInsert> = {}) {
  const [u] = await db.insert(users).values({ email, name, passwordHash: hash, identityVerifiedAt: now, identityProvider: "mock-bankid", ...extra }).returning();
  return u;
}

const admin = await user("admin@parklet.test", "Parklet Granskare", { isAdmin: true });
const anna = await user("anna@parklet.test", "Anna Lindqvist");
const erik = await user("erik@parklet.test", "Erik Berg");
const brfAdmin = await user("styrelsen@parklet.test", "Sara Holm");
const driver = await user("forare@parklet.test", "Oskar Nilsson");
const newHost = await user("ny@parklet.test", "Maja Ek", { identityVerifiedAt: null, identityProvider: null });

async function account(kind: "household" | "association" | "company", name: string, owner: string, extra: Partial<typeof hostAccounts.$inferInsert> = {}) {
  const [a] = await db
    .insert(hostAccounts)
    .values({ kind, name, verificationStatus: "verified", payoutStatus: "active", payoutAccountRef: "acct_mock_seed", ...extra })
    .returning();
  await db.insert(hostAccountMembers).values({ hostAccountId: a.id, userId: owner, role: "owner" });
  return a;
}

const annaAcc = await account("household", anna.name, anna.id);
const erikAcc = await account("household", erik.name, erik.id);
const brf = await account("association", "Brf Linnéstaden", brfAdmin.id, { orgNumber: "769600-1234", signatoryRole: "Styrelseledamot" });
const office = await account("company", "Kvarteret Fastigheter AB", erik.id, { orgNumber: "556677-8899", signatoryRole: "Förvaltare" });
await account("household", newHost.name, newHost.id, { verificationStatus: "unverified", payoutStatus: "not_connected" });

type SeedSpot = {
  acc: { id: string };
  by: string;
  title: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  type: "outdoor" | "garage" | "carport" | "driveway";
  hour: number;
  day?: number;
  schedule: Schedule;
  ev?: boolean;
  covered?: boolean;
  count?: number;
  rents?: "brf" | "landlord";
  reg?: boolean;
  review?: "approved" | "pending_review";
};

const S: SeedSpot[] = [
  // Göteborg
  { acc: annaAcc, by: anna.id, title: "Uppfart i Majorna", address: "Allmänna vägen 12", city: "Göteborg", lat: 57.6935, lng: 11.9205, type: "driveway", hour: 15, day: 120, schedule: { mode: "weekdaysDaytime" } },
  { acc: brf, by: brfAdmin.id, title: "Garage Linnégatan", address: "Linnégatan 40", city: "Göteborg", lat: 57.6955, lng: 11.9525, type: "garage", hour: 25, day: 180, schedule: { mode: "always" }, ev: true, count: 3, reg: true },
  { acc: office, by: erik.id, title: "Kontorsparkering Gullbergsvass", address: "Gullbergs Strandgata 8", city: "Göteborg", lat: 57.7175, lng: 11.9772, type: "outdoor", hour: 18, day: 140, schedule: { mode: "eveningsWeekends" }, count: 4 },
  { acc: erikAcc, by: erik.id, title: "Carport nära Liseberg", address: "Örgrytevägen 5", city: "Göteborg", lat: 57.6975, lng: 11.9925, type: "carport", hour: 30, day: 200, schedule: { mode: "always" }, covered: true },
  { acc: annaAcc, by: anna.id, title: "Plats vid Järntorget", address: "Första Långgatan 3", city: "Göteborg", lat: 57.6998, lng: 11.9531, type: "outdoor", hour: 22, schedule: { mode: "custom", days: [1, 2, 3, 4, 5].map((d) => ({ weekday: d, from: 8 * 60, to: 17 * 60 })) }, rents: "brf" },
  // Stockholm
  { acc: erikAcc, by: erik.id, title: "Garage på Södermalm", address: "Götgatan 70", city: "Stockholm", lat: 59.3117, lng: 18.0756, type: "garage", hour: 40, day: 300, schedule: { mode: "always" }, ev: true },
  { acc: office, by: erik.id, title: "Kontorsgarage Kungsholmen", address: "Fleminggatan 20", city: "Stockholm", lat: 59.3337, lng: 18.0386, type: "garage", hour: 35, day: 250, schedule: { mode: "eveningsWeekends" }, count: 2 },
  { acc: annaAcc, by: anna.id, title: "Utomhusplats Vasastan", address: "Odengatan 60", city: "Stockholm", lat: 59.3455, lng: 18.0535, type: "outdoor", hour: 30, schedule: { mode: "weekdaysDaytime" } },
  // Malmö & Uppsala
  { acc: erikAcc, by: erik.id, title: "Uppfart Västra Hamnen", address: "Stora Varvsgatan 14", city: "Malmö", lat: 55.6132, lng: 12.9802, type: "driveway", hour: 12, day: 90, schedule: { mode: "always" } },
  { acc: annaAcc, by: anna.id, title: "Plats vid Uppsala C", address: "Kungsgatan 40", city: "Uppsala", lat: 59.8595, lng: 17.6455, type: "outdoor", hour: 14, day: 100, schedule: { mode: "always" } },
  // Waiting for Parklet's review (shows up in /admin)
  { acc: annaAcc, by: anna.id, title: "BRF-plats i Haga", address: "Haga Nygata 20", city: "Göteborg", lat: 57.6984, lng: 11.9605, type: "outdoor", hour: 20, schedule: { mode: "always" }, rents: "brf", review: "pending_review" },
];

const created: { id: string; hour: number; day: number | null; always: boolean; reg: boolean }[] = [];
for (const s of S) {
  const ids = await createSpots(
    s.acc.id,
    s.by,
    {
      title: s.title,
      description: s.type === "garage" ? "Inomhus, väl upplyst. Plats för en vanlig personbil." : "Lätt att hitta, nära kollektivtrafik.",
      address: s.address,
      city: s.city,
      lat: s.lat,
      lng: s.lng,
      spotType: s.type,
      covered: s.covered ?? s.type === "garage",
      evCharging: s.ev ?? false,
      maxHeightCm: s.type === "garage" ? 210 : null,
      pricePerHourOre: s.hour * 100,
      pricePerDayOre: s.day ? s.day * 100 : null,
      minDurationMinutes: 60,
      minNoticeMinutes: s.reg ? 1440 : 0,
      cancellationHours: 2,
      accessInstructions: s.type === "garage" ? "Portkod 4521#. Platsen är märkt med nummer i garaget." : "Platsen är märkt med en P-skylt.",
      visibility: "public",
      schedule: s.schedule,
      rightBasis: s.rents ? "rents" : "owns",
      landlordKind: s.rents ?? null,
      landlordName: s.rents ? "Brf Haga" : "",
      landlordEmail: s.rents ? "styrelsen.haga@example.com" : "",
      requiresVehicleRegistration: s.reg ?? false,
      vehicleRegistrationNote: s.reg ? "Bilen registreras i föreningens parkeringsapp senast dagen innan." : "",
    },
    s.count ?? 1,
  );
  for (const id of ids) {
    await db
      .update(spots)
      .set({
        review: s.review ?? "approved",
        submittedAt: now,
        reviewedAt: s.review ? null : now,
        reviewedBy: s.review ? null : admin.id,
        // Every rented spot, including those still waiting for review, has its landlord's approval.
        ...(s.rents ? { landlordApproval: "approved" as const, landlordApprovedByName: "Lena Sjö", landlordApprovedByRole: "Ordförande", landlordRespondedAt: now } : {}),
      })
      .where(sql`${spots.id} = ${id}`);
    if (s.review) {
      // Spots waiting for review have the documents the host had to upload, so the admin review is complete.
      const file = await storeDocument(demoPdf(s.rents ? "Hyresavtal för parkeringsplats (demo)" : "Lagfartsbevis (demo)"));
      if ("error" in file) throw new Error(file.error);
      await db.insert(documents).values({
        hostAccountId: s.acc.id,
        spotId: id,
        uploadedBy: s.by,
        kind: s.rents ? "rental_contract" : "ownership_proof",
        filename: s.rents ? "hyresavtal.pdf" : "lagfart.pdf",
        ...file,
      });
    }
    if (!s.review) created.push({ id, hour: s.hour * 100, day: s.day ? s.day * 100 : null, always: s.schedule.mode === "always", reg: s.reg ?? false });
  }
}

// A few bookings so dashboards are not empty.
const [car] = await db.insert(vehicles).values({ userId: driver.id, reg: "ABC123", nickname: "Volvon" }).returning();
const tomorrow9 = new Date(now);
tomorrow9.setDate(now.getDate() + 2);
tomorrow9.setHours(9, 0, 0, 0);
// Book spots that are open around the clock so the demo bookings respect availability.
for (const [i, s] of created.filter((c) => c.always).slice(0, 3).entries()) {
  const start = new Date(tomorrow9.getTime() + i * 3600_000);
  const end = new Date(start.getTime() + 3 * 3600_000);
  const p = calculatePrice({ start, end, pricePerHourOre: s.hour, pricePerDayOre: s.day });
  await db.insert(bookings).values({
    spotId: s.id,
    driverId: driver.id,
    vehicleId: car.id,
    startsAt: start,
    endsAt: end,
    status: "confirmed",
    vehicleReg: car.reg,
    vehicleRegistration: s.reg ? "pending" : "not_required",
    baseOre: p.baseOre,
    feeOre: p.feeOre,
    totalOre: p.totalOre,
    paymentProvider: "mock",
    paymentRef: `mock_seed_${i}`,
    paymentStatus: "paid",
    confirmedAt: now,
  });
}

console.log(`Seeded ${created.length} bookable spots. All demo users have the password "${process.env.SEED_PASSWORD ? "(not shown)" : password}":
  admin@parklet.test      Parklet admin (review queue at /admin)
  anna@parklet.test       Private host (Göteborg, Stockholm, Uppsala)
  erik@parklet.test       Private host + admin of Kvarteret Fastigheter AB
  styrelsen@parklet.test  Brf Linnéstaden (requires vehicle registration)
  forare@parklet.test     Driver with upcoming bookings
  ny@parklet.test         New host who has not verified or connected payouts`);
await db.$client.end();
