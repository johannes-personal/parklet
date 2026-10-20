import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, db } from "./direct-db";
import { documents, hostAccounts, spots } from "@/db/schema";
import type { SpotInput } from "@/lib/validation";
import { hashToken } from "@/lib/auth/tokens";
import { searchSpots } from "@/server/search";
import {
  accountDecisions,
  deleteSpotDocument,
  getSpot,
  requestLandlordApproval,
  respondToLandlordApproval,
  reviewAccount,
  reviewSpot,
  spotDecisions,
  submitSpotForReview,
  updateSpot,
  withdrawSpotFromReview,
} from "@/server/spots";
import { makeBookableSpot, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(async () => {
  await closeDb();
});

/** The input updateSpot gets from the form, for a spot as it is now. */
async function inputOf(spotId: string, overrides: Partial<SpotInput> = {}): Promise<SpotInput> {
  const s = (await getSpot(spotId))!;
  return {
    title: s.title,
    description: s.description,
    address: s.address,
    city: s.city,
    lat: s.lat,
    lng: s.lng,
    spotType: s.spotType,
    covered: s.covered,
    evCharging: s.evCharging,
    maxHeightCm: s.maxHeightCm,
    pricePerHourOre: s.pricePerHourOre,
    pricePerDayOre: s.pricePerDayOre,
    minDurationMinutes: s.minDurationMinutes,
    minNoticeMinutes: s.minNoticeMinutes,
    cancellationHours: s.cancellationHours,
    accessInstructions: s.accessInstructions,
    visibility: s.visibility,
    schedule: { mode: "always" },
    rightBasis: s.rightBasis,
    landlordKind: s.landlordKind,
    landlordName: s.landlordName ?? "",
    landlordEmail: s.landlordEmail ?? "",
    requiresVehicleRegistration: s.requiresVehicleRegistration,
    vehicleRegistrationNote: s.vehicleRegistrationNote,
    ...overrides,
  } as SpotInput;
}

/** An approved spot rented from a BRF whose board approved it by link, requiring registration. */
async function approvedBrfSpot() {
  // The request is sent while the spot is a draft; Parklet approves the spot afterwards.
  const made = await makeBookableSpot({ review: "draft", rightBasis: "rents", landlordKind: "brf", landlordEmail: "styrelsen@brf.example", landlordApproval: "missing" });
  expect(await requestLandlordApproval(made.account.id, made.spotId, "Värd")).toEqual({ ok: true });
  // The token is only in the e-mail; give the spot a known one instead.
  await db.update(spots).set({ landlordApprovalTokenHash: hashToken("brf-token") }).where(eq(spots.id, made.spotId));
  const answer = { approve: true, name: "Lena", role: "Ordförande", requiresVehicleRegistration: true, vehicleRegistrationNote: "Registreras i Aimo" };
  expect(await respondToLandlordApproval("brf-token", answer)).toEqual({ ok: true });
  await db.update(spots).set({ review: "approved" }).where(eq(spots.id, made.spotId));
  return made;
}

describe("the BRF's registration rule", () => {
  it("is recorded with the approval and can't be switched off by the host", async () => {
    const { account, spotId } = await approvedBrfSpot();
    expect(await getSpot(spotId)).toMatchObject({ landlordRequiresRegistration: true, requiresVehicleRegistration: true, minNoticeMinutes: 1440 });

    expect(await updateSpot(account.id, spotId, await inputOf(spotId, { requiresVehicleRegistration: false, minNoticeMinutes: 0, vehicleRegistrationNote: "" }))).toBe(true);
    expect(await getSpot(spotId)).toMatchObject({
      requiresVehicleRegistration: true,
      minNoticeMinutes: 1440,
      vehicleRegistrationNote: "Registreras i Aimo",
      review: "approved",
    });
  });

  it("goes with the approval when the host names another landlord, and the spot needs a new approval before it can be booked", async () => {
    const { account, spotId } = await approvedBrfSpot();
    expect(await updateSpot(account.id, spotId, await inputOf(spotId, { landlordEmail: "ny.styrelse@brf.example" }))).toBe(true);
    const spot = await getSpot(spotId);
    expect(spot).toMatchObject({ review: "draft", landlordApproval: "missing", landlordApprovedByName: null, landlordRequiresRegistration: false, submittedAt: null });
    expect((await searchSpots({ center: { lat: 57.7, lng: 11.97 }, start: null, end: null })).results).toEqual([]);
  });
});

describe("documents and review state", () => {
  async function pendingSpotWithDocument() {
    const made = await makeBookableSpot({ review: "pending_review", submittedAt: new Date() });
    const [doc] = await db
      .insert(documents)
      .values({ hostAccountId: made.account.id, spotId: made.spotId, uploadedBy: made.host.id, kind: "ownership_proof", filename: "lagfart.pdf", storageKey: "x/lagfart.pdf", mimeType: "application/pdf", sizeBytes: 10 })
      .returning();
    return { ...made, doc };
  }

  it("locks documents while a spot is under review, until the host takes it back", async () => {
    const { account, spotId, doc } = await pendingSpotWithDocument();
    expect(await deleteSpotDocument(account.id, spotId, doc.id)).toEqual({ ok: false, error: expect.stringContaining("låsta medan Parklet granskar") });
    expect(await submitSpotForReview(account.id, spotId)).toEqual({ ok: false, error: "Platsen granskas redan." });

    expect(await withdrawSpotFromReview(account.id, spotId)).toBe(true);
    expect(await getSpot(spotId)).toMatchObject({ review: "draft", submittedAt: null });
    // Only once, and only from review.
    expect(await withdrawSpotFromReview(account.id, spotId)).toBe(false);
    expect(await deleteSpotDocument(account.id, spotId, doc.id)).toEqual({ ok: true });
  });

  it("keeps an approved spot's documents and landlord request locked", async () => {
    const { account, spotId, doc } = await pendingSpotWithDocument();
    await db.update(spots).set({ review: "approved", rightBasis: "rents", landlordKind: "brf", landlordEmail: "b@brf.example" }).where(eq(spots.id, spotId));
    expect(await deleteSpotDocument(account.id, spotId, doc.id)).toEqual({ ok: false, error: expect.stringContaining("Platsen är godkänd") });
    expect(await requestLandlordApproval(account.id, spotId, "Värd")).toEqual({ ok: false, error: expect.stringContaining("Platsen är godkänd") });
    expect(await submitSpotForReview(account.id, spotId)).toEqual({ ok: false, error: "Platsen är redan godkänd." });
    expect(await withdrawSpotFromReview(account.id, spotId)).toBe(false);
  });

  it("doesn't let another account take a spot back from review", async () => {
    const { spotId } = await pendingSpotWithDocument();
    const other = await makeBookableSpot();
    expect(await withdrawSpotFromReview(other.account.id, spotId)).toBe(false);
    expect((await getSpot(spotId))?.review).toBe("pending_review");
  });
});

describe("admin decisions", () => {
  it("offers only the decisions a state allows", () => {
    expect(spotDecisions("draft")).toEqual([]);
    expect(spotDecisions("pending_review")).toEqual(["approve", "reject"]);
    expect(spotDecisions("approved")).toEqual(["revoke"]);
    expect(spotDecisions("rejected")).toEqual(["approve"]);
    expect(accountDecisions("unverified")).toEqual([]);
    expect(accountDecisions("pending")).toEqual(["approve", "reject"]);
    expect(accountDecisions("verified")).toEqual(["revoke"]);
    expect(accountDecisions("rejected")).toEqual(["approve"]);
  });

  it("applies a spot decision only from a state that allows it", async () => {
    const admin = await makeUser("Admin");
    const { spotId } = await makeBookableSpot({ review: "pending_review" });
    expect(await reviewSpot(spotId, admin.id, "revoke", "x")).toBe(false);
    expect(await reviewSpot(spotId, admin.id, "approve", null)).toBe(true);
    // Approved: can't be approved or rejected again, only have its approval removed.
    expect(await reviewSpot(spotId, admin.id, "approve", null)).toBe(false);
    expect(await reviewSpot(spotId, admin.id, "reject", "x")).toBe(false);
    expect(await reviewSpot(spotId, admin.id, "revoke", "Föreningen har dragit tillbaka godkännandet.")).toBe(true);
    expect(await getSpot(spotId)).toMatchObject({ review: "rejected", reviewNote: "Föreningen har dragit tillbaka godkännandet.", reviewedBy: admin.id });
    expect((await searchSpots({ center: null, start: null, end: null })).results).toEqual([]);
    // A rejected spot can still be approved (the admin changed their mind).
    expect(await reviewSpot(spotId, admin.id, "approve", null)).toBe(true);
  });

  it("applies an account decision only from a state that allows it", async () => {
    const { account } = await makeBookableSpot();
    const status = async () => (await db.select({ s: hostAccounts.verificationStatus }).from(hostAccounts).where(eq(hostAccounts.id, account.id)))[0].s;
    expect(await status()).toBe("verified");
    expect(await reviewAccount(account.id, "approve", null)).toBe(false);
    expect(await reviewAccount(account.id, "reject", "x")).toBe(false);
    expect(await reviewAccount(account.id, "revoke", "Fel organisationsnummer.")).toBe(true);
    expect(await status()).toBe("rejected");
    expect((await searchSpots({ center: null, start: null, end: null })).results).toEqual([]);
    expect(await reviewAccount(account.id, "approve", null)).toBe(true);
    expect(await status()).toBe("verified");
  });
});

describe("search far from any spot", () => {
  it("looks further, and in the end shows the closest spots", async () => {
    const { spotId } = await makeBookableSpot();
    // 7 km from the spot in Göteborg: found in the 15 km circle.
    const near = await searchSpots({ center: { lat: 57.763, lng: 11.97 }, start: null, end: null });
    expect(near).toMatchObject({ widened: true, radiusM: 15000 });
    expect(near.results.map((r) => r.id)).toEqual([spotId]);
    // Kiruna, ~1200 km away: the closest spots wherever they are.
    const far = await searchSpots({ center: { lat: 67.855, lng: 20.225 }, start: null, end: null });
    expect(far).toMatchObject({ widened: true, radiusM: null });
    expect(far.results.map((r) => r.id)).toEqual([spotId]);
    expect(far.results[0].distanceM).toBeGreaterThan(1_000_000);
  });

  it("shows at most ten closest spots, nearest first", async () => {
    await makeBookableSpot();
    const first = (await db.select().from(spots))[0];
    // Eleven more spots of the same host, further and further north.
    for (let i = 1; i <= 11; i++) {
      await db.insert(spots).values({ ...first, id: undefined, title: `Plats ${i}`, lat: 57.7 + i * 0.5, createdAt: undefined, updatedAt: undefined });
    }
    const far = await searchSpots({ center: { lat: 67.855, lng: 20.225 }, start: null, end: null });
    expect(far.results).toHaveLength(10);
    const d = far.results.map((r) => r.distanceM!);
    expect(d).toEqual([...d].sort((a, b) => a - b));
  });
});
