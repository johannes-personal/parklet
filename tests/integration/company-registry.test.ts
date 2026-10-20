import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { freePort } from "../../scripts/postgrest.mjs";

// The Bolagsverket client (src/server/company-registry.ts) against a local stand-in for
// Bolagsverket's API, with the shapes of e2e/fake-bolagsverket.mjs.

const CLIENT_ID = "parklet-test";
const CLIENT_SECRET = "test-secret";
const organisation = (name: string, extra = {}) => ({
  organisationsnamn: { organisationsnamnLista: [{ namn: name, organisationsnamntyp: { kod: "FORETAGSNAMN", klartext: "Företagsnamn" } }] },
  organisationsform: { kod: "BRF", klartext: "Bostadsrättsförening" },
  ...extra,
});
const REGISTRY: Record<string, unknown> = {
  "7696001234": organisation("Bostadsrättsföreningen Testgården"),
  "7696009997": organisation("Brf Nedlagd", { avregistreradOrganisation: { avregistreringsdatum: "2020-01-01" } }),
};

const fake = {
  tokens: new Set<string>(),
  tokenRequests: 0,
  lookups: [] as { auth: string | undefined; body: unknown }[],
  tokenStatus: 200,
  lookupStatus: 200,
  expiresIn: 3600,
};
const server = http.createServer((req, res) => {
  let data = "";
  req.on("data", (c) => (data += c));
  req.on("end", () => {
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.url === "/oauth2/token" && req.method === "POST") {
      fake.tokenRequests++;
      if (fake.tokenStatus !== 200) return json(fake.tokenStatus, { error: "server_error" });
      const form = new URLSearchParams(data);
      if (form.get("grant_type") !== "client_credentials" || form.get("client_id") !== CLIENT_ID || form.get("client_secret") !== CLIENT_SECRET) {
        return json(401, { error: "invalid_client" });
      }
      const token = `token-${fake.tokenRequests}`;
      fake.tokens.add(token);
      return json(200, { access_token: token, token_type: "Bearer", expires_in: fake.expiresIn });
    }
    if (req.url === "/vardefulla-datamangder/v1/organisationer" && req.method === "POST") {
      fake.lookups.push({ auth: req.headers.authorization, body: JSON.parse(data) });
      if (fake.lookupStatus !== 200) return json(fake.lookupStatus, { error: "boom" });
      if (!fake.tokens.has((req.headers.authorization ?? "").replace(/^Bearer /, ""))) return json(401, { error: "unauthorized" });
      const org = REGISTRY[(JSON.parse(data) as { identitetsbeteckning: string }).identitetsbeteckning];
      return json(200, { organisationer: [org ?? { fel: { typ: "ORGANISATION_FINNS_EJ", felBeskrivning: "Organisationen finns inte" } }] });
    }
    json(404, { error: "not_found" });
  });
});
let base = "";

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

/** A fresh copy of the client (its token cache is module state), configured for the fake. */
async function client({ configured = true } = {}) {
  vi.resetModules();
  if (configured) {
    process.env.BOLAGSVERKET_CLIENT_ID = CLIENT_ID;
    process.env.BOLAGSVERKET_CLIENT_SECRET = CLIENT_SECRET;
  }
  process.env.BOLAGSVERKET_TOKEN_URL = `${base}/oauth2/token`;
  process.env.BOLAGSVERKET_BASE_URL = `${base}/vardefulla-datamangder/v1`;
  return import("@/server/company-registry");
}

let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  Object.assign(fake, { tokenRequests: 0, lookups: [], tokenStatus: 200, lookupStatus: 200, expiresIn: 3600 });
  fake.tokens.clear();
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  for (const k of ["CLIENT_ID", "CLIENT_SECRET", "TOKEN_URL", "BASE_URL"]) delete process.env[`BOLAGSVERKET_${k}`];
  vi.restoreAllMocks();
});

const UNAVAILABLE = (reason: string) => ({ result: "unavailable", reason });

describe("the Bolagsverket client", () => {
  it("skips the check (manual review) when no credentials are configured", async () => {
    const { lookupOrganisation, registryConfigured } = await client({ configured: false });
    expect(registryConfigured()).toBe(false);
    expect(await lookupOrganisation("769600-1234")).toEqual(UNAVAILABLE("not configured"));
    expect(fake.tokenRequests + fake.lookups.length).toBe(0);
  });

  it("finds a registered organisation, by its digits, with a bearer token", async () => {
    const { lookupOrganisation } = await client();
    expect(await lookupOrganisation("769600-1234")).toEqual({
      result: "found",
      organisation: { name: "Bostadsrättsföreningen Testgården", form: "Bostadsrättsförening", status: "active" },
    });
    expect(fake.lookups).toEqual([{ auth: "Bearer token-1", body: { identitetsbeteckning: "7696001234" } }]);
  });

  it("tells not found and deregistered apart", async () => {
    const { lookupOrganisation } = await client();
    expect(await lookupOrganisation("556677-8899")).toEqual({ result: "not_found" });
    expect(await lookupOrganisation("769600-9997")).toEqual({
      result: "found",
      organisation: { name: "Brf Nedlagd", form: "Bostadsrättsförening", status: "deregistered" },
    });
  });

  it("reuses its token until shortly before it expires", async () => {
    const { lookupOrganisation } = await client();
    for (let i = 0; i < 3; i++) await lookupOrganisation("769600-1234");
    expect(fake.tokenRequests).toBe(1);

    // A token that expires within 30 seconds is not reused.
    const fresh = await client();
    fake.expiresIn = 20;
    await fresh.lookupOrganisation("769600-1234");
    await fresh.lookupOrganisation("769600-1234");
    expect(fake.tokenRequests).toBe(3);
  });

  it("drops a token the API rejects, and gets a new one next time", async () => {
    const { lookupOrganisation } = await client();
    await lookupOrganisation("769600-1234");
    fake.tokens.clear(); // e.g. revoked at Bolagsverket
    expect(await lookupOrganisation("769600-1234")).toEqual(UNAVAILABLE("HTTP 401"));
    expect(await lookupOrganisation("769600-1234")).toMatchObject({ result: "found" });
    expect(fake.tokenRequests).toBe(2);
  });

  it("falls back to manual review, without throwing, when the API fails", async () => {
    const { lookupOrganisation } = await client();
    fake.lookupStatus = 500;
    expect(await lookupOrganisation("769600-1234")).toEqual(UNAVAILABLE("HTTP 500"));

    fake.lookupStatus = 200;
    const other = await client();
    fake.tokenStatus = 500;
    expect(await other.lookupOrganisation("769600-1234")).toEqual(UNAVAILABLE("request failed"));
    expect(consoleError).toHaveBeenCalledWith("company registry: lookup failed", "token request failed: 500");
  });

  it("falls back to manual review when Bolagsverket can't be reached", async () => {
    const { lookupOrganisation } = await client();
    const closed = `http://127.0.0.1:${await freePort()}`;
    process.env.BOLAGSVERKET_TOKEN_URL = `${closed}/oauth2/token`;
    process.env.BOLAGSVERKET_BASE_URL = `${closed}/vardefulla-datamangder/v1`;
    expect(await lookupOrganisation("769600-1234")).toEqual(UNAVAILABLE("request failed"));
  });
});
