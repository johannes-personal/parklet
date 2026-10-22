import { appUrl } from "@/lib/app-url";
import "server-only";
import { api, cols, embed, must, names, parse, parseAll, rpc, toDb } from "@/db/api";
import { availabilityWindows, documents, hostAccounts, spots, users, type DocumentRow, type HostAccount, type Spot } from "@/db/schema";
import { normalizeWindows, type AvailabilityWindow } from "@/lib/availability";
import { scheduleToWindows } from "@/lib/schedule";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import type { SpotInput } from "@/lib/validation";
import { isUuid } from "./ids";
import { sendEmail } from "./mailer";
import { notifyAccount, notifyAdmins, notifyUsers } from "./notifications";
import { deleteDocumentFile } from "./storage";

export { isUuid };

export type SpotWithWindows = Spot & { windows: AvailabilityWindow[] };

const S = names(spots);
const A = names(hostAccounts);
const D = names(documents);
const U = names(users);

/** Bookable: what search (src/server/search.ts) filters on, as an API query on spots with the account embedded as `account`. */
export const BOOKABLE_FILTERS = [
  [S.status, "active"],
  [S.review, "approved"],
  [`account.${A.verificationStatus}`, "verified"],
  [`account.${A.payoutStatus}`, "active"],
] as const;

export function isBookable(spot: Pick<Spot, "status" | "review">, account: Pick<HostAccount, "verificationStatus" | "payoutStatus">) {
  return spot.status === "active" && spot.review === "approved" && account.verificationStatus === "verified" && account.payoutStatus === "active";
}

const WINDOWS = embed("windows", availabilityWindows, ["weekday", "startMinute", "endMinute"]);

/** Opening hours in the order the app expects (the API sorts embedded rows only by request). */
function sortedWindows(rows: AvailabilityWindow[] | undefined): AvailabilityWindow[] {
  return [...(rows ?? [])].sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute);
}

export async function getSpot(id: string): Promise<SpotWithWindows | null> {
  if (!isUuid(id)) return null;
  const row = must(await api().from("spots").select(`${cols(spots)},${WINDOWS}`).eq(S.id, id).is(S.deletedAt, null).maybeSingle(), "getSpot");
  if (!row) return null;
  const spot = parse(spots, row) as Spot & { windows?: AvailabilityWindow[] };
  return { ...spot, windows: sortedWindows(spot.windows) };
}

export async function getSpotWithAccount(id: string) {
  if (!isUuid(id)) return null;
  const row = must(
    await api()
      .from("spots")
      .select(`${cols(spots)},${WINDOWS},${embed("account", hostAccounts, undefined, { inner: true })}`)
      .eq(S.id, id)
      .is(S.deletedAt, null)
      .maybeSingle(),
    "getSpotWithAccount",
  ) as (Record<string, unknown> & { account: unknown }) | null;
  if (!row) return null;
  const spot = parse(spots, row) as Spot & { windows?: AvailabilityWindow[]; account?: unknown };
  const { account, windows, ...rest } = spot;
  void account;
  return { spot: { ...rest, windows: sortedWindows(windows) } as SpotWithWindows, account: parse(hostAccounts, row.account) as HostAccount };
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
  const rows = Array.from({ length: count }, (_, i) =>
    toDb(spots, {
      ...input,
      ...rightFields(input),
      title: count > 1 ? `${input.title} – Plats ${i + 1}` : input.title,
      hostAccountId: accountId,
      createdBy: userId,
      landlordApproval: input.rightBasis === "rents" ? "missing" : "not_needed",
      review: "draft",
    }),
  );
  // One step: all the spots and their opening hours, or nothing.
  return rpc<string[]>("parklet_create_spots", { p_rows: rows, p_windows: windowRows(scheduleToWindows(input.schedule)) });
}

function windowRows(windows: AvailabilityWindow[]) {
  return normalizeWindows(windows).map((w) => ({ weekday: w.weekday, start_minute: w.startMinute, end_minute: w.endMinute }));
}

export async function updateSpot(accountId: string, spotId: string, input: SpotInput) {
  const windows = scheduleToWindows(input.schedule);
  const existing = await getSpot(spotId);
  if (!existing || existing.hostAccountId !== accountId) return false;
  const next = { ...input, ...rightFields(input) };
  const reviewedChanged = REVIEWED_FIELDS.some((f) => existing[f] !== next[f]);
  const landlordChanged = existing.landlordEmail !== next.landlordEmail || existing.rightBasis !== next.rightBasis;
  // The landlord's or BRF's rules stay as long as its approval does: the host can't
  // switch off a registration requirement it set, nor its day's notice.
  if (existing.landlordRequiresRegistration && !landlordChanged) {
    next.requiresVehicleRegistration = true;
    next.minNoticeMinutes = Math.max(next.minNoticeMinutes, 1440);
    if (!next.vehicleRegistrationNote) next.vehicleRegistrationNote = existing.vehicleRegistrationNote;
  }
  // The approval belongs to the landlord who gave it. Another landlord (or basis) on a
  // submitted or approved spot means a new approval first: the spot goes back to draft,
  // so it can't be booked meanwhile.
  const needsNewApproval = landlordChanged && existing.review !== "draft" && next.rightBasis === "rents";

  // One step: the spot and its opening hours.
  return rpc<boolean>("parklet_update_spot", {
    p_account_id: accountId,
    p_spot_id: spotId,
    p_patch: toDb(spots, {
      ...next,
      updatedAt: new Date(),
      // A moved spot or a new legal basis must be verified again before it can be booked.
      ...(needsNewApproval
        ? { review: "draft" as const, submittedAt: null }
        : reviewedChanged && existing.review !== "draft"
          ? { review: "pending_review" as const, submittedAt: new Date() }
          : {}),
      ...(landlordChanged
        ? {
            landlordApproval: next.rightBasis === "rents" ? ("missing" as const) : ("not_needed" as const),
            landlordApprovalTokenHash: null,
            landlordApprovedByName: null,
            landlordApprovedByRole: null,
            landlordRespondedAt: null,
            landlordRequiresRegistration: false,
          }
        : {}),
    }),
    p_windows: windowRows(windows),
  });
}

export async function setSpotStatus(accountId: string, spotId: string, status: "active" | "paused") {
  if (!isUuid(spotId)) return false;
  const updated = must(
    await api().from("spots").update(toDb(spots, { status, updatedAt: new Date() })).eq(S.id, spotId).eq(S.hostAccountId, accountId).select(S.id),
    "setSpotStatus",
  );
  return updated.length > 0;
}

export async function listSpotDocuments(spotId: string): Promise<DocumentRow[]> {
  return parseAll(documents, must(await api().from("documents").select(cols(documents)).eq(D.spotId, spotId).order(D.createdAt), "listSpotDocuments"));
}

/* --------------------------------------------- right-to-rent requirements */

/**
 * A spot's documents (and its landlord request) can change only before it is
 * submitted, or after Parklet has sent it back: never while Parklet reviews it
 * (withdraw it first) or once it is approved.
 */
export const documentsEditable = (review: Spot["review"]) => review === "draft" || review === "rejected";

export const DOCUMENTS_LOCKED_MESSAGE: Record<"pending_review" | "approved", string> = {
  pending_review: "Underlagen är låsta medan Parklet granskar platsen. Ta tillbaka platsen från granskningen om du behöver ändra något.",
  approved: "Platsen är godkänd och underlagen är låsta. Kontakta Parklet om något har ändrats.",
};

export function documentsLockedError(review: Spot["review"]) {
  return review === "pending_review" || review === "approved" ? DOCUMENTS_LOCKED_MESSAGE[review] : null;
}

/**
 * Remove a document from a spot that hasn't been submitted (or was sent back).
 * The stored file goes too once no other spot uses it (uploads can be shared
 * by spots at the same address).
 */
export async function deleteSpotDocument(accountId: string, spotId: string, documentId: string) {
  if (!isUuid(documentId)) return { ok: false as const, error: "Dokumentet finns inte." };
  const spot = await getSpot(spotId);
  if (!spot || spot.hostAccountId !== accountId) return { ok: false as const, error: "Platsen finns inte." };
  const locked = documentsLockedError(spot.review);
  if (locked) return { ok: false as const, error: locked };
  const [deleted] = must(
    await api().from("documents").delete().eq(D.id, documentId).eq(D.spotId, spotId).eq(D.hostAccountId, accountId).select(cols(documents, ["storageKey"])),
    "deleteSpotDocument",
  ) as { storageKey: string }[];
  if (!deleted) return { ok: false as const, error: "Dokumentet finns inte." };
  const stillUsed = must(await api().from("documents").select(D.id).eq(D.storageKey, deleted.storageKey).limit(1), "deleteSpotDocument");
  if (stillUsed.length === 0) await deleteDocumentFile(deleted.storageKey);
  return { ok: true as const };
}

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

export async function submitSpotForReview(accountId: string, spotId: string, { announce = true } = {}) {
  const spot = await getSpot(spotId);
  if (!spot || spot.hostAccountId !== accountId) return { ok: false as const, error: "Platsen finns inte." };
  if (spot.review === "pending_review") return { ok: false as const, error: "Platsen granskas redan." };
  if (spot.review === "approved") return { ok: false as const, error: "Platsen är redan godkänd." };
  if (spot.landlordApproval === "declined") {
    return { ok: false as const, error: "Hyresvärden/föreningen har nekat uthyrning av platsen. Den kan inte skickas in." };
  }
  const missing = spotRequirements(spot, await listSpotDocuments(spotId)).filter((r) => !r.done);
  if (missing.length) return { ok: false as const, error: `Det saknas underlag: ${missing.map((m) => m.label.toLowerCase()).join("; ")}.` };
  if (spot.windows.length === 0) return { ok: false as const, error: "Ange minst en tid då platsen är tillgänglig." };
  must(await api().from("spots").update(toDb(spots, { review: "pending_review", submittedAt: new Date(), reviewNote: null })).eq(S.id, spotId), "submitSpotForReview");
  if (announce) await announceSubmittedSpots(accountId, [spotId]);
  return { ok: true as const };
}

/** Take a spot back from Parklet's review, so its documents can be changed. False if it wasn't under review. */
export async function withdrawSpotFromReview(accountId: string, spotId: string) {
  if (!isUuid(spotId)) return false;
  const updated = must(
    await api()
      .from("spots")
      .update(toDb(spots, { review: "draft", submittedAt: null }))
      .eq(S.id, spotId)
      .eq(S.hostAccountId, accountId)
      .eq(S.review, "pending_review")
      .select(S.id),
    "withdrawSpotFromReview",
  );
  return updated.length > 0;
}

/** Tell Parklet's admins about spots submitted together (one notification for a BRF's whole row of spots). */
export async function announceSubmittedSpots(accountId: string, spotIds: string[]) {
  if (spotIds.length === 0) return;
  const rows = must(
    await api().from("spots").select(`${cols(spots)},${embed("account", hostAccounts, ["name"], { inner: true })}`).in(S.id, spotIds),
    "announceSubmittedSpots",
  ) as (Record<string, unknown> & { account: { name: string } })[];
  const first = rows[0];
  if (!first) return;
  const spot = parse(spots, first);
  const accountName = first.account.name;
  const more = rows.length > 1 ? ` (+${rows.length - 1} till på samma adress)` : "";
  await notifyAdmins({
    kind: "admin_spot_submitted",
    accountId: spot.hostAccountId,
    title: `Ny plats att granska: ${spot.title}${more}`,
    body: `${accountName} har skickat in ${rows.length > 1 ? `${rows.length} parkeringsplatser` : "en parkeringsplats"} för granskning.`,
    details: [
      ["Plats", `${spot.title}, ${spot.address}, ${spot.city}`],
      ["Uthyrare", accountName],
      ["Grund", spot.rightBasis === "owns" ? "Äger platsen" : `Hyr av ${spot.landlordKind === "brf" ? "bostadsrättsförening" : "hyresvärd"}`],
    ],
    href: `/admin/platser/${spot.id}`,
    cta: "Granska platsen",
  });
}

/* ------------------------------------------------- landlord / BRF approval */

export async function requestLandlordApproval(accountId: string, spotId: string, requestedBy: string) {
  const row = await getSpotWithAccount(spotId);
  if (!row || row.spot.hostAccountId !== accountId) return { ok: false as const, error: "Platsen finns inte." };
  const { spot, account } = row;
  const locked = documentsLockedError(spot.review);
  if (locked) return { ok: false as const, error: locked };
  if (spot.rightBasis !== "rents" || !spot.landlordEmail) {
    return { ok: false as const, error: "Ange föreningens eller hyresvärdens e-postadress först." };
  }
  const token = generateToken();
  must(await api().from("spots").update(toDb(spots, { landlordApproval: "requested", landlordApprovalTokenHash: hashToken(token) })).eq(S.id, spotId), "requestLandlordApproval");
  const who = spot.landlordKind === "brf" ? "föreningen" : "er som hyresvärd";
  await sendEmail(spot.landlordEmail, `Godkännande för uthyrning av parkeringsplats – ${spot.address}`, {
    heading: "Får parkeringsplatsen hyras ut via Parklet?",
    preheader: `${requestedBy} vill hyra ut sin parkeringsplats på ${spot.address} när den inte används.`,
    paragraphs: [
      `Hej${spot.landlordName ? " " + spot.landlordName : ""}!`,
      `${requestedBy} vill hyra ut parkeringsplatsen nedan via Parklet när den inte används, och behöver godkännande från ${who}.`,
      "Ni svarar med ett klick, utan att skapa konto. Om föreningen kräver att tillfälliga hyresgästers bilar registreras kan ni ange det i formuläret.",
    ],
    details: [
      ["Plats", `${spot.address}, ${spot.city}`],
      ["Uthyrare", `${requestedBy} (konto "${account.name}")`],
    ],
    button: { label: "Granska och svara", url: `${appUrl()}/godkannande/${token}` },
    footnote: "Parklet förmedlar parkering mellan privatpersoner, föreningar och företag. Uthyraren får inte hyra ut platsen via Parklet utan ert godkännande.",
  }, { kind: "landlord_approval", hostAccountId: account.id });
  // The approver needs no account, but one who has one also finds the request in the bell
  // (no second e-mail: the one above is it).
  const approver = must<{ id: string }[]>(
    await api().from("users").select(U.id).eq(U.email, spot.landlordEmail.trim().toLowerCase()).limit(1),
    "requestLandlordApproval",
  );
  if (approver.length) {
    await notifyUsers(
      [approver[0].id],
      {
        kind: "landlord_approval_requested",
        accountId: account.id,
        title: `Godkännande begärt: parkeringsplats på ${spot.address}`,
        body: `${requestedBy} vill hyra ut parkeringsplatsen på ${spot.address}, ${spot.city} via Parklet och behöver godkännande från ${who}.`,
        href: `/godkannande/${token}`,
      },
      { email: false },
    );
  }
  return { ok: true as const };
}

export async function getSpotByApprovalToken(token: string): Promise<{ spot: Spot; accountName: string } | null> {
  const row = must(
    await api()
      .from("spots")
      .select(`${cols(spots)},${embed("account", hostAccounts, ["name"], { inner: true })}`)
      .eq(S.landlordApprovalTokenHash, hashToken(token))
      .maybeSingle(),
    "getSpotByApprovalToken",
  ) as (Record<string, unknown> & { account: { name: string } }) | null;
  if (!row) return null;
  const { account, ...spot } = row;
  return { spot: parse(spots, spot), accountName: account.name };
}

export async function respondToLandlordApproval(
  token: string,
  input: { approve: boolean; name: string; role: string; requiresVehicleRegistration: boolean; vehicleRegistrationNote: string },
) {
  const found = await getSpotByApprovalToken(token);
  if (!found || found.spot.landlordApproval !== "requested") return { ok: false as const, error: "Länken är ogiltig eller redan använd." };
  // One step, and only once: the function checks the request is still open.
  const answered = await rpc<string | null>("parklet_respond_landlord", {
    p_token_hash: hashToken(token),
    p_approve: input.approve,
    p_name: input.name,
    p_role: input.role,
    p_requires_registration: input.requiresVehicleRegistration,
    p_registration_note: input.vehicleRegistrationNote,
  });
  if (!answered) return { ok: false as const, error: "Länken är ogiltig eller redan använd." };
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
  const [rows, stats] = await Promise.all([
    api().from("spots").select(cols(spots)).eq(S.hostAccountId, accountId).is(S.deletedAt, null).order(S.createdAt),
    api().rpc("parklet_account_spot_stats", { p_account_id: accountId }),
  ]);
  const byId = new Map(
    must<{ spot_id: string; upcoming_bookings: number; earned_ore: number }[]>(stats, "listAccountSpots").map((r) => [r.spot_id, r]),
  );
  return parseAll(spots, must(rows, "listAccountSpots")).map((spot) => ({
    ...spot,
    upcomingBookings: byId.get(spot.id)?.upcoming_bookings ?? 0,
    earnedOre: Number(byId.get(spot.id)?.earned_ore ?? 0),
  }));
}

/* ------------------------------------------------------------ admin review */

export async function listReviewQueue() {
  const [spotRows, accountRows] = await Promise.all([
    api()
      .from("spots")
      .select(`${cols(spots)},${embed("account", hostAccounts, ["name", "kind"], { inner: true })}`)
      .eq(S.review, "pending_review")
      .order(S.submittedAt),
    api().from("host_accounts").select(cols(hostAccounts)).eq(A.verificationStatus, "pending").is(A.deletedAt, null).order(A.createdAt),
  ]);
  const pendingSpots = (must(spotRows, "listReviewQueue") as (Record<string, unknown> & { account: Pick<HostAccount, "name" | "kind"> })[]).map(
    ({ account, ...spot }) => ({ spot: parse(spots, spot), accountName: account.name, accountKind: account.kind }),
  );
  return { pendingSpots, pendingAccounts: parseAll(hostAccounts, must(accountRows, "listReviewQueue")) };
}

/**
 * An admin's decision. "approve" (also after a rejection), "reject" (a submission,
 * with a note) and "revoke" (take back an approval, with a note). Each is only
 * possible from the states listed, so a decision made on an outdated page does
 * nothing; false then.
 */
export type ReviewDecision = "approve" | "reject" | "revoke";

const SPOT_DECISIONS: Record<ReviewDecision, { from: Spot["review"][]; to: Spot["review"] }> = {
  approve: { from: ["pending_review", "rejected"], to: "approved" },
  reject: { from: ["pending_review"], to: "rejected" },
  revoke: { from: ["approved"], to: "rejected" },
};

const ACCOUNT_DECISIONS: Record<ReviewDecision, { from: HostAccount["verificationStatus"][]; to: HostAccount["verificationStatus"] }> = {
  approve: { from: ["pending", "rejected"], to: "verified" },
  reject: { from: ["pending"], to: "rejected" },
  revoke: { from: ["verified"], to: "rejected" },
};

/** The decisions an admin can make on a spot or account in its current state. */
export const spotDecisions = (review: Spot["review"]) =>
  (Object.keys(SPOT_DECISIONS) as ReviewDecision[]).filter((d) => SPOT_DECISIONS[d].from.includes(review));
export const accountDecisions = (status: HostAccount["verificationStatus"]) =>
  (Object.keys(ACCOUNT_DECISIONS) as ReviewDecision[]).filter((d) => ACCOUNT_DECISIONS[d].from.includes(status));

export async function reviewSpot(spotId: string, adminId: string, decision: ReviewDecision, note: string | null) {
  if (!isUuid(spotId)) return false;
  const { from, to } = SPOT_DECISIONS[decision];
  const updated = must(
    await api()
      .from("spots")
      .update(toDb(spots, { review: to, reviewNote: note, reviewedAt: new Date(), reviewedBy: adminId }))
      .eq(S.id, spotId)
      .in(S.review, from)
      .select(S.id),
    "reviewSpot",
  );
  return updated.length > 0;
}

/** Why an account's spots went back for review when the account lost its approval. */
export const ACCOUNT_NOT_APPROVED_NOTE = "Uthyrarkontot är inte godkänt längre. Skicka in platsen för granskning igen när kontot är godkänt.";

/**
 * Applies an admin's decision on an account. One that leaves the account rejected
 * (a rejection, or a removed approval) starts the host over: the account's approved
 * and submitted spots go back to "rejected" and have to be submitted and approved
 * again, and a household's owner has to identify with BankID again (see
 * recordVerifiedIdentity). Returns the account's kind and how many spots went back,
 * or null if the decision didn't fit the account's state.
 */
export async function reviewAccount(
  accountId: string,
  decision: ReviewDecision,
  note: string | null,
): Promise<{ kind: HostAccount["kind"]; spotsReset: number } | null> {
  if (!isUuid(accountId)) return null;
  const { from, to } = ACCOUNT_DECISIONS[decision];
  const [updated] = must<Pick<HostAccount, "kind">[]>(
    await api()
      .from("host_accounts")
      .update(toDb(hostAccounts, { verificationStatus: to, reviewNote: note, reviewedAt: new Date() }))
      .eq(A.id, accountId)
      .in(A.verificationStatus, from)
      .select(cols(hostAccounts, ["kind"])),
    "reviewAccount",
  );
  if (!updated) return null;
  let spotsReset = 0;
  if (to === "rejected") {
    spotsReset = must(
      await api()
        .from("spots")
        .update(toDb(spots, { review: "rejected", reviewNote: ACCOUNT_NOT_APPROVED_NOTE, reviewedAt: new Date(), submittedAt: null }))
        .eq(S.hostAccountId, accountId)
        .in(S.review, ["approved", "pending_review"])
        .select(S.id),
      "reviewAccount",
    ).length;
  }
  return { kind: updated.kind, spotsReset };
}

/** Other spots of the same account at the same address (e.g. created together as "Plats 1…N"). */
export async function listSiblingSpots(spot: Pick<Spot, "id" | "hostAccountId" | "address" | "city">): Promise<Pick<Spot, "id" | "title" | "review">[]> {
  return must(
    await api()
      .from("spots")
      .select(cols(spots, ["id", "title", "review"]))
      .eq(S.hostAccountId, spot.hostAccountId)
      .eq(S.address, spot.address)
      .eq(S.city, spot.city)
      .neq(S.id, spot.id)
      .is(S.deletedAt, null)
      .order(S.title),
    "listSiblingSpots",
  );
}
