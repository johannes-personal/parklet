import { describe, expect, it } from "vitest";
import { formMatchesKind, parseOrganisationResponse } from "@/lib/bolagsverket";

const org = (extra: object = {}) => ({
  organisationsidentitet: { identitetsbeteckning: "7696001234", typ: { kod: "ORGNR", klartext: "Organisationsnummer" } },
  organisationsnamn: {
    organisationsnamnLista: [
      { namn: "Testgårdens Parkering", organisationsnamntyp: { kod: "BIFIRMA", klartext: "Bifirma" } },
      { namn: "Bostadsrättsföreningen Testgården", organisationsnamntyp: { kod: "FORETAGSNAMN", klartext: "Företagsnamn" } },
    ],
  },
  organisationsform: { kod: "BRF", klartext: "Bostadsrättsförening" },
  ...extra,
});

describe("parseOrganisationResponse", () => {
  it("returns the registered name, form and status", () => {
    expect(parseOrganisationResponse({ organisationer: [org()] })).toEqual({
      result: "found",
      organisation: { name: "Bostadsrättsföreningen Testgården", form: "Bostadsrättsförening", status: "active" },
    });
  });

  it("flags deregistration and ongoing liquidation", () => {
    const dereg = parseOrganisationResponse({ organisationer: [org({ avregistreradOrganisation: { avregistreringsdatum: "2020-01-01" } })] });
    expect(dereg).toMatchObject({ organisation: { status: "deregistered" } });
    const liq = parseOrganisationResponse({
      organisationer: [org({ pagaendeAvvecklingsEllerOmstruktureringsforfarande: { pagaendeAvvecklingsEllerOmstruktureringsforfarandeLista: [{ kod: "LI" }] } })],
    });
    expect(liq).toMatchObject({ organisation: { status: "liquidation" } });
  });

  it("distinguishes not found from an unavailable source", () => {
    expect(parseOrganisationResponse({ organisationer: [] })).toEqual({ result: "not_found" });
    expect(parseOrganisationResponse({ organisationer: [{ fel: { typ: "ORGANISATION_FINNS_EJ" } }] })).toEqual({ result: "not_found" });
    // The real API's answer (from production, shortened): an error in every section, none at the top.
    const fel = { typ: "ORGANISATION_FINNS_EJ", felBeskrivning: "Begärd organisation finns inte registrerad i sökbar form hos aktuell dataproducent." };
    const real = {
      organisationer: [
        {
          avregistreradOrganisation: { avregistreringsdatum: null, dataproducent: "Bolagsverket", fel },
          avregistreringsorsak: { kod: null, klartext: null, dataproducent: "Bolagsverket", fel },
          organisationsnamn: { organisationsnamnLista: null, dataproducent: "Bolagsverket", fel },
        },
      ],
    };
    expect(parseOrganisationResponse(real)).toEqual({ result: "not_found" });
    expect(parseOrganisationResponse({ organisationer: [{ fel: { typ: "OTILLGANGLIG_UPPGIFTSKALLA" } }] })).toEqual({
      result: "unavailable",
      reason: "OTILLGANGLIG_UPPGIFTSKALLA",
    });
    expect(parseOrganisationResponse(null)).toEqual({ result: "not_found" });
  });

  it("falls back to the legal form from SCB", () => {
    const parsed = parseOrganisationResponse({ organisationer: [org({ organisationsform: null, juridiskForm: { kod: "53", klartext: "Bostadsrättsföreningar" } })] });
    expect(parsed).toMatchObject({ organisation: { form: "Bostadsrättsföreningar" } });
  });
});

describe("formMatchesKind", () => {
  it("matches associations and companies", () => {
    expect(formMatchesKind("Bostadsrättsförening", "association")).toBe(true);
    expect(formMatchesKind("Aktiebolag", "association")).toBe(false);
    expect(formMatchesKind("Aktiebolag", "company")).toBe(true);
    expect(formMatchesKind(null, "company")).toBeNull();
  });
});
