import { expect, test } from "@playwright/test";
import { localAt, login } from "./helpers";

test("driver books, pays, sees instructions and cancels", async ({ page }) => {
  const from = localAt(3, 10);
  const to = localAt(3, 13);
  await page.goto(`/sok?q=G%C3%B6teborg&lat=57.7089&lng=11.9746&from=${from}&to=${to}`);
  await page.getByText("Carport nära Liseberg").click();
  await expect(page.getByRole("heading", { name: "Carport nära Liseberg" })).toBeVisible();
  // 3 h × 30 kr = 90 kr, plus a 10 % service fee of 9 kr.
  await expect(page.getByTestId("price-total")).toHaveText(/99/);

  await page.getByRole("button", { name: "Logga in och boka" }).click();
  await expect(page).toHaveURL(/logga-in/);
  await page.getByLabel("E-post").fill("forare@parklet.test");
  await page.getByLabel("Lösenord", { exact: true }).fill("parklet-demo-1");
  await page.getByRole("button", { name: "Logga in" }).click();

  // Back on the spot with the times kept.
  const form = page.getByRole("form", { name: "Boka platsen" });
  await expect(form.getByLabel("Från")).toHaveValue(from);
  await form.getByRole("button", { name: "Fortsätt till betalning" }).click();
  await expect(page.getByRole("heading", { name: "Betala bokningen" })).toBeVisible();
  await page.getByRole("button", { name: /Betala .* \(testläge\)/ }).click();

  await expect(page.getByText("Din parkering är bokad och betald")).toBeVisible();
  await expect(page.getByText("Platsen är märkt med en P-skylt.")).toBeVisible();

  await page.goto("/mina-bokningar");
  await page.getByText("Carport nära Liseberg").first().click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Avboka" }).click();
  await expect(page.getByText("Bokningen är avbokad")).toBeVisible();
});

test("a slot cannot be booked twice", async ({ browser }, testInfo) => {
  // A retry uses another day, in case the failed attempt left a hold on the slot.
  const from = localAt(4 + testInfo.retry, 9);
  const to = localAt(4 + testInfo.retry, 11);
  const url = `/sok?q=Malm%C3%B6&lat=55.605&lng=13.0038&from=${from}&to=${to}`;

  const a = await (await browser.newContext()).newPage();
  await login(a, "forare@parklet.test");
  await a.goto(url);
  await a.getByText("Uppfart Västra Hamnen").click();
  // The result card has the same heading, so wait for the spot page itself.
  await expect(a).toHaveURL(/\/plats\//);
  await expect(a.getByRole("heading", { level: 1, name: "Uppfart Västra Hamnen" })).toBeVisible();
  const spotUrl = new URL(a.url()).pathname + new URL(a.url()).search;
  await a.getByRole("button", { name: "Fortsätt till betalning" }).click();
  await expect(a.getByRole("heading", { name: "Betala bokningen" })).toBeVisible();

  // A second driver tries the same slot while the first one is still paying.
  const b = await (await browser.newContext()).newPage();
  await login(b, "anna@parklet.test");
  await b.goto(url);
  // Wait for results to render before asserting the spot is missing (Malmö has only this spot).
  await expect(b.getByRole("heading", { name: "Inga lediga platser hittades" })).toBeVisible();
  await b.goto(spotUrl);
  // Server-rendered list of busy times, then the client-side price preview.
  await expect(b.getByRole("heading", { name: "Redan bokad" })).toBeVisible();
  await expect(b.getByText("Platsen är redan bokad under en del av tiden.")).toBeVisible({ timeout: 15_000 });
  await b.getByPlaceholder(/Registreringsnummer/).fill("XYZ987");
  await b.getByRole("button", { name: "Fortsätt till betalning" }).click();
  await expect(b.getByText(/någon annan har redan bokat/).first()).toBeVisible();

  // Clean up so the slot is free again (keeps retries and repeated runs independent).
  await a.getByRole("button", { name: /Betala .* \(testläge\)/ }).click();
  await expect(a.getByText("Din parkering är bokad och betald")).toBeVisible();
  a.once("dialog", (d) => d.accept());
  await a.getByRole("button", { name: "Avboka" }).click();
  await expect(a.getByText("Bokningen är avbokad")).toBeVisible();
});
