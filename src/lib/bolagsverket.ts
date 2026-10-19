/**
 * Parsing of Bolagsverket's free "värdefulla datamängder" API (EU high-value
 * datasets): POST /organisationer { identitetsbeteckning } returns
 * { organisationer: [...] }. Sub-objects carry their own `fel` when a source
 * is unavailable, so every field is optional.
 */

export type RegistryStatus = "active" | "liquidation" | "deregistered";

export type RegistryOrganisation = {
  name: string;
  /** e.g. "Bostadsrättsförening", "Aktiebolag". */
  form: string | null;
  status: RegistryStatus;
};

export type RegistryLookup =
  | { result: "found"; organisation: RegistryOrganisation }
  | { result: "not_found" }
  | { result: "unavailable"; reason: string };

type KodKlartext = { kod?: string; klartext?: string } | null | undefined;
type Fel = { typ?: string; felBeskrivning?: string } | null | undefined;

type ApiOrganisation = {
  fel?: Fel;
  organisationsnamn?: { organisationsnamnLista?: { namn?: string; organisationsnamntyp?: KodKlartext }[]; fel?: Fel } | null;
  organisationsform?: (KodKlartext & { fel?: Fel }) | null;
  juridiskForm?: (KodKlartext & { fel?: Fel }) | null;
  avregistreradOrganisation?: { avregistreringsdatum?: string | null; fel?: Fel } | null;
  pagaendeAvvecklingsEllerOmstruktureringsforfarande?: { pagaendeAvvecklingsEllerOmstruktureringsforfarandeLista?: unknown[] | null } | null;
};

export function parseOrganisationResponse(body: unknown): RegistryLookup {
  const list = (body as { organisationer?: ApiOrganisation[] } | null)?.organisationer;
  if (!Array.isArray(list) || list.length === 0) return { result: "not_found" };
  const org = list[0];
  if (org.fel?.typ === "ORGANISATION_FINNS_EJ") return { result: "not_found" };
  if (org.fel?.typ) return { result: "unavailable", reason: org.fel.typ };

  const names = org.organisationsnamn?.organisationsnamnLista ?? [];
  // Prefer the registered company name over secondary names (bifirmor).
  const name =
    names.find((n) => /f[oö]retagsnamn/i.test(`${n.organisationsnamntyp?.kod ?? ""} ${n.organisationsnamntyp?.klartext ?? ""}`))?.namn ?? names[0]?.namn;
  if (!name) return { result: "unavailable", reason: "name missing" };

  const form = org.organisationsform?.klartext ?? org.juridiskForm?.klartext ?? null;
  const deregistered = Boolean(org.avregistreradOrganisation?.avregistreringsdatum);
  const proceedings = org.pagaendeAvvecklingsEllerOmstruktureringsforfarande?.pagaendeAvvecklingsEllerOmstruktureringsforfarandeLista ?? [];
  const status: RegistryStatus = deregistered ? "deregistered" : proceedings.length > 0 ? "liquidation" : "active";
  return { result: "found", organisation: { name, form, status } };
}

/** Does the registered legal form fit what the user chose ("association" or "company")? */
export function formMatchesKind(form: string | null, kind: "association" | "company"): boolean | null {
  if (!form) return null;
  const isAssociation = /förening|samfällighet|stiftelse/i.test(form);
  return kind === "association" ? isAssociation : !isAssociation;
}
