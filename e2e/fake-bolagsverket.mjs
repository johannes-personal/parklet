// A minimal stand-in for Bolagsverket's free "värdefulla datamängder" API:
// OAuth2 client credentials, then POST /vardefulla-datamangder/v1/organisationer.
// Response shapes follow Bolagsverket's documented schema.
import { randomBytes } from "node:crypto";
import http from "node:http";

const PORT = Number(process.env.FAKE_BOLAGSVERKET_PORT ?? 3102);
const CLIENT_ID = "parklet-e2e";
const CLIENT_SECRET = "e2e-secret";
const tokens = new Set();

const organisation = (name, form, extra = {}) => ({
  organisationsnamn: { organisationsnamnLista: [{ namn: name, organisationsnamntyp: { kod: "FORETAGSNAMN", klartext: "Företagsnamn" } }] },
  organisationsform: { kod: form.kod, klartext: form.klartext },
  verksamOrganisation: { kod: "JA" },
  ...extra,
});
const BRF = { kod: "BRF", klartext: "Bostadsrättsförening" };
const REGISTRY = {
  "7696001234": organisation("Bostadsrättsföreningen Testgården", BRF),
  "7696009997": organisation("Brf Nedlagd", BRF, { avregistreradOrganisation: { avregistreringsdatum: "2020-01-01" } }),
};

const json = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};
const readBody = (req) =>
  new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });

http
  .createServer(async (req, res) => {
    if (req.url === "/oauth2/token" && req.method === "POST") {
      const body = new URLSearchParams(await readBody(req));
      if (body.get("grant_type") !== "client_credentials" || body.get("client_id") !== CLIENT_ID || body.get("client_secret") !== CLIENT_SECRET) {
        return json(res, 401, { error: "invalid_client" });
      }
      const token = randomBytes(16).toString("hex");
      tokens.add(token);
      return json(res, 200, { access_token: token, token_type: "Bearer", expires_in: 3600 });
    }
    if (req.url === "/vardefulla-datamangder/v1/organisationer" && req.method === "POST") {
      if (!tokens.has((req.headers.authorization ?? "").replace(/^Bearer /, ""))) return json(res, 401, { error: "unauthorized" });
      const { identitetsbeteckning } = JSON.parse(await readBody(req));
      const org = REGISTRY[identitetsbeteckning];
      return json(res, 200, { organisationer: [org ?? { fel: { typ: "ORGANISATION_FINNS_EJ", felBeskrivning: "Organisationen finns inte" } }] });
    }
    // Readiness probe for Playwright.
    if (req.url === "/health") return json(res, 200, { ok: true });
    json(res, 404, { error: "not_found" });
  })
  .listen(PORT, () => console.log(`fake Bolagsverket on http://localhost:${PORT}`));
