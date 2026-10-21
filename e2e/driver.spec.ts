import { expect, test } from "@playwright/test";
import { e2eDb, localAt, login, openResults, payOnStripe, pickRange, signIn, stripeState } from "./helpers";

test("driver books, pays, sees instructions and cancels", async ({ page }, testInfo) => {
  // A retry uses another day: a failed attempt may have left a paid booking on the slot.
  const day = 3 + testInfo.retry * 7;
  const from = localAt(day, 10);
  const to = localAt(day, 13);
  await page.goto(`/sok?q=G%C3%B6teborg&lat=57.7089&lng=11.9746&from=${from}&to=${to}`);
  await openResults(page);
  await page.getByText("Carport nära Liseberg").click();
  // The spot opens in a panel over the map, without leaving the search.
  const panel = page.getByRole("complementary", { name: "Carport nära Liseberg" });
  await expect(panel.getByRole("heading", { name: "Carport nära Liseberg" })).toBeVisible();
  await expect(page).toHaveURL(/\/sok\?.*plats=/);
  // 3 h × 30 kr = 90 kr, plus a 10 % service fee of 9 kr.
  await expect(page.getByTestId("price-total")).toHaveText(/^99\s*kr$/);
  // Signed out: no car to choose yet, and the access instructions stay hidden until paid.
  await expect(panel.getByPlaceholder(/Registreringsnummer/)).toHaveCount(0);
  await expect(panel.getByText("Platsen är märkt med en P-skylt.")).toHaveCount(0);

  // The spot can be shared; the link keeps the times, also when changed in the panel.
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await panel.getByRole("button", { name: "Kopiera länk" }).click();
  await expect(panel.getByRole("button", { name: "Kopierad!" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(new RegExp(`/plats/[0-9a-f-]+\\?from=${encodeURIComponent(from)}`));
  const changed = localAt(day, 11);
  await pickRange(panel.getByRole("form", { name: "Boka platsen" }), changed, to);
  await panel.getByRole("button", { name: /Kopiera länk|Kopierad!/ }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain(`from=${encodeURIComponent(changed)}`);
  await pickRange(panel.getByRole("form", { name: "Boka platsen" }), from, to);

  await page.getByRole("button", { name: "Logga in och boka" }).click();
  await expect(page).toHaveURL(/logga-in/);
  await page.getByLabel("E-post").fill("forare@parklet.test");
  await page.getByLabel("Lösenord", { exact: true }).fill("parklet-demo-1");
  await page.getByRole("button", { name: "Logga in" }).click();

  // Back on the spot, still over the search map, with the times kept; now the car is asked for.
  await expect(page).toHaveURL(/\/sok\?.*plats=/);
  const form = page.getByRole("form", { name: "Boka platsen" });
  await expect(form.locator('input[name="from"]')).toHaveValue(from);
  await expect(form.getByRole("combobox", { name: "Välj bil" })).toBeVisible();
  await form.getByRole("button", { name: "Fortsätt till betalning" }).click();
  await expect(page.getByRole("heading", { name: "Betala bokningen" })).toBeVisible();
  await page.getByRole("button", { name: /Betala .* \(testläge\)/ }).click();
  // Stripe's hosted Checkout (the fake): the price in öre, the same 99 kr.
  await expect(page.getByTestId("checkout-total")).toHaveText("99.00 kr");
  await payOnStripe(page);

  await expect(page.getByText("Din parkering är bokad och betald")).toBeVisible();
  await expect(page.getByText("Platsen är märkt med en P-skylt.")).toBeVisible();
  const bookingId = new URL(page.url()).pathname.split("/").pop()!;

  await page.goto("/mina-bokningar");
  await page.getByText("Carport nära Liseberg").first().click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Avboka" }).click();
  await expect(page.getByText("Bokningen är avbokad")).toBeVisible();
  await expect(page.getByText(/99\s*kr återbetalas till ditt betalsätt/)).toBeVisible();
  const sql = e2eDb();
  const [row] = await sql`select status, payment_status, payment_ref from bookings where id = ${bookingId}`;
  await sql.end();
  expect(row).toMatchObject({ status: "cancelled", payment_status: "refunded" });

  // At Stripe: a destination charge to the host's account with Parklet's 9 kr as the
  // application fee, and the whole of it refunded, transfer and fee included.
  const stripe = await stripeState();
  expect(stripe.paymentIntents[row.payment_ref]).toMatchObject({ amount: 9900, currency: "sek", application_fee_amount: 900, transfer_data: { destination: "acct_mock_seed" } });
  expect(Object.values(stripe.refunds as Record<string, { payment_intent: string }>).filter((r) => r.payment_intent === row.payment_ref)).toMatchObject([
    { amount: 9900, _reverse_transfer: true, _refund_application_fee: true },
  ]);
});

test("a slot cannot be booked twice", async ({ browser }, testInfo) => {
  // A retry uses another day, in case the failed attempt left a hold on the slot.
  const from = localAt(4 + testInfo.retry, 9);
  const to = localAt(4 + testInfo.retry, 11);
  const url = `/sok?q=Malm%C3%B6&lat=55.605&lng=13.0038&from=${from}&to=${to}`;

  const a = await (await browser.newContext()).newPage();
  await signIn(a, "forare@parklet.test");
  await a.goto(url);
  await openResults(a);
  await a.getByText("Uppfart Västra Hamnen").click();
  await expect(a).toHaveURL(/plats=/);
  await expect(a.getByRole("complementary", { name: "Uppfart Västra Hamnen" })).toBeVisible();
  const spotUrl = new URL(a.url()).pathname + new URL(a.url()).search;
  await a.getByRole("button", { name: "Fortsätt till betalning" }).click();
  await expect(a.getByRole("heading", { name: "Betala bokningen" })).toBeVisible();

  // A second driver tries the same slot while the first one is still paying.
  const b = await (await browser.newContext()).newPage();
  await signIn(b, "anna@parklet.test");
  await b.goto(url);
  // Malmö's only spot is taken, so the search shows the closest free spots elsewhere instead.
  await expect(b.getByText("Inga lediga platser i närheten – visar de närmaste.")).toBeVisible();
  await expect(b.getByTestId("search-result").first()).toBeVisible();
  await expect(b.getByText("Uppfart Västra Hamnen")).toHaveCount(0);
  await b.goto(spotUrl);
  // Server-rendered list of busy times, then the client-side price preview.
  await expect(b.getByRole("heading", { name: "Redan bokad" })).toBeVisible();
  await expect(b.getByText("Platsen är redan bokad under en del av tiden.")).toBeVisible({ timeout: 15_000 });
  await b.getByPlaceholder(/Registreringsnummer/).fill("XYZ987");
  await b.getByRole("button", { name: "Fortsätt till betalning" }).click();
  await expect(b.getByText(/någon annan har redan bokat/).first()).toBeVisible();

  // Clean up so the slot is free again (keeps retries and repeated runs independent).
  await a.getByRole("button", { name: /Betala .* \(testläge\)/ }).click();
  await payOnStripe(a);
  await expect(a.getByText("Din parkering är bokad och betald")).toBeVisible();
  a.once("dialog", (d) => d.accept());
  await a.getByRole("button", { name: "Avboka" }).click();
  await expect(a.getByText("Bokningen är avbokad")).toBeVisible();
});

test("a town without spots still gets the closest ones", async ({ page }) => {
  await page.goto("/sok?q=Kiruna&lat=67.8557&lng=20.2253");
  await openResults(page);
  await expect(page.getByText("Inga platser i närheten – visar de närmaste.")).toBeVisible();
  await expect(page.getByTestId("search-result")).toHaveCount(10);
  // Uppsala is the nearest seeded town to Kiruna.
  await expect(page.getByTestId("search-result").first()).toContainText("Uppsala");
});

test("a driver adds and removes a car", async ({ page }) => {
  await signIn(page, "forare@parklet.test");
  await page.goto("/fordon");
  await page.getByLabel("Registreringsnummer").fill("tst 99a");
  await page.getByRole("button", { name: "Spara bil" }).click();
  await expect(page.getByText("TST99A är sparad.")).toBeVisible();
  const remove = page.getByRole("button", { name: "Ta bort TST99A" });
  await expect(remove).toBeVisible();
  await remove.click();
  await expect(remove).toHaveCount(0);
});

test("logging out from the menu ends the session", async ({ page }) => {
  await login(page, "anna@parklet.test");
  await page.getByRole("button", { name: "Meny" }).click();
  await page.getByRole("button", { name: "Logga ut" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/mina-bokningar");
  await expect(page).toHaveURL(/logga-in/);
});
