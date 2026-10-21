import { expect, test, type Locator, type Page } from "@playwright/test";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { DateTime } from "luxon";

export const PASSWORD = "parklet-demo-1";
export const E2E_DB = process.env.E2E_DATABASE_URL ?? "postgres://parklet:parklet@localhost:5432/parklet_e2e";

export async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto("/logga-in");
  await page.getByLabel("E-post").fill(email);
  await page.getByLabel("Lösenord", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Logga in" }).click();
  await expect(page).not.toHaveURL(/logga-in/);
}

/** The e2e database, for setting up and checking state. Close it with `.end()`. */
export const e2eDb = () => postgres(E2E_DB, { max: 1, onnotice: () => {} });

/**
 * Sign in without the login form: a session row and its cookie, as the app makes
 * them (src/lib/auth/session.ts). The form itself is tested by login() in a few
 * flows; everything else uses this, so many tests don't trip the login rate limit.
 */
export async function signIn(page: Page, email: string) {
  const sql = e2eDb();
  try {
    const [user] = await sql`select id from users where email = ${email}`;
    if (!user) throw new Error(`No user ${email}`);
    const token = randomBytes(32).toString("base64url");
    const hash = createHash("sha256").update(token).digest("hex");
    await sql`insert into sessions (id, user_id, expires_at) values (${hash}, ${user.id}, now() + interval '1 day')`;
    const base = new URL(test.info().project.use.baseURL ?? "http://localhost:3100");
    await page.context().addCookies([{ name: "parklet_session", value: token, domain: base.hostname, path: "/", httpOnly: true, sameSite: "Lax" }]);
  } finally {
    await sql.end();
  }
}

export async function logout(page: Page) {
  await page.context().clearCookies();
}

/** datetime-local value N days from now at the given hour, Stockholm time. */
export function localAt(daysFromNow: number, hour: number) {
  return DateTime.now().setZone("Europe/Stockholm").plus({ days: daysFromNow }).set({ hour, minute: 0, second: 0, millisecond: 0 }).toFormat("yyyy-MM-dd'T'HH:mm");
}

/** Last link in the dev outbox matching a path, e.g. "/godkannande/". */
export function lastMailLink(pathPart: string): string {
  const lines = readFileSync("storage/e2e-outbox.jsonl", "utf8").trim().split("\n").reverse();
  for (const line of lines) {
    const m = (JSON.parse(line).text as string).match(new RegExp(`https?://[^\\s]+${pathPart}[^\\s]+`));
    if (m) return new URL(m[0]).pathname;
  }
  throw new Error(`No mail containing ${pathPart}`);
}

/** Set a range in the TimeRangePicker. Values are datetime-local strings ("2026-10-16T08:00"). */
export async function pickRange(scope: Locator, from: string, to: string) {
  for (const [which, value] of [["Start", from], ["Slut", to]] as const) {
    const [date, time] = value.split("T");
    const [h, m] = time.split(":").map(Number);
    await scope.getByLabel(`${which}, dag`).selectOption(date);
    await scope.getByLabel(`${which}, timme`).selectOption(String(h));
    await scope.getByLabel(`${which}, minut`).selectOption(String(m));
  }
}

/** On phones the search results start as a collapsed sheet over the map. */
export async function openResults(page: Page) {
  const toggle = page.getByRole("button", { name: "Visa lista" });
  if (await toggle.isVisible()) await toggle.click();
}

/* ------------------------------------------------------------- Stripe (fake) */

/** e2e/fake-stripe.mjs, which the app's real Stripe code talks to. */
export const FAKE_STRIPE = "http://localhost:3104";

/** A test control of the fake (see /__ in e2e/fake-stripe.mjs), e.g. "sessions/<id>/expire". */
export async function fakeStripe(path: string, body: object = {}) {
  const res = await fetch(`${FAKE_STRIPE}/__/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`fake Stripe ${path}: ${res.status}`);
  return res.json();
}

/** Everything the fake has seen and made: accounts, sessions, payments, refunds, events. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Stripe objects, as the fake keeps them
export async function stripeState(): Promise<Record<string, any>> {
  return (await fetch(`${FAKE_STRIPE}/__/state`)).json();
}

/** On Stripe's (fake) hosted Checkout: pay with the test card. */
export async function payOnStripe(page: Page) {
  await expect(page.getByRole("heading", { name: "Fake Stripe Checkout" })).toBeVisible();
  await page.getByRole("button", { name: "Betala", exact: true }).click();
}
