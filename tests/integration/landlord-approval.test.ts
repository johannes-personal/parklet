import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { spots } from "@/db/schema";
import { closeDb, db } from "./direct-db";
import { requestLandlordApproval, respondToLandlordApproval, submitSpotForReview } from "@/server/spots";
import { searchSpots } from "@/server/search";
import { getSpotRow, mailTo, makeBookableSpot, notificationsOf, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(async () => {
  await closeDb();
});

const LANDLORD = "styrelsen@brf-haga.se";
const center = { lat: 57.7, lng: 11.97 };

describe("the landlord declining", () => {
  it("pulls an approved spot out of search, and it can't be submitted again", async () => {
    // The request goes out while the spot is a draft (documents are locked once it is
    // approved); Parklet then approves the spot on other grounds, and the board answers later.
    const { spotId, account, host } = await makeBookableSpot({ review: "draft", rightBasis: "rents", landlordKind: "brf", landlordEmail: LANDLORD });
    expect(await requestLandlordApproval(account.id, spotId, host.name)).toEqual({ ok: true });
    await db.update(spots).set({ review: "approved" }).where(eq(spots.id, spotId));
    expect((await searchSpots({ center, start: null, end: null })).results.map((r) => r.id)).toEqual([spotId]);
    const [mail] = await mailTo(LANDLORD);
    const token = mail.text.match(/\/godkannande\/([A-Za-z0-9_-]+)/)?.[1];
    expect(token).toBeTruthy();

    const answer = { approve: false, name: "Lena", role: "Ordförande", requiresVehicleRegistration: false, vehicleRegistrationNote: "" };
    expect(await respondToLandlordApproval(token!, answer)).toEqual({ ok: true });
    expect(await getSpotRow(spotId)).toMatchObject({
      review: "rejected",
      landlordApproval: "declined",
      landlordApprovedByName: "Lena",
      landlordApprovedByRole: "Ordförande",
      landlordApprovalTokenHash: null,
    });
    expect((await searchSpots({ center, start: null, end: null })).results).toEqual([]);
    expect((await notificationsOf(host.id)).map((n) => [n.kind, n.title])).toEqual([["landlord_response", "Testplats: uthyrningen nekades"]]);

    expect(await submitSpotForReview(account.id, spotId)).toEqual({
      ok: false,
      error: "Hyresvärden/föreningen har nekat uthyrning av platsen. Den kan inte skickas in.",
    });
    expect(await getSpotRow(spotId)).toMatchObject({ review: "rejected", landlordApproval: "declined" });
  });
});
