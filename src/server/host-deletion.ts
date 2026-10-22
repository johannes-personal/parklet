import "server-only";
import { api, cols, must, names, toDb } from "@/db/api";
import { bookings, documents, hostAccountMembers, hostAccounts, hostInvitations, spots, spotVehicleApprovals } from "@/db/schema";
import { deleteDocumentFiles } from "./storage";

/**
 * Deleting a spot or a whole host account, by the host. Anything can be deleted at any
 * stage (a draft, a spot under review, an organisation stuck in verification), except
 * while bookings are still to come: those are cancelled first.
 *
 * Bookings refer to their spot, and are kept seven years for the bookkeeping, so a spot
 * that has been booked is not removed but archived: paused, out of every list, its
 * documents and registered cars gone. One that never was booked is removed outright.
 * An account goes the same way: removed with its spots when none was booked, otherwise
 * kept without members, invitations or documents, marked deleted.
 */

const B = names(bookings);
const S = names(spots);
const A = names(hostAccounts);
const D = names(documents);

export type DeletionResult = { ok: true } | { ok: false; error: string };

const UPCOMING = "Det finns kommande bokningar. Avboka dem först, eller vänta tills de är klara.";

async function hasUpcoming(spotIds: string[]) {
  if (spotIds.length === 0) return false;
  const rows = must<unknown[]>(
    await api().from("bookings").select(B.id).in(B.spotId, spotIds).in(B.status, ["pending_payment", "confirmed"]).gt(B.endsAt, new Date().toISOString()).limit(1),
    "hasUpcoming",
  );
  return rows.length > 0;
}

async function bookedSpotIds(spotIds: string[]): Promise<Set<string>> {
  if (spotIds.length === 0) return new Set();
  const rows = must<{ spotId: string }[]>(await api().from("bookings").select(`spotId:${B.spotId}`).in(B.spotId, spotIds), "bookedSpotIds");
  return new Set(rows.map((r) => r.spotId));
}

async function removeDocuments(filter: { spotIds?: string[]; accountId?: string }) {
  let query = api().from("documents").delete();
  query = filter.accountId ? query.eq(D.hostAccountId, filter.accountId) : query.in(D.spotId, filter.spotIds ?? []);
  const docs = must<{ storageKey: string }[]>(await query.select(cols(documents, ["storageKey"])), "removeDocuments");
  await deleteDocumentFiles(docs.map((d) => d.storageKey)).catch((err) => console.error("host deletion: document files", err));
}

/** Removes (never booked) or archives (booked) these spots of the account. */
async function retireSpots(accountId: string, spotIds: string[]) {
  if (spotIds.length === 0) return;
  const booked = await bookedSpotIds(spotIds);
  await removeDocuments({ spotIds });
  const archive = spotIds.filter((id) => booked.has(id));
  const remove = spotIds.filter((id) => !booked.has(id));
  if (archive.length) {
    must(await api().from("spot_vehicle_approvals").delete().in(names(spotVehicleApprovals).spotId, archive), "retireSpots");
    must(
      await api()
        .from("spots")
        .update(
          toDb(spots, {
            deletedAt: new Date(),
            status: "paused",
            review: "draft",
            submittedAt: null,
            landlordApprovalTokenHash: null,
            updatedAt: new Date(),
          }),
        )
        .in(S.id, archive)
        .eq(S.hostAccountId, accountId),
      "retireSpots",
    );
  }
  if (remove.length) must(await api().from("spots").delete().in(S.id, remove).eq(S.hostAccountId, accountId), "retireSpots");
}

/** Deletes one spot of the account (any administrator of the account may). */
export async function deleteSpot(accountId: string, spotId: string): Promise<DeletionResult> {
  const spot = must<{ id: string } | null>(
    await api().from("spots").select(S.id).eq(S.id, spotId).eq(S.hostAccountId, accountId).is(S.deletedAt, null).maybeSingle(),
    "deleteSpot",
  );
  if (!spot) return { ok: false, error: "Parkeringsplatsen finns inte." };
  if (await hasUpcoming([spotId])) return { ok: false, error: UPCOMING };
  await retireSpots(accountId, [spotId]);
  return { ok: true };
}

/**
 * Deletes a host account with all its spots (its owner only). Someone who has no other
 * host account is a driver again afterwards.
 */
export async function deleteHostAccount(accountId: string, userId: string): Promise<DeletionResult> {
  const M = names(hostAccountMembers);
  const owner = must<unknown[]>(
    await api().from("host_account_members").select(M.userId).eq(M.hostAccountId, accountId).eq(M.userId, userId).eq(M.role, "owner").limit(1),
    "deleteHostAccount",
  );
  if (!owner.length) return { ok: false, error: "Bara kontots ägare kan ta bort det." };
  const spotIds = must<{ id: string }[]>(await api().from("spots").select(S.id).eq(S.hostAccountId, accountId), "deleteHostAccount").map((s) => s.id);
  if (await hasUpcoming(spotIds)) return { ok: false, error: UPCOMING };

  const live = must<{ id: string }[]>(
    await api().from("spots").select(S.id).eq(S.hostAccountId, accountId).is(S.deletedAt, null),
    "deleteHostAccount",
  ).map((s) => s.id);
  await retireSpots(accountId, live);
  await removeDocuments({ accountId });

  const remaining = must<unknown[]>(await api().from("spots").select(S.id).eq(S.hostAccountId, accountId).limit(1), "deleteHostAccount");
  if (remaining.length === 0) {
    must(await api().from("host_accounts").delete().eq(A.id, accountId), "deleteHostAccount");
    return { ok: true };
  }
  must(await api().from("host_invitations").delete().eq(names(hostInvitations).hostAccountId, accountId), "deleteHostAccount");
  must(await api().from("host_account_members").delete().eq(M.hostAccountId, accountId), "deleteHostAccount");
  must(await api().from("host_accounts").update(toDb(hostAccounts, { deletedAt: new Date() })).eq(A.id, accountId), "deleteHostAccount");
  return { ok: true };
}

