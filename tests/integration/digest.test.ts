import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { closeDb, db } from "./direct-db";
import { spots, users } from "@/db/schema";
import { formatSek } from "@/lib/money";
import { sendAdminDigest } from "@/server/digest";
import { allMail, hoursFromNow, makeAdmin, makeBookableSpot, makeConfirmedBooking, makeHost, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(async () => {
  await closeDb();
});

/** Admins who joined long ago, so they don't count as news themselves. */
async function oldAdmins(count: number) {
  const admins = [];
  for (let i = 0; i < count; i++) admins.push(await makeAdmin(`Admin ${i + 1}`));
  await db.update(users).set({ createdAt: new Date(Date.now() - 7 * 24 * 3600_000) }).where(
    inArray(
      users.id,
      admins.map((a) => a.id),
    ),
  );
  return admins;
}

describe("the admins' daily summary", () => {
  it("is not sent when there is nothing to report", async () => {
    await oldAdmins(2);
    expect(await sendAdminDigest()).toEqual({ sent: 0 });
    expect(await allMail()).toEqual([]);
  });

  it("goes to every admin, with what is waiting and what happened", async () => {
    const admins = await oldAdmins(2);
    const { spotId } = await makeBookableSpot(); // a new user, account and spot
    const driver = await makeUser("Dora Förare"); // a new user
    const booking = await makeConfirmedBooking(spotId, driver.id, hoursFromNow(24), hoursFromNow(26));
    await db.update(spots).set({ review: "pending_review", submittedAt: new Date(Date.now() - 3600_000) }).where(eq(spots.id, spotId));
    const { account: pending } = await makeHost({ kind: "association", name: "Brf Väntar", verificationStatus: "pending" }); // a new user and account

    const earlier = (await allMail()).length; // the booking's own confirmations
    expect(await sendAdminDigest()).toEqual({ sent: 2, waiting: 2, happened: 3 + 2 + 1 + 1 });
    const mail = (await allMail()).slice(earlier);
    expect(mail.map((m) => m.to).sort()).toEqual(admins.map((a) => a.email).sort());
    for (const m of mail) {
      expect(m.subject).toBe("Parklet: 2 att granska");
      expect(m.text).toContain("1 plats och 1 organisation väntar på granskning, den äldsta sedan ");
      expect(m.text).toContain(`• Testplats – http://localhost:3000/admin/platser/${spotId}`);
      expect(m.text).toContain(`• Brf Väntar – http://localhost:3000/admin/konton/${pending.id}`);
      for (const line of [
        `Nya bokningar: 1 (${formatSek(booking.totalOre)})`,
        "Avbokningar: 0",
        "Bilar ej registrerade vid start: 0",
        "Nya platser: 1",
        "Nya uthyrarkonton: 2",
        "Nya användare: 3",
      ]) {
        expect(m.text.split("\n")).toContain(line);
      }
    }
  });
});
