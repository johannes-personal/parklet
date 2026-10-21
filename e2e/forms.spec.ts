import { expect, test, type Locator } from "@playwright/test";
import { DateTime } from "luxon";
import { e2eDb, localAt, openResults, pickRange, signIn } from "./helpers";

/**
 * What the user entered stays put when a form comes back with an error: React resets
 * a form after its action runs, and the fields used to jump back to their defaults
 * (or, for controlled ones, show something other than what would be sent).
 */

async function spotId(title: string) {
  const sql = e2eDb();
  const [row] = await sql`select id, host_account_id from spots where title = ${title}`;
  await sql.end();
  return row as { id: string; host_account_id: string };
}

/** The picker's visible selects, read back as a datetime-local value. */
async function shown(form: Locator, which: "Start" | "Slut") {
  const date = await form.getByLabel(`${which}, dag`).inputValue();
  const h = await form.getByLabel(`${which}, timme`).inputValue();
  const m = await form.getByLabel(`${which}, minut`).inputValue();
  return `${date}T${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
}

test("a refused booking keeps the chosen times", async ({ page }) => {
  // Plats vid Järntorget is open weekdays 8–17; a Saturday isn't available.
  const spot = await spotId("Plats vid Järntorget");
  const saturday = DateTime.now().setZone("Europe/Stockholm").plus({ weeks: 1 }).set({ weekday: 6 });
  const from = saturday.set({ hour: 10, minute: 0 }).toFormat("yyyy-MM-dd'T'HH:mm");
  const to = saturday.set({ hour: 12, minute: 30 }).toFormat("yyyy-MM-dd'T'HH:mm");

  await signIn(page, "forare@parklet.test");
  await page.goto(`/plats/${spot.id}`);
  const form = page.getByRole("form", { name: "Boka platsen" });
  await pickRange(form, from, to);
  await expect(form.getByText("Platsen är inte tillgänglig hela den valda tiden.")).toBeVisible();
  await form.getByRole("button", { name: "Fortsätt till betalning" }).click();
  await expect(form.getByRole("alert")).toContainText("inte tillgänglig");

  const kept = async () => {
    expect(await shown(form, "Start")).toBe(from);
    expect(await shown(form, "Slut")).toBe(to);
    await expect(form.locator('input[name="from"]')).toHaveValue(from);
    await expect(form.locator('input[name="to"]')).toHaveValue(to);
  };
  await kept();
  // Again: a second submission used to start from the reset values.
  await form.getByRole("button", { name: "Fortsätt till betalning" }).click();
  await expect(form.getByRole("alert")).toContainText("inte tillgänglig");
  await kept();

  // A valid time then books from those same selects.
  const monday = saturday.plus({ days: 2 });
  await pickRange(form, monday.set({ hour: 9, minute: 0 }).toFormat("yyyy-MM-dd'T'HH:mm"), monday.set({ hour: 11, minute: 0 }).toFormat("yyyy-MM-dd'T'HH:mm"));
  await form.getByRole("button", { name: "Fortsätt till betalning" }).click();
  await expect(page.getByRole("heading", { name: "Betala bokningen" })).toBeVisible();
});

test("times that have passed are not used", async ({ page }) => {
  const spot = await spotId("Carport nära Liseberg");
  const from = localAt(-1, 10);
  const to = localAt(-1, 12);

  // Opened from an old link: the picker starts over instead of showing other times than it holds.
  await page.goto(`/plats/${spot.id}?from=${from}&to=${to}`);
  const form = page.getByRole("form", { name: "Boka platsen" });
  await expect(form.locator('input[name="from"]')).toHaveValue("");
  await expect(form.locator('input[name="to"]')).toHaveValue("");
  await expect(form.getByText("Välj tid för att se priset.")).toBeVisible();
  await expect(form.getByText(/inte tillgänglig/)).toHaveCount(0);

  // The search doesn't filter on them either: the spot is found, without a time.
  await page.goto(`/sok?q=G%C3%B6teborg&lat=57.7089&lng=11.9746&from=${from}&to=${to}`);
  await openResults(page);
  await page.getByTestId("search-result").filter({ hasText: "Carport nära Liseberg" }).click();
  const panel = page.getByRole("complementary", { name: "Carport nära Liseberg" });
  await expect(panel.locator('input[name="from"]')).toHaveValue("");
  await expect(panel.getByText(/inte tillgänglig/)).toHaveCount(0);
});

test("the spot form keeps every choice after an error and points to it", async ({ page }) => {
  const { host_account_id } = await spotId("Uppfart i Majorna");
  await signIn(page, "anna@parklet.test");
  await page.goto(`/uthyrare/${host_account_id}/platser/ny`);

  await page.getByLabel("Rubrik").fill("Plats som inte sparas");
  await page.getByRole("radio", { name: /Jag hyr platsen/ }).check();
  await page.getByRole("radio", { name: "Bostadsrättsföreningen" }).check();
  await page.getByLabel("Föreningens namn").fill("Brf Kvar");
  await page.getByRole("checkbox", { name: /Den tillfälliga hyresgästens bil måste registreras/ }).check();
  await page.getByLabel("Information till föraren (valfritt)").fill("Registreras i appen");
  await page.getByLabel("Pris per timme (kr)").fill("25");
  // No address and no pin: refused.
  await page.getByRole("button", { name: "Spara och fortsätt till underlag" }).click();

  // The error is shown where the user is: by the button, and the first bad field is focused.
  await expect(page.getByText(/fält behöver rättas, se markering/)).toBeVisible();
  await expect(page.locator('[aria-invalid="true"]').first()).toBeFocused();
  await expect(page.locator('[aria-invalid="true"]').first()).toBeInViewport();

  await expect(page.getByLabel("Rubrik")).toHaveValue("Plats som inte sparas");
  await expect(page.getByRole("radio", { name: /Jag hyr platsen/ })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Bostadsrättsföreningen" })).toBeChecked();
  await expect(page.getByLabel("Föreningens namn")).toHaveValue("Brf Kvar");
  await expect(page.getByRole("checkbox", { name: /Den tillfälliga hyresgästens bil måste registreras/ })).toBeChecked();
  await expect(page.getByLabel("Information till föraren (valfritt)")).toHaveValue("Registreras i appen");
  await expect(page.getByLabel("Pris per timme (kr)")).toHaveValue("25");

  // Choices made after the error are what is sent, not what the reset put back.
  await page.getByRole("radio", { name: "Hyresvärd eller företag" }).check();
  await page.getByRole("button", { name: "Spara och fortsätt till underlag" }).click();
  await expect(page.getByText(/fält behöver rättas/)).toBeVisible();
  await expect(page.getByRole("radio", { name: "Hyresvärd eller företag" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: /Den tillfälliga hyresgästens bil måste registreras/ })).toBeChecked();
});

test("the new host account form keeps the choices after an error", async ({ page }) => {
  await signIn(page, "anna@parklet.test");
  await page.goto("/uthyrare/nytt");
  await page.getByRole("radio", { name: /Bostadsrättsförening/ }).check();
  await page.getByText("Uppgifter om organisationen").click();
  await page.getByLabel("Organisationens namn").fill("Brf Kvarstår");
  await page.getByRole("checkbox", { name: /Jag intygar/ }).check();
  // No organisation number: refused.
  await page.getByRole("button", { name: "Skapa uthyrarkonto" }).click();
  await expect(page.locator(".field-error").first()).toBeVisible();
  await expect(page.getByRole("radio", { name: /Bostadsrättsförening/ })).toBeChecked();
  await expect(page.getByLabel("Organisationens namn")).toHaveValue("Brf Kvarstår");
  await expect(page.getByRole("checkbox", { name: /Jag intygar/ })).toBeChecked();
});

test("the register form keeps what was typed after an error", async ({ page }) => {
  await page.goto("/registrera");
  await page.getByLabel("För- och efternamn").fill("Kvar Kvarsson");
  await page.getByLabel("E-post").fill("anna@parklet.test");
  await page.getByLabel("Lösenord", { exact: true }).fill("ett riktigt bra lösenord");
  await page.getByRole("checkbox", { name: /godkänner/ }).check();
  await page.getByRole("button", { name: "Skapa konto" }).click();
  await expect(page.locator(".field-error, [role=alert]").first()).toBeVisible();
  await expect(page.getByLabel("För- och efternamn")).toHaveValue("Kvar Kvarsson");
  await expect(page.getByLabel("E-post")).toHaveValue("anna@parklet.test");
  await expect(page.getByRole("checkbox", { name: /godkänner/ })).toBeChecked();
});

test("a saved car clears the form; a refused one keeps it", async ({ page }) => {
  await signIn(page, "forare@parklet.test");
  await page.goto("/fordon");
  const reg = page.getByLabel("Registreringsnummer");
  await reg.fill("inte ett regnr!");
  await page.getByRole("button", { name: "Spara bil" }).click();
  await expect(page.locator(".field-error, [role=alert]").first()).toBeVisible();
  await expect(reg).toHaveValue("inte ett regnr!");
  await reg.fill("KVR 12A");
  await page.getByRole("button", { name: "Spara bil" }).click();
  await expect(page.getByText("KVR12A är sparad.")).toBeVisible();
  await expect(reg).toHaveValue("");
  await page.getByRole("button", { name: "Ta bort KVR12A" }).click();
  await expect(page.getByRole("button", { name: "Ta bort KVR12A" })).toHaveCount(0);
});
