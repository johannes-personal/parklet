import { expect, test, type Page } from "@playwright/test";
import { e2eDb, fakeStripe, localAt, payOnStripe, pickRange, signIn, stripeState } from "./helpers";

/**
 * Payments and payouts through Stripe (e2e/fake-stripe.mjs stands in for it, and
 * delivers its webhooks signed, as Stripe does). The paying flows themselves are
 * in driver.spec.ts and host.spec.ts; this covers what happens around them.
 */

const SPOT = "Plats vid Uppsala C";

/** Holds a slot on the Uppsala spot and goes on to Stripe's Checkout. Returns the booking's id. */
async function toCheckout(page: Page, day: number) {
  const sql = e2eDb();
  const [spot] = await sql`select id from spots where title = ${SPOT}`;
  await sql.end();
  await signIn(page, "forare@parklet.test");
  await page.goto(`/plats/${spot.id}`);
  const form = page.getByRole("form", { name: "Boka platsen" });
  await pickRange(form, localAt(day, 9), localAt(day, 11));
  await form.getByRole("button", { name: "Fortsätt till betalning" }).click();
  await expect(page.getByRole("heading", { name: "Betala bokningen" })).toBeVisible();
  const bookingId = new URL(page.url()).pathname.split("/").pop()!;
  await page.getByRole("button", { name: /Betala .* \(testläge\)/ }).click();
  await expect(page.getByRole("heading", { name: "Fake Stripe Checkout" })).toBeVisible();
  return bookingId;
}

async function booking(id: string) {
  const sql = e2eDb();
  const [row] = await sql`select status, payment_status, checkout_session_id, hold_expires_at from bookings where id = ${id}`;
  await sql.end();
  return row;
}

/** Cleans up a paid test booking so reruns find the slot free. */
async function cancel(page: Page) {
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Avboka" }).click();
  await expect(page.getByText("Bokningen är avbokad")).toBeVisible();
}

test("leaving Stripe's page keeps the slot until the session expires, then releases it", async ({ page }, testInfo) => {
  const id = await toCheckout(page, 11 + testInfo.retry);
  const held = await booking(id);
  // The hold now lasts as long as Stripe's session: 31 minutes, not the 15 on the summary page.
  expect(held.hold_expires_at.getTime() - Date.now()).toBeGreaterThan(29 * 60_000);

  await page.getByRole("link", { name: "Tillbaka" }).click();
  await expect(page.getByText("Betalningen avbröts. Ingen betalning har dragits, och platsen är fortfarande reserverad åt dig.")).toBeVisible();
  // Going on again reuses the same session.
  await page.getByRole("button", { name: /Betala .* \(testläge\)/ }).click();
  await expect(page.getByRole("heading", { name: "Fake Stripe Checkout" })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(`/checkout/${held.checkout_session_id}`);

  // Stripe expires the session and tells the app: the slot is free again.
  await fakeStripe(`sessions/${held.checkout_session_id}/expire`);
  await expect.poll(async () => (await booking(id)).status).toBe("expired");
  await page.goto(`/betala/${id}`);
  await expect(page.getByText("Reservationen har gått ut. Ingen betalning har dragits.")).toBeVisible();
});

test("a declined card stays on Stripe's page, and the booking is confirmed on return even without the webhook", async ({ page }, testInfo) => {
  const id = await toCheckout(page, 13 + testInfo.retry);
  await page.getByRole("button", { name: "Betala med nekat kort" }).click();
  await expect(page.getByRole("alert")).toHaveText("Kortet nekades. Försök med ett annat kort.");
  expect(await booking(id)).toMatchObject({ status: "pending_payment", payment_status: "unpaid" });

  await fakeStripe("config", { webhooks: false });
  try {
    await payOnStripe(page);
    await expect(page.getByText("Din parkering är bokad och betald")).toBeVisible();
    expect(await booking(id)).toMatchObject({ status: "confirmed", payment_status: "paid" });
  } finally {
    await fakeStripe("config", { webhooks: true });
  }
  // Stripe delivers the webhook later: still one booking, one confirmation.
  const sessionId = (await booking(id)).checkout_session_id;
  const completed = (await stripeState()).events.findLast(
    (e: { type: string; data: { object: { id: string } } }) => e.type === "checkout.session.completed" && e.data.object.id === sessionId,
  );
  expect(await fakeStripe(`events/${completed.id}/deliver`)).toMatchObject({ status: 200 });
  const sql = e2eDb();
  const [{ n }] = await sql`select count(*)::int as n from notifications where kind = 'booking_confirmed' and href = ${`/bokning/${id}`}`;
  await sql.end();
  expect(n).toBe(1);
  expect(await booking(id)).toMatchObject({ status: "confirmed", payment_status: "paid" });
  await cancel(page);
});

test("a host's payouts wait for Stripe's verification, which the webhook reports", async ({ page }) => {
  const stamp = Date.now();
  const sql = e2eDb();
  const [user] = await sql`
    insert into users (email, name, password_hash, identity_verified_at, identity_provider, identity_name)
    select ${`utbetalning-${stamp}@example.com`}, 'Maja Värd', password_hash, now(), 'mock-bankid', 'Maja Värd' from users where email = 'anna@parklet.test' returning id`;
  const [account] = await sql`insert into host_accounts (kind, name, verification_status) values ('household', 'Maja Värd', 'verified') returning id`;
  await sql`insert into host_account_members (host_account_id, user_id, role) values (${account.id}, ${user.id}, 'owner')`;
  await sql.end();
  const step = (done: boolean) => page.getByText(`Koppla konto för utbetalningar (${done ? "klart" : "ej klart"})`, { exact: true });

  await signIn(page, `utbetalning-${stamp}@example.com`);
  await page.goto(`/uthyrare/${account.id}`);
  await page.getByRole("button", { name: "Koppla utbetalningskonto" }).click();
  await expect(page.getByRole("heading", { name: "Fake Stripe Connect" })).toBeVisible();
  const link = page.url();
  // Leaving half-way: the dashboard says so and offers to continue.
  await page.getByRole("button", { name: "Avbryt registreringen" }).click();
  await expect(page.getByText("Registreringen hos Stripe är inte klar. Fortsätt där du slutade när du vill.")).toBeVisible();
  await expect(step(false)).toBeVisible();

  // An onboarding link works once; Stripe sends a used one to the refresh URL, which makes a new one.
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Fake Stripe Connect" })).toBeVisible();
  expect(page.url()).not.toBe(link);
  await page.goto(`/uthyrare/${account.id}`);
  await page.getByRole("button", { name: "Fortsätt hos Stripe" }).click();
  await page.getByRole("button", { name: "Skicka in, granskas" }).click();
  await expect(page.getByText(/^Tack! Stripe kontrollerar uppgifterna/)).toBeVisible();
  await expect(step(false)).toBeVisible();

  // Stripe finishes verifying later and sends account.updated.
  const db = e2eDb();
  const [{ ref }] = await db`select payout_account_ref as ref, payout_status from host_accounts where id = ${account.id}`;
  expect((await stripeState()).accounts[ref]).toMatchObject({ business_type: "individual", individual: { first_name: "Maja", last_name: "Värd" } });
  await fakeStripe(`accounts/${ref}/active`);
  await expect.poll(async () => (await db`select payout_status from host_accounts where id = ${account.id}`)[0].payout_status).toBe("active");
  await db.end();
  await page.reload();
  await expect(step(true)).toBeVisible();
  await page.getByRole("button", { name: /^Notiser/ }).click();
  await expect(page.getByRole("link", { name: /Utbetalningskontot är kopplat/ })).toBeVisible();
  await page.keyboard.press("Escape");

  // The owner reaches their Stripe Express dashboard from here.
  await page.getByRole("button", { name: "Öppna Stripe" }).click();
  await expect(page.getByRole("heading", { name: "Fake Stripe Express" })).toBeVisible();
});
