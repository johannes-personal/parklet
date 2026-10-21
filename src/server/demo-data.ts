import "server-only";
import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import type { PgTable } from "drizzle-orm/pg-core";
import { api, must, mustCount, names, tableName, toDb, type Key } from "@/db/api";
import {
  bookings,
  documentBlobs,
  documents,
  hostAccountMembers,
  hostAccounts,
  identityRequests,
  mailOutbox,
  notifications,
  passwordResetTokens,
  sessions,
  spots,
  users,
  vehicles,
  type HostKind,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { isDeliverableAddress } from "@/lib/email";
import { calculatePrice } from "@/lib/pricing";
import type { Schedule } from "@/lib/schedule";
import { TZ } from "@/lib/time";
import { paymentProviderName } from "./payments";
import { createSpots } from "./spots";
import { deleteDocumentFiles, storeDocument } from "./storage";

/**
 * The demo data: a handful of accounts, spots in four towns and a few
 * bookings. `npm run db:seed` (scripts/seed.mts) and the admin's "Återställ
 * testdata" (/admin/testdata) both load it through resetDemoData, over the
 * HTTP API like the rest of the app, so the two can't drift apart.
 */

/** The demo accounts' password, unless the seed is given another (SEED_PASSWORD). */
export const DEMO_PASSWORD = "parklet-demo-1";

type UserKey = "admin" | "anna" | "erik" | "brfAdmin" | "driver" | "newHost";

/** The demo logins, in the order they are listed. Their addresses are on a test domain, so no mail ever reaches them. */
export const DEMO_USERS: readonly { key: UserKey; email: string; name: string; role: string; isAdmin?: boolean; unverified?: boolean }[] = [
  { key: "admin", email: "admin@parklet.test", name: "Parklet Granskare", role: "Parklets granskare (granskningskön under /admin)", isAdmin: true },
  { key: "anna", email: "anna@parklet.test", name: "Anna Lindqvist", role: "Privat uthyrare (Göteborg, Stockholm, Uppsala)" },
  { key: "erik", email: "erik@parklet.test", name: "Erik Berg", role: "Privat uthyrare och administratör för Kvarteret Fastigheter AB" },
  { key: "brfAdmin", email: "styrelsen@parklet.test", name: "Sara Holm", role: "Brf Linnéstaden (bilen måste registreras)" },
  { key: "driver", email: "forare@parklet.test", name: "Oskar Nilsson", role: "Förare med kommande bokningar" },
  { key: "newHost", email: "ny@parklet.test", name: "Maja Ek", role: "Ny uthyrare utan BankID och utbetalningar", unverified: true },
];

type AccountKey = "anna" | "erik" | "brf" | "office" | "newHost";

const ACCOUNTS: { key: AccountKey; kind: HostKind; name: string; owner: UserKey; extra?: Partial<typeof hostAccounts.$inferInsert> }[] = [
  { key: "anna", kind: "household", name: "Anna Lindqvist", owner: "anna" },
  { key: "erik", kind: "household", name: "Erik Berg", owner: "erik" },
  { key: "brf", kind: "association", name: "Brf Linnéstaden", owner: "brfAdmin", extra: { orgNumber: "769600-1234", signatoryRole: "Styrelseledamot" } },
  { key: "office", kind: "company", name: "Kvarteret Fastigheter AB", owner: "erik", extra: { orgNumber: "556677-8899", signatoryRole: "Förvaltare" } },
  { key: "newHost", kind: "household", name: "Maja Ek", owner: "newHost", extra: { verificationStatus: "unverified", payoutStatus: "not_connected" } },
];

type DemoSpot = {
  acc: AccountKey;
  by: UserKey;
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

const SPOTS: DemoSpot[] = [
  // Göteborg
  { acc: "anna", by: "anna", title: "Uppfart i Majorna", address: "Allmänna vägen 12", city: "Göteborg", lat: 57.6935, lng: 11.9205, type: "driveway", hour: 15, day: 120, schedule: { mode: "weekdaysDaytime" } },
  { acc: "brf", by: "brfAdmin", title: "Garage Linnégatan", address: "Linnégatan 40", city: "Göteborg", lat: 57.6955, lng: 11.9525, type: "garage", hour: 25, day: 180, schedule: { mode: "always" }, ev: true, count: 3, reg: true },
  { acc: "office", by: "erik", title: "Kontorsparkering Gullbergsvass", address: "Gullbergs Strandgata 8", city: "Göteborg", lat: 57.7175, lng: 11.9772, type: "outdoor", hour: 18, day: 140, schedule: { mode: "eveningsWeekends" }, count: 4 },
  { acc: "erik", by: "erik", title: "Carport nära Liseberg", address: "Örgrytevägen 5", city: "Göteborg", lat: 57.6975, lng: 11.9925, type: "carport", hour: 30, day: 200, schedule: { mode: "always" }, covered: true },
  { acc: "anna", by: "anna", title: "Plats vid Järntorget", address: "Första Långgatan 3", city: "Göteborg", lat: 57.6998, lng: 11.9531, type: "outdoor", hour: 22, schedule: { mode: "custom", days: [1, 2, 3, 4, 5].map((d) => ({ weekday: d, from: 8 * 60, to: 17 * 60 })) }, rents: "brf" },
  // Stockholm
  { acc: "erik", by: "erik", title: "Garage på Södermalm", address: "Götgatan 70", city: "Stockholm", lat: 59.3117, lng: 18.0756, type: "garage", hour: 40, day: 300, schedule: { mode: "always" }, ev: true },
  { acc: "office", by: "erik", title: "Kontorsgarage Kungsholmen", address: "Fleminggatan 20", city: "Stockholm", lat: 59.3337, lng: 18.0386, type: "garage", hour: 35, day: 250, schedule: { mode: "eveningsWeekends" }, count: 2 },
  { acc: "anna", by: "anna", title: "Utomhusplats Vasastan", address: "Odengatan 60", city: "Stockholm", lat: 59.3455, lng: 18.0535, type: "outdoor", hour: 30, schedule: { mode: "weekdaysDaytime" } },
  // Malmö & Uppsala
  { acc: "erik", by: "erik", title: "Uppfart Västra Hamnen", address: "Stora Varvsgatan 14", city: "Malmö", lat: 55.6132, lng: 12.9802, type: "driveway", hour: 12, day: 90, schedule: { mode: "always" } },
  { acc: "anna", by: "anna", title: "Plats vid Uppsala C", address: "Kungsgatan 40", city: "Uppsala", lat: 59.8595, lng: 17.6455, type: "outdoor", hour: 14, day: 100, schedule: { mode: "always" } },
  // Waiting for Parklet's review (shows up in /admin)
  { acc: "anna", by: "anna", title: "BRF-plats i Haga", address: "Haga Nygata 20", city: "Göteborg", lat: 57.6984, lng: 11.9605, type: "outdoor", hour: 20, schedule: { mode: "always" }, rents: "brf", review: "pending_review" },
];

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

export type DemoResetResult = {
  /** Admins with a real address, kept with their login (see resetDemoData). */
  keptAdmins: number;
  removed: { users: number; hostAccounts: number; spots: number; bookings: number; documents: number };
  created: { users: number; hostAccounts: number; spots: number; bookings: number; documents: number };
  /** The new demo users' ids by e-mail. */
  userIds: Record<string, string>;
};

/**
 * Wipes the data and loads the demo set. Parklet's own admins survive: every
 * admin whose address can receive mail (so not the demo's @parklet.test ones)
 * keeps their user row (password, BankID identity, admin flag) and the session
 * `keepSessionId`, if it is theirs; everything else they had goes like
 * everyone else's. The database's own secrets (app_secrets) stay.
 *
 * Not one transaction (the HTTP API has none across tables), but every step
 * deletes everything left of its kind, so after a failure running it again
 * finishes the job. Deletes go in foreign-key order, as the API refuses a
 * DELETE without a filter and the restricting keys (bookings → spots → host
 * accounts, everything → users) would refuse the rest.
 */
/**
 * The demo hosts' payout account. With the mock, a made-up one. With Stripe, the demo
 * hosts share one test-mode Express account that has finished onboarding
 * (STRIPE_TEST_CONNECTED_ACCOUNT), so their spots can be paid for at once; without
 * it they start without payouts and connect through Stripe's test onboarding.
 */
export function demoPayout(): { payoutStatus: "active" | "not_connected"; payoutAccountRef: string | null } {
  if (paymentProviderName() !== "stripe") return { payoutStatus: "active", payoutAccountRef: "acct_mock_seed" };
  const shared = process.env.STRIPE_TEST_CONNECTED_ACCOUNT?.trim();
  return shared ? { payoutStatus: "active", payoutAccountRef: shared } : { payoutStatus: "not_connected", payoutAccountRef: null };
}

export async function resetDemoData({ password = DEMO_PASSWORD, keepSessionId = null }: { password?: string; keepSessionId?: string | null } = {}): Promise<DemoResetResult> {
  const U = names(users);
  const admins = must<{ id: string; email: string }[]>(await api().from("users").select(`${U.id},${U.email}`).eq(U.isAdmin, true), "resetDemoData: admins");
  const kept = admins.filter((a) => isDeliverableAddress(a.email)).map((a) => a.id);
  const storageKeys = await allStorageKeys();

  // Bookings and documents hold on to spots and users; spots to host accounts and users.
  const [removedBookings, removedDocuments] = await Promise.all([deleteAll(bookings, "id"), deleteAll(documents, "id")]);
  const removedSpots = await deleteAll(spots, "id"); // and their opening hours
  const [removedAccounts] = await Promise.all([
    deleteAll(hostAccounts, "id"), // and their members and invitations
    deleteAll(mailOutbox, "id"),
    deleteAll(documentBlobs, "storageKey"),
    deleteAll(vehicles, "id"),
    deleteAll(notifications, "id"),
    deleteAll(passwordResetTokens, "id"),
    deleteAll(identityRequests, "state"),
    deleteAll(sessions, "id", (q) => (keepSessionId ? q.neq(names(sessions).id, keepSessionId) : q)),
  ]);
  const removedUsers = await deleteAll(users, "id", (q) => (kept.length ? q.not(U.id, "in", `(${kept.join(",")})`) : q));

  const created = await loadDemoData(password);
  // The files go last: a store that fails here leaves stray files, not documents without one.
  try {
    await deleteDocumentFiles(storageKeys);
  } catch (err) {
    console.error("[demo] removing the old documents' files failed", err instanceof Error ? err.message : err);
  }
  return {
    keptAdmins: kept.length,
    removed: { users: removedUsers, hostAccounts: removedAccounts, spots: removedSpots, bookings: removedBookings, documents: removedDocuments },
    ...created,
  };
}

type DeleteQuery = ReturnType<ReturnType<ReturnType<typeof api>["from"]>["delete"]>;

/** Deletes every row of the table (narrowed by `where`); the API wants a filter, so `key IS NOT NULL` is it. Returns the count. */
async function deleteAll<T extends PgTable>(table: T, key: Key<T>, where: (q: DeleteQuery) => DeleteQuery = (q) => q) {
  const column = (names(table) as Record<string, string>)[key];
  return mustCount(await where(api().from(tableName(table)).delete({ count: "exact" }).not(column, "is", null)), `resetDemoData: ${tableName(table)}`);
}

/** Every document's storage key, a page at a time (the API returns at most 1,000 rows per request). */
async function allStorageKeys(): Promise<string[]> {
  const D = names(documents);
  const keys: string[] = [];
  for (let from = 0; ; from += 1000) {
    const page = must<{ key: string }[]>(
      await api().from("documents").select(`key:${D.storageKey}`).order(D.id).range(from, from + 999),
      "resetDemoData: documents",
    );
    keys.push(...page.map((r) => r.key));
    if (page.length < 1000) return keys;
  }
}

/** Inserts the demo set into an empty database (but for kept admins). A handful of requests, the spots side by side. */
async function loadDemoData(password: string): Promise<Omit<DemoResetResult, "keptAdmins" | "removed">> {
  const hash = await hashPassword(password);
  const now = new Date();
  // Ids are made here, so rows can refer to each other without reading anything back.
  const userId = Object.fromEntries(DEMO_USERS.map((u) => [u.key, randomUUID()])) as Record<UserKey, string>;
  const accountId = Object.fromEntries(ACCOUNTS.map((a) => [a.key, randomUUID()])) as Record<AccountKey, string>;

  must(
    await api()
      .from("users")
      .insert(
        DEMO_USERS.map((u) =>
          toDb(users, {
            id: userId[u.key],
            email: u.email,
            name: u.name,
            passwordHash: hash,
            isAdmin: u.isAdmin ?? false,
            identityVerifiedAt: u.unverified ? null : now,
            identityProvider: u.unverified ? null : "mock-bankid",
          }),
        ),
      ),
    "resetDemoData: users",
  );
  must(
    await api()
      .from("host_accounts")
      .insert(
        ACCOUNTS.map((a) =>
          toDb(hostAccounts, {
            id: accountId[a.key],
            kind: a.kind,
            name: a.name,
            verificationStatus: "verified",
            ...demoPayout(),
            ...a.extra,
          }),
        ),
      ),
    "resetDemoData: host accounts",
  );
  must(
    await api()
      .from("host_account_members")
      .insert(ACCOUNTS.map((a) => toDb(hostAccountMembers, { hostAccountId: accountId[a.key], userId: userId[a.owner], role: "owner" }))),
    "resetDemoData: host account members",
  );

  // Spots are created the way the app creates them, then given their review state.
  const spotIds = await Promise.all(
    SPOTS.map((s) =>
      createSpots(
        accountId[s.acc],
        userId[s.by],
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
      ),
    ),
  );
  const created = SPOTS.flatMap((s, i) => spotIds[i].map((id) => ({ id, s })));
  const S = names(spots);
  const ids = (list: typeof created) => list.map((c) => c.id);
  const approved = created.filter((c) => !c.s.review);
  const pending = created.filter((c) => c.s.review);

  const rented = created.filter((c) => c.s.rents);
  const updates = await Promise.all([
    api().from("spots").update(toDb(spots, { review: "approved", submittedAt: now, reviewedAt: now, reviewedBy: userId.admin })).in(S.id, ids(approved)),
    api().from("spots").update(toDb(spots, { review: "pending_review", submittedAt: now })).in(S.id, ids(pending)),
    // Every rented spot, including those still waiting for review, has its landlord's approval.
    api()
      .from("spots")
      .update(toDb(spots, { landlordApproval: "approved", landlordApprovedByName: "Lena Sjö", landlordApprovedByRole: "Ordförande", landlordRespondedAt: now }))
      .in(S.id, ids(rented)),
  ]);
  for (const result of updates) must(result, "resetDemoData: spot review");

  // The documents the host had to upload for the spots waiting for review, so the admin review is complete.
  const docs = await Promise.all(
    pending.map(async ({ id, s }) => {
      const file = await storeDocument(demoPdf(s.rents ? "Hyresavtal för parkeringsplats (demo)" : "Lagfartsbevis (demo)"));
      if ("error" in file) throw new Error(file.error);
      return toDb(documents, {
        hostAccountId: accountId[s.acc],
        spotId: id,
        uploadedBy: userId[s.by],
        kind: s.rents ? "rental_contract" : "ownership_proof",
        filename: s.rents ? "hyresavtal.pdf" : "lagfart.pdf",
        ...file,
      });
    }),
  );
  if (docs.length) must(await api().from("documents").insert(docs), "resetDemoData: documents");

  // A few bookings so dashboards are not empty, on spots open around the clock so they respect availability.
  const vehicleId = randomUUID();
  const vehicleReg = "ABC123";
  must(await api().from("vehicles").insert(toDb(vehicles, { id: vehicleId, userId: userId.driver, reg: vehicleReg, nickname: "Volvon" })), "resetDemoData: vehicle");
  const firstStart = DateTime.now().setZone(TZ).plus({ days: 2 }).set({ hour: 9, minute: 0, second: 0, millisecond: 0 }).toJSDate();
  const booked = approved
    .filter((c) => c.s.schedule.mode === "always")
    .slice(0, 3)
    .map(({ id, s }, i) => {
      const start = new Date(firstStart.getTime() + i * 3600_000);
      const end = new Date(start.getTime() + 3 * 3600_000);
      const p = calculatePrice({ start, end, pricePerHourOre: s.hour * 100, pricePerDayOre: s.day ? s.day * 100 : null });
      return toDb(bookings, {
        spotId: id,
        driverId: userId.driver,
        vehicleId,
        startsAt: start,
        endsAt: end,
        status: "confirmed",
        vehicleReg,
        vehicleRegistration: s.reg ? "pending" : "not_required",
        baseOre: p.baseOre,
        feeOre: p.feeOre,
        totalOre: p.totalOre,
        paymentProvider: "mock",
        paymentRef: `mock_seed_${i}`,
        paymentStatus: "paid",
        confirmedAt: now,
      });
    });
  must(await api().from("bookings").insert(booked), "resetDemoData: bookings");

  return {
    created: { users: DEMO_USERS.length, hostAccounts: ACCOUNTS.length, spots: created.length, bookings: booked.length, documents: docs.length },
    userIds: Object.fromEntries(DEMO_USERS.map((u) => [u.email, userId[u.key]])),
  };
}
