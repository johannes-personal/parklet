// A minimal stand-in for Idura's OpenID Connect endpoints, so the e2e tests run
// the real BankID login code (discovery, PKCE, signed ID token, nonce) without
// credentials. The "BankID" page has two buttons: approve or cancel.
import { createHash, randomBytes } from "node:crypto";
import http from "node:http";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

const PORT = Number(process.env.FAKE_IDP_PORT ?? 3101);
const ISSUER = `http://localhost:${PORT}`;
const CLIENT_ID = "parklet-e2e";
const CLIENT_SECRET = "e2e-secret";
const PERSON = { sub: "fake-sub-1", ssn: "199001012384", name: "Lisa Uthyrare", given_name: "Lisa", family_name: "Uthyrare" };

const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), kid: "e2e", alg: "RS256", use: "sig" };
const codes = new Map();

const json = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};
const redirect = (res, to) => {
  res.writeHead(302, { Location: to });
  res.end();
};
const readBody = (req) => new Promise((resolve) => {
  let data = "";
  req.on("data", (c) => (data += c));
  req.on("end", () => resolve(new URLSearchParams(data)));
});

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, ISSUER);
    if (url.pathname === "/.well-known/openid-configuration") {
      return json(res, 200, {
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/oauth2/authorize`,
        token_endpoint: `${ISSUER}/oauth2/token`,
        jwks_uri: `${ISSUER}/.well-known/jwks`,
        response_types_supported: ["code"],
        subject_types_supported: ["pairwise"],
        id_token_signing_alg_values_supported: ["RS256"],
        token_endpoint_auth_methods_supported: ["client_secret_post"],
        code_challenge_methods_supported: ["S256"],
      });
    }
    if (url.pathname === "/.well-known/jwks") return json(res, 200, { keys: [jwk] });

    if (url.pathname === "/oauth2/authorize") {
      const p = url.searchParams;
      if (p.get("client_id") !== CLIENT_ID || p.get("code_challenge_method") !== "S256" || p.get("acr_values") !== "urn:grn:authn:se:bankid") {
        return json(res, 400, { error: "invalid_request" });
      }
      const back = new URL(p.get("redirect_uri"));
      back.searchParams.set("state", p.get("state"));
      if (p.get("decision") === "cancel") {
        back.searchParams.set("error", "access_denied");
        return redirect(res, back.toString());
      }
      if (p.get("decision") === "approve") {
        const code = randomBytes(16).toString("hex");
        codes.set(code, { nonce: p.get("nonce"), challenge: p.get("code_challenge"), redirectUri: p.get("redirect_uri") });
        back.searchParams.set("code", code);
        return redirect(res, back.toString());
      }
      const approve = new URL(url);
      approve.searchParams.set("decision", "approve");
      const cancel = new URL(url);
      cancel.searchParams.set("decision", "cancel");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(
        `<!doctype html><title>Fake BankID</title><h1>Fake BankID</h1>` +
          `<a href="${approve.pathname}${approve.search}"><button>Godkänn</button></a> ` +
          `<a href="${cancel.pathname}${cancel.search}"><button>Avbryt</button></a>`,
      );
    }

    if (url.pathname === "/oauth2/token" && req.method === "POST") {
      const body = await readBody(req);
      const entry = codes.get(body.get("code"));
      codes.delete(body.get("code"));
      const challenge = createHash("sha256").update(body.get("code_verifier") ?? "").digest("base64url");
      if (
        !entry ||
        body.get("client_id") !== CLIENT_ID ||
        body.get("client_secret") !== CLIENT_SECRET ||
        body.get("redirect_uri") !== entry.redirectUri ||
        challenge !== entry.challenge
      ) {
        return json(res, 400, { error: "invalid_grant" });
      }
      const idToken = await new SignJWT({ ...PERSON, nonce: entry.nonce, identityscheme: "sebankid", country: "SE" })
        .setProtectedHeader({ alg: "RS256", kid: "e2e" })
        .setIssuer(ISSUER)
        .setAudience(CLIENT_ID)
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);
      return json(res, 200, { access_token: randomBytes(16).toString("hex"), token_type: "Bearer", expires_in: 300, id_token: idToken });
    }

    json(res, 404, { error: "not_found" });
  })
  .listen(PORT, () => console.log(`fake IdP on ${ISSUER}`));
