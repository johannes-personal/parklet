import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, db } from "./direct-db";
import { documents, notifications } from "@/db/schema";
import { cancelBooking, markVehicleRegistered } from "@/server/bookings";
import { getPaymentProvider } from "@/server/payments";
import { createSpots, deleteSpotDocument, requestLandlordApproval, setSpotStatus, submitSpotForReview } from "@/server/spots";
import { allMail, getBooking, getSpotRow, hoursFromNow, makeBookableSpot, makeConfirmedBooking, makeHost, makeUser, resetDb, spotInput } from "./helpers";

beforeEach(resetDb);
afterAll(async () => {
  await closeDb();
});

const NO_SPOT = { ok: false, error: "Platsen finns inte." };

/** Host account A, and account B with a draft spot (rented from a BRF, so a landlord request would be possible) and a document on it. */
async function twoAccounts() {
  const a = await makeHost({}, "Anna Angripare");
  const b = await makeHost({}, "Bertil Offer");
  const [ownSpot] = await createSpots(a.account.id, a.host.id, spotInput({ title: "A:s plats" }));
  const [spotId] = await createSpots(
    b.account.id,
    b.host.id,
    spotInput({ title: "B:s plats", rightBasis: "rents", landlordKind: "brf", landlordName: "Styrelsen", landlordEmail: "styrelsen@brf-b.se" }),
  );
  const [doc] = await db
    .insert(documents)
    .values({
      hostAccountId: b.account.id,
      spotId,
      uploadedBy: b.host.id,
      kind: "rental_contract",
      filename: "avtal.pdf",
      mimeType: "application/pdf",
      sizeBytes: 10,
      storageKey: "2026-10/b-avtal.pdf",
    })
    .returning();
  return { a, b, ownSpot, spotId, docId: doc.id };
}

describe("one host account acting on another's spot", () => {
  it("is refused for every spot action, and leaves the other account's spot as it was", async () => {
    const { a, ownSpot, spotId, docId } = await twoAccounts();
    const before = await getSpotRow(spotId);
    expect(before).toMatchObject({ review: "draft", status: "active", landlordApproval: "missing" });

    const cases: [string, () => Promise<unknown>, unknown][] = [
      ["setSpotStatus", () => setSpotStatus(a.account.id, spotId, "paused"), false],
      ["submitSpotForReview", () => submitSpotForReview(a.account.id, spotId), NO_SPOT],
      ["requestLandlordApproval", () => requestLandlordApproval(a.account.id, spotId, a.host.name), NO_SPOT],
      ["deleteSpotDocument", () => deleteSpotDocument(a.account.id, spotId, docId), NO_SPOT],
      // Own spot, but the other account's document.
      ["deleteSpotDocument (own spot, their document)", () => deleteSpotDocument(a.account.id, ownSpot, docId), { ok: false, error: "Dokumentet finns inte." }],
    ];
    for (const [name, call, expected] of cases) {
      expect(await call(), name).toEqual(expected);
      expect(await getSpotRow(spotId), name).toEqual(before);
      expect(await db.select().from(documents).where(eq(documents.id, docId)), name).toHaveLength(1);
    }
    // No landlord request went out, and nobody was told anything.
    expect(await allMail()).toEqual([]);
    expect(await db.select().from(notifications)).toEqual([]);
  });

  it("works for the spot's own account (so the refusals above are about the account)", async () => {
    const { b, spotId, docId } = await twoAccounts();
    expect(await setSpotStatus(b.account.id, spotId, "paused")).toBe(true);
    expect(await requestLandlordApproval(b.account.id, spotId, b.host.name)).toEqual({ ok: true });
    expect(await deleteSpotDocument(b.account.id, spotId, docId)).toEqual({ ok: true });
    expect(await getSpotRow(spotId)).toMatchObject({ status: "paused", landlordApproval: "requested" });
    expect((await allMail()).map((m) => m.to)).toEqual(["styrelsen@brf-b.se"]);
  });
});

describe("someone who is neither the driver nor the host", () => {
  it("can neither cancel a booking nor mark its car registered", async () => {
    const { spotId } = await makeBookableSpot({ requiresVehicleRegistration: true });
    const driver = await makeUser("Dora Förare");
    const booking = await makeConfirmedBooking(spotId, driver.id, hoursFromNow(48), hoursFromNow(50));
    expect(booking).toMatchObject({ status: "confirmed", vehicleRegistration: "pending" });
    const stranger = await makeUser("Okänd");
    const otherHost = (await makeHost({}, "Annan Värd")).host;
    const refund = vi.spyOn(getPaymentProvider(), "refund");
    const mailBefore = await allMail();

    for (const outsider of [stranger, otherHost]) {
      expect(await cancelBooking(booking.id, outsider.id)).toEqual({ ok: false, error: "Bokningen finns inte." });
      expect(await markVehicleRegistered(booking.id, outsider.id)).toBe(false);
    }
    expect(await getBooking(booking.id)).toEqual(booking);
    expect(refund).not.toHaveBeenCalled();
    expect(await allMail()).toEqual(mailBefore);
    refund.mockRestore();
  });
});
