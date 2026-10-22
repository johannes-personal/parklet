import "server-only";
import { headers } from "next/headers";
import { appUrl } from "@/lib/app-url";

/**
 * Where to send someone back to after an outside page (Stripe's Checkout and
 * onboarding): the address they are on, not APP_URL. The session cookie belongs to
 * that host, so coming back to another alias of the same deployment (a preview, the
 * Vercel project domain) would ask them to log in again. Outside a request: APP_URL.
 */
export async function returnBase(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host && /^[a-z0-9.-]+(:\d{1,5})?$/i.test(host)) {
      const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
      const proto = h.get("x-forwarded-proto") === "http" || local ? "http" : "https";
      return `${proto}://${host}`;
    }
  } catch {
    // Not in a request (scripts, tests calling the server code directly).
  }
  return appUrl();
}
