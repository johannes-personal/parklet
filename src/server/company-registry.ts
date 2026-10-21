import "server-only";
import { randomUUID } from "node:crypto";
import { parseOrganisationResponse, type RegistryLookup } from "@/lib/bolagsverket";

/**
 * Bolagsverket's free API for high-value datasets: confirms that an
 * organisationsnummer exists, its registered name and legal form, and whether
 * it is deregistered or being wound up. Free; needs only a registration with
 * Bolagsverket for client credentials (OAuth2 client credentials flow).
 *
 * BOLAGSVERKET_CLIENT_ID / BOLAGSVERKET_CLIENT_SECRET, and BOLAGSVERKET_ENV=test
 * for Bolagsverket's test environment. Without credentials the check is
 * skipped and organisations are reviewed manually as before.
 */

const URLS = {
  prod: { token: "https://portal.api.bolagsverket.se/oauth2/token", base: "https://gw.api.bolagsverket.se/vardefulla-datamangder/v1" },
  test: { token: "https://portal-accept2.api.bolagsverket.se/oauth2/token", base: "https://gw-accept2.api.bolagsverket.se/vardefulla-datamangder/v1" },
};
const SCOPE = "vardefulla-datamangder:read vardefulla-datamangder:ping";
const TIMEOUT_MS = 8000;

export function registryConfigured(): boolean {
  return Boolean(process.env.BOLAGSVERKET_CLIENT_ID && process.env.BOLAGSVERKET_CLIENT_SECRET);
}

function urls() {
  const env = process.env.BOLAGSVERKET_ENV === "test" ? URLS.test : URLS.prod;
  return { token: process.env.BOLAGSVERKET_TOKEN_URL ?? env.token, base: process.env.BOLAGSVERKET_BASE_URL ?? env.base };
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value;
  const res = await fetch(urls().token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.BOLAGSVERKET_CLIENT_ID!,
      client_secret: process.env.BOLAGSVERKET_CLIENT_SECRET!,
      scope: SCOPE,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`token request failed: ${res.status}`);
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error("token response without access_token");
  cachedToken = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return cachedToken.value;
}

/** Look up an organisationsnummer (any format; validated by normalizeOrgNumber first). Never throws. */
export async function lookupOrganisation(orgNumber: string): Promise<RegistryLookup> {
  if (!registryConfigured()) return { result: "unavailable", reason: "not configured" };
  try {
    const res = await fetch(`${urls().base}/organisationer`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Request-Id": randomUUID(),
      },
      body: JSON.stringify({ identitetsbeteckning: orgNumber.replace(/\D/g, "") }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 404) return { result: "not_found" };
    if (res.status === 401) cachedToken = null;
    if (!res.ok) {
      // Public register data only; logged so an answer we don't understand can be fixed.
      console.warn("company registry: lookup answered", res.status, (await res.text()).slice(0, 500));
      return { result: "unavailable", reason: `HTTP ${res.status}` };
    }
    const body: unknown = await res.json();
    const lookup = parseOrganisationResponse(body);
    if (lookup.result === "unavailable") console.warn("company registry: unexpected answer", lookup.reason, JSON.stringify(body).slice(0, 500));
    return lookup;
  } catch (err) {
    console.error("company registry: lookup failed", err instanceof Error ? err.message : err);
    return { result: "unavailable", reason: "request failed" };
  }
}
