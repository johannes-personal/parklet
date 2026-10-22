import type { PayoutStatus, SpotType } from "@/db/schema";

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

/** A host account's payout account, as admins see it. */
export const PAYOUT_LABEL: Record<PayoutStatus, string> = {
  not_connected: "Ej kopplad",
  onboarding: "Påbörjad hos Stripe",
  pending: "Stripe kontrollerar",
  restricted: "Stripe behöver uppgifter",
  active: "Kopplad",
};

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

export const ACCOUNT_DOC_OPTIONS = ["org_registration", "board_minutes", "signatory_proof", "other"].map((value) => ({
  value,
  label: DOCUMENT_KIND_LABEL[value],
}));

export const VERIFICATION_LABEL = {
  unverified: { text: "Ej verifierad", kind: "neutral" },
  pending: { text: "Granskas", kind: "warn" },
  verified: { text: "Verifierad", kind: "ok" },
  rejected: { text: "Ej godkänd", kind: "danger" },
} as const;

export const REVIEW_LABEL = {
  draft: { text: "Utkast – underlag saknas", kind: "neutral" },
  pending_review: { text: "Granskas av Parklet", kind: "warn" },
  approved: { text: "Godkänd", kind: "ok" },
  rejected: { text: "Ej godkänd", kind: "danger" },
} as const;

/** What an e-mail in the admins' log is: a notification's kind, or one of the mails sent outside notifications. */
export const MAIL_KIND_LABEL: Record<string, string> = {
  booking_confirmed: "Bokningsbekräftelse",
  booking_new: "Ny bokning (uthyrare)",
  vehicle_registration: "Ny bokning, registrera bil",
  booking_cancelled: "Avbokning",
  vehicle_reminder: "Påminnelse: registrera bil",
  vehicle_registered: "Bil registrerad",
  vehicle_overdue: "Bil ej registrerad",
  payment_refunded: "Återbetalning",
  spot_reviewed: "Granskning av plats",
  account_reviewed: "Granskning av konto",
  landlord_approval: "Godkännande från förening/hyresvärd",
  landlord_approval_requested: "Godkännande begärt",
  landlord_response: "Svar från förening/hyresvärd",
  payouts_active: "Utbetalningar kopplade",
  payouts_restricted: "Utbetalningar: uppgifter saknas",
  invitation: "Inbjudan som administratör",
  password_reset: "Nytt lösenord",
  admin_spot_submitted: "Admin: plats att granska",
  admin_account_submitted: "Admin: konto att granska",
  admin_vehicle_overdue: "Admin: bil ej registrerad",
  refund_failed: "Admin: återbetalning misslyckades",
  payment_unexpected: "Admin: oväntad betalning",
  digest: "Admin: daglig sammanfattning",
};

/** The label for a mail kind; mails logged before kinds were stored have none. */
export const mailKindLabel = (kind: string | null) => (kind ? (MAIL_KIND_LABEL[kind] ?? kind) : "Övrigt");

/** A booking's status and payment, as admins filter on them. */
export const BOOKING_STATUS_LABEL = {
  pending_payment: "Väntar på betalning",
  confirmed: "Bekräftad",
  cancelled: "Avbokad",
  expired: "Ej genomförd",
} as const;

export const PAYMENT_STATUS_LABEL = { unpaid: "Ej betald", paid: "Betald", refunded: "Återbetald" } as const;
