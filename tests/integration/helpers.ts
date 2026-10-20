import { db } from "./direct-db";
import { hostAccountMembers, hostAccounts, spots, users } from "@/db/schema";
import { sql } from "drizzle-orm";
import { createSpots } from "@/server/spots";

export async function resetDb() {
  await db.execute(
    sql`TRUNCATE bookings, availability_windows, documents, document_blobs, mail_outbox, spots, host_invitations, host_account_members, host_accounts, vehicles, password_reset_tokens, sessions, users CASCADE`,
  );
}

let n = 0;
export async function makeUser(name = "Test Person") {
  n++;
  const [u] = await db
    .insert(users)
    .values({ email: `user${n}-${Date.now()}@example.com`, name, passwordHash: "x", identityVerifiedAt: new Date() })
    .returning();
  return u;
}

/** A verified household host with payouts connected and one approved, always-available spot. */
export async function makeBookableSpot(overrides: Partial<typeof spots.$inferInsert> = {}) {
  const host = await makeUser("Host Person");
  const [account] = await db
    .insert(hostAccounts)
    .values({ kind: "household", name: host.name, verificationStatus: "verified", payoutStatus: "active" })
    .returning();
  await db.insert(hostAccountMembers).values({ hostAccountId: account.id, userId: host.id, role: "owner" });
  const [id] = await createSpots(
    account.id,
    host.id,
    {
      title: "Testplats",
      description: "",
      address: "Testgatan 1",
      city: "Göteborg",
      lat: 57.7,
      lng: 11.97,
      spotType: "outdoor",
      covered: false,
      evCharging: false,
      maxHeightCm: null,
      pricePerHourOre: 2000,
      pricePerDayOre: 15000,
      minDurationMinutes: 60,
      cancellationHours: 2,
      accessInstructions: "Koden är 1234",
      visibility: "public",
      minNoticeMinutes: 0,
      rightBasis: "owns",
      landlordKind: null,
      landlordName: "",
      landlordEmail: "",
      requiresVehicleRegistration: false,
      vehicleRegistrationNote: "",
      schedule: { mode: "always" },
    },
  );
  await db
    .update(spots)
    .set({ review: "approved", ...overrides })
    .where(sql`${spots.id} = ${id}`);
  return { host, account, spotId: id };
}
