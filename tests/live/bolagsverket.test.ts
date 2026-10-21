import { describe, expect, it } from "vitest";
import { lookupOrganisation, registryConfigured } from "@/server/company-registry";
import { formMatchesKind } from "@/lib/bolagsverket";
import { normalizeOrgNumber } from "@/lib/org-number";

/**
 * Against Bolagsverket's real API ("värdefulla datamängder"), to catch a change in
 * their API or our credentials that the fake in e2e/fake-bolagsverket.mjs can't.
 * Runs with `npm run test:live` when BOLAGSVERKET_CLIENT_ID and _SECRET are set
 * (BOLAGSVERKET_ENV=test for their test environment), and skips otherwise. In CI
 * it is the "live" workflow, from the repository's secrets.
 */
describe.skipIf(!registryConfigured())("Bolagsverket's API", () => {
  it("finds a registered company with its name, legal form and status", async () => {
    // AB Volvo: public, long-lived, and an aktiebolag.
    const lookup = await lookupOrganisation("556012-5790");
    expect(lookup).toMatchObject({ result: "found", organisation: { status: "active" } });
    if (lookup.result !== "found") return;
    expect(lookup.organisation.name).toMatch(/volvo/i);
    expect(lookup.organisation.form).toMatch(/aktiebolag/i);
    expect(formMatchesKind(lookup.organisation.form, "company")).toBe(true);
    expect(formMatchesKind(lookup.organisation.form, "association")).toBe(false);
  });

  it("says a well-formed number it doesn't know is not found", async () => {
    // Valid check digit, not issued (checked against the API on 2026-10-20). The real API
    // reports this per section rather than once, which the parser must recognise; read as
    // "unavailable" it would let a mistyped number through to manual review.
    expect(await lookupOrganisation("559999-9991")).toEqual({ result: "not_found" });
  });

  it("finds numbers in the formats hosts type, normalised as the app does", async () => {
    for (const typed of ["5560125790", "556012-5790", "16556012-5790"]) {
      const normalised = normalizeOrgNumber(typed);
      expect(normalised, typed).toBe("556012-5790");
      expect((await lookupOrganisation(normalised!)).result, typed).toBe("found");
    }
  });
});
