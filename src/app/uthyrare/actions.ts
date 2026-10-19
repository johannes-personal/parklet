"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { documents, type DocumentKind } from "@/db/schema";
import type { FormState } from "@/components/form";
import { requireUser } from "@/lib/auth/session";
import { parseSekToOre } from "@/lib/money";
import { normalizeOrgNumber } from "@/lib/org-number";
import { scheduleSchema } from "@/lib/schedule";
import { emailSchema, fieldErrors, spotSchema, type SpotInput } from "@/lib/validation";
import {
  acceptInvitation,
  connectPayoutsMock,
  createHostAccount,
  getAccountForMember,
  inviteAdmin,
  submitAccountForReview,
} from "@/server/host-accounts";
import { lookupOrganisation } from "@/server/company-registry";
import {
  createSpots,
  deleteSpotDocument,
  getSpot,
  listSiblingSpots,
  requestLandlordApproval,
  setSpotStatus,
  submitSpotForReview,
  updateSpot,
} from "@/server/spots";
import { storeDocument } from "@/server/storage";

async function requireMember(accountId: string) {
  const user = await requireUser(`/uthyrare/${accountId}`);
  const account = await getAccountForMember(accountId, user.id);
  if (!account) redirect("/uthyrare");
  return { user, account };
}

/* ----------------------------------------------------------- host account */

export async function createAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/uthyrare/nytt");
  const kind = String(formData.get("kind") ?? "");
  const values = Object.fromEntries(["kind", "name", "orgNumber", "signatoryRole"].map((k) => [k, String(formData.get(k) ?? "")]));
  if (kind === "household") {
    const id = await createHostAccount({ userId: user.id, kind, name: user.name, orgNumber: null, signatoryRole: null, identityVerified: user.identityVerified });
    redirect(`/uthyrare/${id}`);
  }
  if (kind !== "association" && kind !== "company") return { fieldErrors: { kind: "Välj vem som hyr ut." }, values };

  const errors: Record<string, string> = {};
  const name = values.name.trim();
  if (name.length < 2) errors.name = "Ange organisationens namn.";
  const orgNumber = normalizeOrgNumber(values.orgNumber);
  if (!orgNumber) errors.orgNumber = "Ange ett giltigt organisationsnummer (NNNNNN-NNNN).";
  const role = values.signatoryRole.trim();
  if (role.length < 2) errors.signatoryRole = "Ange din roll, t.ex. styrelseledamot eller förvaltare.";
  if (formData.get("confirm") !== "on") errors.confirm = "Du behöver intyga att du får företräda organisationen.";
  if (Object.keys(errors).length) return { fieldErrors: errors, values };

  // Check the number at Bolagsverket. If the registry can't be reached, the documents are reviewed manually as before.
  const lookup = await lookupOrganisation(orgNumber!);
  if (lookup.result === "not_found") {
    return { fieldErrors: { orgNumber: "Vi hittar ingen organisation med det numret hos Bolagsverket. Kontrollera numret." }, values };
  }
  if (lookup.result === "found" && lookup.organisation.status === "deregistered") {
    return { fieldErrors: { orgNumber: `${lookup.organisation.name} är avregistrerad hos Bolagsverket.` }, values };
  }
  const registry = lookup.result === "found" ? lookup.organisation : null;

  const id = await createHostAccount({
    userId: user.id,
    kind,
    // The registered name, so an account can't present itself as another organisation.
    name: registry?.name ?? name,
    orgNumber,
    signatoryRole: role,
    identityVerified: user.identityVerified,
    registry,
  });
  redirect(`/uthyrare/${id}`);
}

export async function connectPayoutsAction(formData: FormData) {
  const accountId = String(formData.get("accountId"));
  const { user, account } = await requireMember(accountId);
  if (account.role !== "owner" || !user.identityVerified) redirect(`/uthyrare/${accountId}`);
  await connectPayoutsMock(accountId);
  redirect(`/uthyrare/${accountId}?utbetalning=1`);
}

export async function submitAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const accountId = String(formData.get("accountId"));
  await requireMember(accountId);
  const result = await submitAccountForReview(accountId);
  if (!result.ok) return { error: result.error };
  revalidatePath(`/uthyrare/${accountId}`);
  return { success: "Tack! Vi granskar underlagen, oftast inom en arbetsdag." };
}

export async function inviteAdminAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const accountId = String(formData.get("accountId"));
  const { user, account } = await requireMember(accountId);
  if (account.kind === "household") return { error: "Privata konton kan inte ha flera administratörer." };
  const email = emailSchema.safeParse(formData.get("email") ?? "");
  if (!email.success) return { fieldErrors: { email: "Ange en giltig e-postadress." } };
  await inviteAdmin(account, user, email.data);
  revalidatePath(`/uthyrare/${accountId}`);
  return { success: `Inbjudan skickad till ${email.data}.` };
}

export async function acceptInvitationAction(formData: FormData) {
  const token = String(formData.get("token"));
  const user = await requireUser(`/inbjudan/${token}`);
  const result = await acceptInvitation(token, user);
  if (!result.ok) redirect(`/inbjudan/${token}?fel=1`);
  redirect(`/uthyrare/${result.accountId}`);
}

/* ------------------------------------------------------------------ spots */

function parseSpotForm(formData: FormData): { input: SpotInput } | { errors: Record<string, string> } {
  const str = (k: string) => String(formData.get(k) ?? "");
  const errors: Record<string, string> = {};
  const hour = parseSekToOre(str("pricePerHour"));
  if (hour == null) errors.pricePerHourOre = "Ange ett timpris i kronor.";
  const dayRaw = str("pricePerDay").trim();
  const day = dayRaw ? parseSekToOre(dayRaw) : null;
  if (dayRaw && day == null) errors.pricePerDayOre = "Ange dygnspriset i kronor, eller lämna tomt.";
  const heightRaw = str("maxHeight").trim().replace(",", ".");
  const height = heightRaw ? Math.round(Number(heightRaw) * 100) : null;
  if (heightRaw && !Number.isFinite(height)) errors.maxHeightCm = "Ange höjd i meter, t.ex. 2,10.";

  let schedule: unknown = null;
  try {
    schedule = JSON.parse(str("schedule"));
  } catch {
    /* handled by schema */
  }
  const sched = scheduleSchema.safeParse(schedule);
  if (!sched.success) errors.schedule = "Ange när platsen är tillgänglig.";

  const parsed = spotSchema.safeParse({
    title: str("title"),
    description: str("description"),
    address: str("address"),
    city: str("city"),
    lat: str("lat") || undefined,
    lng: str("lng") || undefined,
    spotType: str("spotType"),
    covered: formData.get("covered") === "on",
    evCharging: formData.get("evCharging") === "on",
    maxHeightCm: height,
    pricePerHourOre: hour ?? undefined,
    pricePerDayOre: day,
    minDurationMinutes: Number(str("minDurationMinutes")),
    cancellationHours: Number(str("cancellationHours")),
    minNoticeMinutes: Number(str("minNoticeMinutes")),
    accessInstructions: str("accessInstructions"),
    visibility: str("visibility") || "public",
    schedule: sched.success ? sched.data : { mode: "always" },
    rightBasis: str("rightBasis") || undefined,
    landlordKind: str("rightBasis") === "rents" ? str("landlordKind") || null : null,
    landlordName: str("landlordName"),
    landlordEmail: str("landlordEmail"),
    requiresVehicleRegistration: formData.get("requiresVehicleRegistration") === "on",
    vehicleRegistrationNote: str("vehicleRegistrationNote"),
  });
  if (!parsed.success) Object.assign(errors, { ...fieldErrors(parsed.error), ...errors });
  if (Object.keys(errors).length || !parsed.success) return { errors };
  return { input: parsed.data };
}

function formValues(formData: FormData) {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string" && !k.startsWith("$")) out[k] = v;
  return out;
}

export async function saveSpotAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const accountId = String(formData.get("accountId"));
  const spotId = String(formData.get("spotId") ?? "");
  const { user, account } = await requireMember(accountId);
  const parsed = parseSpotForm(formData);
  if ("errors" in parsed) {
    return { error: "Kontrollera de markerade fälten.", fieldErrors: parsed.errors, values: formValues(formData) };
  }
  if (spotId) {
    const ok = await updateSpot(accountId, spotId, parsed.input);
    if (!ok) return { error: "Platsen finns inte." };
    redirect(`/uthyrare/${accountId}/platser/${spotId}?sparad=1`);
  }
  const count = account.kind === "household" ? 1 : Math.min(50, Math.max(1, Number(formData.get("count") ?? 1) || 1));
  const ids = await createSpots(accountId, user.id, parsed.input, count);
  redirect(`/uthyrare/${accountId}/platser/${ids[0]}?ny=${ids.length}`);
}

export async function toggleSpotAction(formData: FormData) {
  const accountId = String(formData.get("accountId"));
  await requireMember(accountId);
  await setSpotStatus(accountId, String(formData.get("spotId")), formData.get("status") === "paused" ? "paused" : "active");
  revalidatePath(`/uthyrare/${accountId}`);
}

export async function submitSpotAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const accountId = String(formData.get("accountId"));
  const spotId = String(formData.get("spotId"));
  await requireMember(accountId);
  const result = await submitSpotForReview(accountId, spotId);
  if (!result.ok) return { error: result.error };
  let extra = 0;
  if (formData.get("includeSiblings") === "on") {
    const spot = await getSpot(spotId);
    for (const s of spot ? await listSiblingSpots(spot) : []) {
      if (s.review === "draft" || s.review === "rejected") {
        if ((await submitSpotForReview(accountId, s.id)).ok) extra++;
      }
    }
  }
  revalidatePath(`/uthyrare/${accountId}/platser/${spotId}`);
  return {
    success: `${extra ? `${extra + 1} platser är` : "Platsen är"} inskickad${extra ? "e" : ""} för granskning. Vi meddelar dig när de är godkända.`,
  };
}

export async function requestApprovalAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const accountId = String(formData.get("accountId"));
  const spotId = String(formData.get("spotId"));
  const { user } = await requireMember(accountId);
  const result = await requestLandlordApproval(accountId, spotId, user.name);
  if (!result.ok) return { error: result.error };
  revalidatePath(`/uthyrare/${accountId}/platser/${spotId}`);
  return { success: "Förfrågan är skickad. Du ser här när den är besvarad." };
}

/* -------------------------------------------------------------- documents */

const SPOT_DOC_KINDS: DocumentKind[] = ["ownership_proof", "rental_contract", "sublet_permission", "landlord_rules", "other"];
const ACCOUNT_DOC_KINDS: DocumentKind[] = ["org_registration", "board_minutes", "signatory_proof", "other"];

export async function uploadDocumentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const accountId = String(formData.get("accountId"));
  const spotId = String(formData.get("spotId") ?? "") || null;
  const { user } = await requireMember(accountId);
  const kind = String(formData.get("kind")) as DocumentKind;
  if (!(spotId ? SPOT_DOC_KINDS : ACCOUNT_DOC_KINDS).includes(kind)) return { error: "Välj vilken typ av dokument det är." };
  if (spotId) {
    const spot = await getSpot(spotId);
    if (!spot || spot.hostAccountId !== accountId) return { error: "Platsen finns inte." };
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Välj en fil att ladda upp." };
  const stored = await storeDocument(Buffer.from(await file.arrayBuffer()));
  if ("error" in stored) return { error: stored.error };
  let targets: (string | null)[] = [spotId];
  if (spotId && formData.get("applyToSiblings") === "on") {
    const spot = await getSpot(spotId);
    if (spot) targets = [spotId, ...(await listSiblingSpots(spot)).map((s) => s.id)];
  }
  await db.insert(documents).values(
    targets.map((target) => ({
      hostAccountId: accountId,
      spotId: target,
      uploadedBy: user.id,
      kind,
      filename: file.name.slice(0, 200) || "dokument",
      ...stored,
    })),
  );
  revalidatePath(spotId ? `/uthyrare/${accountId}/platser/${spotId}` : `/uthyrare/${accountId}`);
  return { success: `${file.name} är uppladdad.` };
}

export async function deleteDocumentAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const accountId = String(formData.get("accountId"));
  const spotId = String(formData.get("spotId"));
  await requireMember(accountId);
  const result = await deleteSpotDocument(accountId, spotId, String(formData.get("documentId")));
  if (!result.ok) return { error: result.error };
  revalidatePath(`/uthyrare/${accountId}/platser/${spotId}`);
  return { success: "Dokumentet är borttaget." };
}
