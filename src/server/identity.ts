import "server-only";
import { randomUUID } from "node:crypto";
import * as oidc from "openid-client";
import { api, cols, embed, must, names, parse, toDb } from "@/db/api";
import { hostAccountMembers, hostAccounts, identityRequests, users, type HostAccount } from "@/db/schema";

const R = names(identityRequests);
const U = names(users);
const M = names(hostAccountMembers);
const A = names(hostAccounts);
import { appUrl } from "@/lib/app-url";
import { encryptField, hasEncryptionKey } from "@/lib/crypto";
import { normalizePersonnummer } from "@/lib/personnummer";
import { notifyAdmins } from "./notifications";

/**
 * Electronic identification with Swedish BankID through Idura (formerly
 * Criipto), an OpenID Connect broker. Idura shows the BankID QR code or opens
 * the app, and returns a signed ID token with the verified name, personnummer
 * (`ssn`) and a stable pseudonym (`sub`).
 *
 * Configure with IDURA_ISSUER (e.g. https://parklet-test.idura.broker),
 * IDURA_CLIENT_ID, IDURA_CLIENT_SECRET and IDENTITY_ENCRYPTION_KEY. Without
 * them, development and the demo fall back to a mock that verifies instantly.
 */

export const CALLBACK_PATH = "/konto/verifiera/callback";
const REQUEST_TTL_MS = 10 * 60_000;
const BANKID_ACR = "urn:grn:authn:se:bankid";

export type IdentityMode = "idura" | "mock" | "unavailable";

export function identityMode(): IdentityMode {
  const { IDURA_ISSUER, IDURA_CLIENT_ID, IDURA_CLIENT_SECRET } = process.env;
  // Half-configured is an error, not a reason to fall back to the mock.
  if (IDURA_ISSUER) {
    if (IDURA_CLIENT_ID && IDURA_CLIENT_SECRET && hasEncryptionKey()) return "idura";
    warnMisconfigured();
    return "unavailable";
  }
  if (process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEMO === "1") return "mock";
  return "unavailable";
}

let warned = false;
function warnMisconfigured() {
  if (warned) return;
  warned = true;
  const missing = [
    !process.env.IDURA_CLIENT_ID && "IDURA_CLIENT_ID",
    !process.env.IDURA_CLIENT_SECRET && "IDURA_CLIENT_SECRET",
    !hasEncryptionKey() && "IDENTITY_ENCRYPTION_KEY (missing, or not 32 bytes base64/hex)",
  ].filter(Boolean);
  console.error(`identity: BankID is switched off until these are fixed: ${missing.join(", ")}`);
}

let configPromise: Promise<oidc.Configuration> | null = null;

/** Discovery is cached per server instance; a failed attempt is retried on the next request. */
function iduraConfig(): Promise<oidc.Configuration> {
  configPromise ??= (async () => {
    const issuer = new URL(process.env.IDURA_ISSUER!);
    // Plain http is only accepted for a local test provider (see e2e/fake-idp.mjs).
    const local = issuer.protocol === "http:" && ["localhost", "127.0.0.1"].includes(issuer.hostname);
    return oidc.discovery(
      issuer,
      process.env.IDURA_CLIENT_ID!,
      undefined,
      oidc.ClientSecretPost(process.env.IDURA_CLIENT_SECRET!),
      local ? { execute: [oidc.allowInsecureRequests] } : undefined,
    );
  })().catch((err) => {
    configPromise = null;
    throw err;
  });
  return configPromise;
}

function redirectUri(): string {
  return `${appUrl()}${CALLBACK_PATH}`;
}

/** Step 1: remember state, nonce and PKCE verifier, and return the broker URL to send the user to. */
export async function startVerification(userId: string, next: string): Promise<URL> {
  const config = await iduraConfig();
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const codeVerifier = oidc.randomPKCECodeVerifier();

  must(await api().from("identity_requests").delete().lt(R.expiresAt, new Date().toISOString()), "startVerification");
  must(
    await api()
      .from("identity_requests")
      .insert(toDb(identityRequests, { state, userId, nonce, codeVerifier, next, expiresAt: new Date(Date.now() + REQUEST_TTL_MS) })),
    "startVerification",
  );

  return oidc.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri(),
    scope: "openid",
    response_type: "code",
    acr_values: BANKID_ACR,
    ui_locales: "sv",
    state,
    nonce,
    code_challenge: await oidc.calculatePKCECodeChallenge(codeVerifier),
    code_challenge_method: "S256",
  });
}

export type VerificationResult = { ok: true; next: string } | { ok: false; reason: "cancelled" | "expired" | "failed"; next: string };

/** Step 2: the broker redirected back. Exchange the code, validate the ID token and record the identity. */
export async function completeVerification(userId: string, callbackUrl: URL): Promise<VerificationResult> {
  const state = callbackUrl.searchParams.get("state") ?? "";
  // Used once: taking the request out of the table is what claims it.
  const [claimed] = must<unknown[]>(
    await api().from("identity_requests").delete().eq(R.state, state).eq(R.userId, userId).select(cols(identityRequests)),
    "completeVerification",
  );
  const request = claimed ? parse(identityRequests, claimed) : null;
  if (!request) return { ok: false, reason: "expired", next: "/uthyrare" };
  const next = request.next;
  if (request.expiresAt < new Date()) return { ok: false, reason: "expired", next };
  if (callbackUrl.searchParams.get("error") === "access_denied") return { ok: false, reason: "cancelled", next };

  try {
    const config = await iduraConfig();
    // Build the URL from APP_URL so it matches the registered redirect URI whichever alias the user came in on.
    const current = new URL(redirectUri());
    current.search = callbackUrl.search;
    const tokens = await oidc.authorizationCodeGrant(config, current, {
      expectedState: request.state,
      expectedNonce: request.nonce,
      pkceCodeVerifier: request.codeVerifier,
      idTokenExpected: true,
    });
    const claims = tokens.claims();
    const personnummer = normalizePersonnummer(claims?.ssn);
    if (!claims?.sub || claims.identityscheme !== "sebankid" || !personnummer) {
      console.error("identity: unexpected ID token claims", { identityscheme: claims?.identityscheme, hasSsn: Boolean(claims?.ssn) });
      return { ok: false, reason: "failed", next };
    }
    await recordVerifiedIdentity(userId, {
      provider: "idura-sebankid",
      ref: String(claims.sub),
      name: typeof claims.name === "string" ? claims.name : null,
      personnummer,
    });
    return { ok: true, next };
  } catch (err) {
    console.error("identity: verification failed", err instanceof Error ? err.message : err);
    return { ok: false, reason: "failed", next };
  }
}

async function recordVerifiedIdentity(
  userId: string,
  identity: { provider: string; ref: string; name: string | null; personnummer: string | null },
) {
  must(
    await api()
      .from("users")
      .update(
        toDb(users, {
          identityVerifiedAt: new Date(),
          identityProvider: identity.provider,
          identityRef: identity.ref,
          identityName: identity.name,
          personnummerEncrypted: identity.personnummer ? encryptField(identity.personnummer) : null,
        }),
      )
      .eq(U.id, userId),
    "recordVerifiedIdentity",
  );

  // A household account is verified by its owner's identity, the first time. One that
  // Parklet has rejected (or whose approval was removed) isn't approved by a new BankID:
  // that sends it back to Parklet's review instead.
  const households = must<{ account: Pick<HostAccount, "id" | "name" | "verificationStatus"> }[]>(
    await api()
      .from("host_account_members")
      .select(embed("account", hostAccounts, ["id", "name", "verificationStatus"], { inner: true }))
      .eq(M.userId, userId)
      .eq(M.role, "owner")
      .eq(`account.${A.kind}`, "household"),
    "recordVerifiedIdentity",
  );
  const fresh = households.filter((h) => h.account.verificationStatus === "unverified").map((h) => h.account.id);
  const rejected = households.filter((h) => h.account.verificationStatus === "rejected").map((h) => h.account);
  if (fresh.length) {
    must(
      await api()
        .from("host_accounts")
        .update(toDb(hostAccounts, { verificationStatus: "verified", reviewedAt: new Date() }))
        .in(A.id, fresh)
        .eq(A.verificationStatus, "unverified"),
      "recordVerifiedIdentity",
    );
  }
  for (const account of rejected) {
    const resubmitted = must(
      await api()
        .from("host_accounts")
        .update(toDb(hostAccounts, { verificationStatus: "pending" }))
        .eq(A.id, account.id)
        .eq(A.verificationStatus, "rejected")
        .select(A.id),
      "recordVerifiedIdentity",
    );
    if (!resubmitted.length) continue;
    await notifyAdmins({
      kind: "admin_account_submitted",
      title: `Privat uthyrare att granska igen: ${account.name}`,
      body: `${account.name} har legitimerat sig med BankID igen efter att kontot inte godkändes.`,
      details: [["Konto", `${account.name} (privatperson)`]],
      href: `/admin/konton/${account.id}`,
      cta: "Granska kontot",
    });
  }
}

/** Development and demo only: verifies instantly without an e-ID. */
export async function verifyIdentityMock(userId: string) {
  if (identityMode() !== "mock") throw new Error("Mock identity verification is disabled");
  await recordVerifiedIdentity(userId, { provider: "mock-bankid", ref: `mock_${randomUUID()}`, name: null, personnummer: null });
}

export async function isIdentityVerified(userId: string): Promise<boolean> {
  const row = must<{ at: string | null } | null>(await api().from("users").select(`at:${U.identityVerifiedAt}`).eq(U.id, userId).maybeSingle(), "isIdentityVerified");
  return Boolean(row?.at);
}
