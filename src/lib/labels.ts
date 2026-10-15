import type { SpotType } from "@/db/schema";

export const SPOT_TYPE_LABEL: Record<SpotType, string> = {
  outdoor: "Utomhusplats",
  garage: "Garage",
  carport: "Carport",
  driveway: "Uppfart",
};

export function spotFeatures(s: { spotType: SpotType; covered: boolean; evCharging: boolean; maxHeightCm?: number | null }) {
  const out: string[] = [SPOT_TYPE_LABEL[s.spotType]];
  if (s.covered && s.spotType !== "garage" && s.spotType !== "carport") out.push("Under tak");
  if (s.evCharging) out.push("Elbilsladdning");
  if (s.maxHeightCm) out.push(`Max höjd ${(s.maxHeightCm / 100).toFixed(2).replace(".", ",")} m`);
  return out;
}

export const DOCUMENT_KIND_LABEL: Record<string, string> = {
  ownership_proof: "Ägarskapsbevis (t.ex. lagfart, köpekontrakt)",
  rental_contract: "Hyresavtal för platsen",
  sublet_permission: "Skriftligt godkännande av uthyrning",
  landlord_rules: "Föreningens/hyresvärdens parkeringsregler",
  org_registration: "Registreringsbevis / utdrag från Bolagsverket",
  board_minutes: "Styrelseprotokoll",
  signatory_proof: "Firmatecknarbevis",
  other: "Övrigt",
};

export const SPOT_DOC_OPTIONS = ["ownership_proof", "rental_contract", "sublet_permission", "landlord_rules", "other"].map((value) => ({
  value,
  label: DOCUMENT_KIND_LABEL[value],
}));

export const ACCOUNT_DOC_OPTIONS = ["org_registration", "board_minutes", "signatory_proof", "other"].map((value) => ({
  value,
  label: DOCUMENT_KIND_LABEL[value],
}));

export const REVIEW_LABEL = {
  draft: { text: "Utkast – underlag saknas", kind: "neutral" },
  pending_review: { text: "Granskas av Parklet", kind: "warn" },
  approved: { text: "Godkänd", kind: "ok" },
  rejected: { text: "Ej godkänd", kind: "danger" },
} as const;
