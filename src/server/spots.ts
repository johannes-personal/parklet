import { appUrl } from "@/lib/app-url";
import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { availabilityWindows, bookings, documents, hostAccounts, spots, type HostAccount, type Spot } from "@/db/schema";
import { normalizeWindows, type AvailabilityWindow } from "@/lib/availability";
import { scheduleToWindows } from "@/lib/schedule";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import type { SpotInput } from "@/lib/validation";
import { isUuid } from "./ids";
import { sendMail } from "./mailer";
import { notifyAccount } from "./notifications";

export { isUuid };

export type SpotWithWindows = Spot & { windows: AvailabilityWindow[] };

/** SQL condition for a spot that drivers can book. Kept in one place so search and booking agree. */
export const bookableSql = sql`${spots.status} = 'active' AND ${spots.review} = 'approved' AND ${hostAccounts.verificationStatus} = 'verified' AND ${hostAccounts.payoutStatus} = 'active'`;

export function isBookable(spot: Pick<Spot, "status" | "review">, account: Pick<HostAccount, "verificationStatus" | "payoutStatus">) {
  return spot.status === "active" && spot.review === "approved" && account.verificationStatus === "verified" && account.payoutStatus === "active";
}

export async function getSpot(id: string): Promise<SpotWithWindows | null> {
  if (!isUuid(id)) return null;
  const [spot] = await db.select().from(spots).where(eq(spots.id, id)).limit(1);
  if (!spot) return null;
  return { ...spot, windows: await getWindows(id) };
}

export async function getSpotWithAccount(id: string) {
  if (!isUuid(id)) return null;
  const [row] = await db.select({ spot: spots, account: hostAccounts }).from(spots).innerJoin(hostAccounts, eq(hostAccounts.id, spots.hostAccountId)).where(eq(spots.id, id)).limit(1);
  if (!row) return null;
  return { spot: { ...row.spot, windows: await getWindows(id) }, account: row.account };
}

async function getWindows(spotId: string): Promise<AvailabilityWindow[]> {
  return db
    .select({ weekday: availabilityWindows.weekday, startMinute: availabilityWindows.startMinute, endMinute: availabilityWindows.endMinute })
    .from(availabilityWindows)
    .where(eq(availabilityWindows.spotId, spotId))
    .orderBy(asc(availabilityWindows.weekday), asc(availabilityWindows.startMinute));
}

/** Fields whose change invalidates an earlier right-to-rent approval. */
const REVIEWED_FIELDS = ["address", "city", "lat", "lng", "rightBasis", "landlordKind"] as const;

function rightFields(input: SpotInput) {
  const rents = input.rightBasis === "rents";
  return {
    landlordKind: rents ? input.landlordKind : null,
    landlordName: rents ? input.landlordName || null : null,
    landlordEmail: rents ? input.landlordEmail || null : null,
  };
}

/** Creates one spot, or several numbered spots for organisations ("Plats 1", "Plats 2", …). Returns the ids. */
export async function createSpots(
  accountId: string,
  userId: string,
  input: SpotInput,
  count = 1,
): Promise<string[]> {
  const windows = scheduleToWindows(input.schedule);
  return db.transaction(async (tx) => {
    const ids: string[] = [];
    for (let i = 1; i <= count; i++) {
      const [row] = await tx
        .insert(spots)
        .values({
          ...input,
          ...rightFields(input),
          title: count > 1 ? `${input.title} – Plats ${i}` : input.title,
          hostAccountId: accountId,
          createdBy: userId,
          landlordApproval: input.rightBasis === "rents" ? "missing" : "not_needed",
          review: "draft",
        })
        .returning({ id: spots.id });
      ids.push(row.id);
      await replaceWindows(tx, row.id, windows);
    }
    return ids;
  });
}

export async function updateSpot(accountId: string, spotId: string, input: SpotInput) {
  const windows = scheduleToWindows(input.schedule);
  const existing = await getSpot(spotId);
  if (!existing || existing.hostAccountId !== accountId) return false;
  const next = { ...input, ...rightFields(input) };
  const reviewedChanged = REVIEWED_FIELDS.some((f) => existing[f] !== next[f]);
  const landlordChanged = existing.landlordEmail !== next.landlordEmail || existing.rightBasis !== next.rightBasis;

  await db.transaction(async (tx) => {
    await tx
      .update(spots)
      .set({
        ...next,
        updatedAt: new Date(),
        // A moved spot or a new legal basis must be verified again before it can be booked.
        ...(reviewedChanged && existing.review !== "draft" ? { review: "pending_review" as const, submittedAt: new Date() } : {}),
        ...(landlordChanged
          ? {
              landlordApproval: next.rightBasis === "rents" ? ("missing" as const) : ("not_needed" as const),
              landlordApprovalTokenHash: null,
              landlordApprovedByName: null,
              landlordApprovedByRole: null,
              landlordRespondedAt: null,
            }
          : {}),
      })
      .where(eq(spots.id, spotId));
    await replaceWindows(tx, spotId, windows);
  });
  return true;
}

export async function setSpotStatus(accountId: string, spotId: string, status: "active" | "paused") {
  if (!isUuid(spotId)) return false;
  const updated = await db
    .update(spots)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(spots.id, spotId), eq(spots.hostAccountId, accountId)))
    .returning({ id: spots.id });
  return updated.length > 0;
}

type TxLike = Pick<typeof db, "insert" | "delete">;

async function replaceWindows(tx: TxLike, spotId: string, windows: AvailabilityWindow[]) {
  await tx.delete(availabilityWindows).where(eq(availabilityWindows.spotId, spotId));
  const normalized = normalizeWindows(windows);
  if (normalized.length) await tx.insert(availabilityWindows).values(normalized.map((w) => ({ ...w, spotId })));
}

export async function listSpotDocuments(spotId: string) {
  return db.select().from(documents).where(eq(documents.spotId, spotId)).orderBy(asc(documents.createdAt));
}

/* --------------------------------------------- right-to-rent requirements */

export type Requirement = { key: string; label: string; done: boolean; hint?: string };

/** What a host must provide for a spot before it can be submitted for review. */
export function spotRequirements(spot: Spot, docs: { kind: string }[]): Requirement[] {
  const has = (kind: string) => docs.some((d) => d.kind === kind);
  const reqs: Requirement[] = [];
  if (spot.rightBasis === "owns") {
    reqs.push({
      key: "ownership_proof",
      label: "Bevis på att du äger platsen",
      hint: "T.ex. fastighetsutdrag/lagfart, köpekontrakt eller upplåtelseavtal där platsen ingår.",
      done: has("ownership_proof"),
    });
  } else {
    const who = spot.landlordKind === "brf" ? "bostadsrättsföreningen" : "hyresvärden";
    reqs.push({
      key: "rental_contract",
      label: `Ditt hyresavtal för platsen med ${who}`,
      done: has("rental_contract"),
    });
    reqs.push({
      key: "landlord_approval",
      label: `Godkännande från ${who} att platsen får hyras ut`,
      hint: `Skicka en godkännandeförfrågan direkt till ${who} via Parklet, eller ladda upp ett skriftligt godkännande.`,
      done: spot.landlordApproval === "approved" || has("sublet_permission"),
    });
  }
  return reqs;
}

export async function submitSpotForReview(accountId: string, spotId: string) {
  const spot = await getSpot(spotId);
  if (!spot || spot.hostAccountId !== accountId) return { ok: false as const, error: "Platsen finns inte." };
  if (spot.landlordApproval === "declined") {
    return { ok: false as const, error: "Hyresvärden/föreningen har nekat uthyrning av platsen. Den kan inte skickas in." };
  }
  const missing = spotRequirements(spot, await listSpotDocuments(spotId)).filter((r) => !r.done);
  if (missing.length) return { ok: false as const, error: `Det saknas underlag: ${missing.map((m) => m.label.toLowerCase()).join("; ")}.` };
  if (spot.windows.length === 0) return { ok: false as const, error: "Ange minst en tid då platsen är tillgänglig." };
  await db.update(spots).set({ review: "pending_review", submittedAt: new Date(), reviewNote: null }).where(eq(spots.id, spotId));
  return { ok: true as const };
}

/* ------------------------------------------------- landlord / BRF approval */

export async function requestLandlordApproval(accountId: string, spotId: string, requestedBy: string) {
  const row = await getSpotWithAccount(spotId);
  if (!row || row.spot.hostAccountId !== accountId) return { ok: false as const, error: "Platsen finns inte." };
  const { spot, account } = row;
  if (spot.rightBasis !== "rents" || !spot.landlordEmail) {
    return { ok: false as const, error: "Ange föreningens eller hyresvärdens e-postadress först." };
  }
  const token = generateToken();
  await db.update(spots).set({ landlordApproval: "requested", landlordApprovalTokenHash: hashToken(token) }).where(eq(spots.id, spotId));
  const who = spot.landlordKind === "brf" ? "föreningen" : "er som hyresvärd";
  await sendMail({
    to: spot.landlordEmail,
    subject: `Godkännande för uthyrning av parkeringsplats – ${spot.address}`,
    text:
      `Hej${spot.landlordName ? " " + spot.landlordName : ""}!\n\n` +
      `${requestedBy} (uthyrarkonto "${account.name}") vill hyra ut parkeringsplatsen på ${spot.address}, ${spot.city} via Parklet ` +
      `när den inte används, och behöver godkännande från ${who}.\n\n` +
      `Granska och godkänn eller neka här:\n${appUrl()}/godkannande/${token}\n\n` +
      `Om föreningen kräver att tillfälliga hyresgästers bilar registreras kan ni ange det i formuläret.\n`,
  });
  return { ok: true as const };
}

export async function getSpotByApprovalToken(token: string) {
  const [row] = await db
    .select({ spot: spots, accountName: hostAccounts.name })
    .from(spots)
    .innerJoin(hostAccounts, eq(hostAccounts.id, spots.hostAccountId))
    .where(eq(spots.landlordApprovalTokenHash, hashToken(token)))
    .limit(1);
  return row ?? null;
}

export async function respondToLandlordApproval(
  token: string,
  input: { approve: boolean; name: string; role: string; requiresVehicleRegistration: boolean; vehicleRegistrationNote: string },
) {
  const found = await getSpotByApprovalToken(token);
  if (!found || found.spot.landlordApproval !== "requested") return { ok: false as const, error: "Länken är ogiltig eller redan använd." };
  await db
    .update(spots)
    .set({
      landlordApproval: input.approve ? "approved" : "declined",
      landlordApprovedByName: input.name,
      landlordApprovedByRole: input.role,
      landlordRespondedAt: new Date(),
      landlordApprovalTokenHash: null,
      // The association can impose its own vehicle registration rule.
      ...(input.approve && input.requiresVehicleRegistration
        ? { requiresVehicleRegistration: true, vehicleRegistrationNote: input.vehicleRegistrationNote, minNoticeMinutes: sql`greatest(${spots.minNoticeMinutes}, 1440)` }
        : {}),
      // A declined approval pulls an approved spot out of search immediately.
      ...(input.approve ? {} : { review: sql`case when ${spots.review} = 'approved' then 'rejected'::spot_review else ${spots.review} end` }),
    })
    .where(eq(spots.id, found.spot.id));
  const who = input.role ? `${input.name} (${input.role})` : input.name;
  await notifyAccount(found.spot.hostAccountId, {
    kind: "landlord_response",
    title: input.approve ? `${found.spot.title}: uthyrningen är godkänd` : `${found.spot.title}: uthyrningen nekades`,
    body: input.approve
      ? `${who} har godkänt att platsen hyrs ut via Parklet.${input.requiresVehicleRegistration ? " Föreningen kräver att tillfälliga hyresgästers bilar registreras." : ""} Skicka in platsen för granskning om du inte redan har gjort det.`
      : `${who} har nekat uthyrning av platsen. Den kan inte hyras ut via Parklet.`,
    href: `/uthyrare/${found.spot.hostAccountId}/platser/${found.spot.id}`,
  });
  return { ok: true as const };
}

/* ------------------------------------------------------- host dashboards */

export type HostSpotSummary = Spot & { upcomingBookings: number; earnedOre: number };

export async function listAccountSpots(accountId: string): Promise<HostSpotSummary[]> {
  const rows = await db
    .select({
      spot: spots,
      upcomingBookings: sql<number>`count(${bookings.id}) filter (where ${bookings.status} = 'confirmed' and ${bookings.endsAt} > now())`.mapWith(Number),
      earnedOre: sql<number>`coalesce(sum(${bookings.baseOre}) filter (where ${bookings.status} = 'confirmed'), 0)`.mapWith(Number),
    })
    .from(spots)
    .leftJoin(bookings, eq(bookings.spotId, spots.id))
    .where(eq(spots.hostAccountId, accountId))
    .groupBy(spots.id)
    .orderBy(asc(spots.createdAt));
  return rows.map((r) => ({ ...r.spot, upcomingBookings: r.upcomingBookings, earnedOre: r.earnedOre }));
}

/* ------------------------------------------------------------ admin review */

export async function listReviewQueue() {
  const pendingSpots = await db
    .select({ spot: spots, accountName: hostAccounts.name, accountKind: hostAccounts.kind })
    .from(spots)
    .innerJoin(hostAccounts, eq(hostAccounts.id, spots.hostAccountId))
    .where(eq(spots.review, "pending_review"))
    .orderBy(asc(spots.submittedAt));
  const pendingAccounts = await db.select().from(hostAccounts).where(eq(hostAccounts.verificationStatus, "pending")).orderBy(asc(hostAccounts.createdAt));
  return { pendingSpots, pendingAccounts };
}

export async function reviewSpot(spotId: string, adminId: string, approve: boolean, note: string | null) {
  if (!isUuid(spotId)) return false;
  const updated = await db
    .update(spots)
    .set({ review: approve ? "approved" : "rejected", reviewNote: note, reviewedAt: new Date(), reviewedBy: adminId })
    .where(and(eq(spots.id, spotId), inArray(spots.review, ["pending_review", "approved", "rejected"])))
    .returning({ id: spots.id });
  return updated.length > 0;
}

export async function reviewAccount(accountId: string, approve: boolean, note: string | null) {
  if (!isUuid(accountId)) return false;
  const updated = await db
    .update(hostAccounts)
    .set({ verificationStatus: approve ? "verified" : "rejected", reviewNote: note, reviewedAt: new Date() })
    .where(eq(hostAccounts.id, accountId))
    .returning({ id: hostAccounts.id });
  return updated.length > 0;
}

export async function listRecentlyReviewed() {
  return db
    .select({ id: spots.id, title: spots.title, review: spots.review, reviewedAt: spots.reviewedAt })
    .from(spots)
    .where(inArray(spots.review, ["approved", "rejected"]))
    .orderBy(desc(spots.reviewedAt))
    .limit(10);
}

/** Other spots of the same account at the same address (e.g. created together as "Plats 1…N"). */
export async function listSiblingSpots(spot: Pick<Spot, "id" | "hostAccountId" | "address" | "city">) {
  return db
    .select({ id: spots.id, title: spots.title, review: spots.review })
    .from(spots)
    .where(and(eq(spots.hostAccountId, spot.hostAccountId), eq(spots.address, spot.address), eq(spots.city, spot.city), sql`${spots.id} <> ${spot.id}`))
    .orderBy(asc(spots.title));
}
