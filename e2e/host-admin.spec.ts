import { expect, test } from "@playwright/test";
import { e2eDb, openResults, signIn } from "./helpers";

async function accountId(name: string) {
  const sql = e2eDb();
  try {
    const [row] = await sql`select id from host_accounts where name = ${name} and deleted_at is null`;
    return row.id as string;
  } finally {
    await sql.end();
  }
}

test("a host's pages work like the admin's: tabs, searchable lists, e-mail and administrators", async ({ page }) => {
  const office = await accountId("Kvarteret Fastigheter AB");
  await signIn(page, "erik@parklet.test");
  await page.goto(`/uthyrare/${office}`);
  const tabs = page.getByRole("navigation", { name: "Uthyrarkonto" });
  await expect(tabs.getByRole("link", { name: "Översikt" })).toHaveAttribute("aria-current", "page");

  // Parkeringsplatser: all of them, then searched.
  await tabs.getByRole("link", { name: "Parkeringsplatser" }).click();
  await expect(page.getByRole("heading", { name: "Parkeringsplatser", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Kontorsparkering Gullbergsvass/ })).toHaveCount(4);
  await page.getByRole("searchbox").fill("Kungsholmen");
  await page.getByRole("button", { name: "Sök" }).click();
  await expect(page.getByRole("link", { name: /^Kontorsgarage Kungsholmen/ })).toHaveCount(2);
  await expect(page.getByRole("link", { name: /^Kontorsparkering Gullbergsvass/ })).toHaveCount(0);

  // Bokningar and E-post open, and only show the account's own.
  await tabs.getByRole("link", { name: "Bokningar" }).click();
  await expect(page.getByRole("heading", { name: "Bokningar", level: 1 })).toBeVisible();
  await tabs.getByRole("link", { name: "E-post" }).click();
  await expect(page.getByRole("heading", { name: "E-post", level: 1 })).toBeVisible();

  // Administratörer: invite, correct the address, take it back.
  await tabs.getByRole("link", { name: "Administratörer" }).click();
  await expect(page.getByRole("cell", { name: /Erik Berg \(du\)/ })).toBeVisible();
  await page.getByPlaceholder("namn@exempel.se").fill("fel.adress@example.com");
  await page.getByRole("button", { name: "Bjud in" }).click();
  await expect(page.getByText("Inbjudan skickad till fel.adress@example.com")).toBeVisible();
  const invitation = page.getByRole("listitem").filter({ hasText: "fel.adress@example.com" });
  // Retried: a click before the page has hydrated does nothing.
  await expect(async () => {
    await invitation.getByRole("button", { name: "Ändra e-post" }).click();
    await expect(invitation.getByRole("textbox", { name: "Ny e-postadress" })).toBeVisible({ timeout: 1000 });
  }).toPass();
  await invitation.getByRole("textbox", { name: "Ny e-postadress" }).fill("ratt.adress@example.com");
  await invitation.getByRole("button", { name: "Skicka till den här adressen" }).click();
  const fixed = page.getByRole("listitem").filter({ hasText: "ratt.adress@example.com" });
  await expect(fixed).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "fel.adress@example.com" })).toHaveCount(0);
  await fixed.getByRole("button", { name: "Ta tillbaka" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "ratt.adress@example.com" })).toHaveCount(0);

  // The invitations went out, and show in the account's e-mail.
  await tabs.getByRole("link", { name: "E-post" }).click();
  await expect(page.getByRole("row").filter({ hasText: "ratt.adress@example.com" })).toBeVisible();
});

test("a BRF keeps a list of registered cars per parking space", async ({ page }) => {
  const sql = e2eDb();
  const [spot] = await sql`select id, host_account_id from spots where title = 'Garage Linnégatan – Plats 3'`;
  await sql.end();
  await signIn(page, "styrelsen@parklet.test");
  await page.goto(`/uthyrare/${spot.host_account_id}/platser/${spot.id}`);
  const cars = page.getByRole("region", { name: "Registrerade bilar" });
  await cars.getByPlaceholder(/Registreringsnummer/).fill("reg 777");
  await cars.getByRole("button", { name: "Lägg till bil" }).click();
  await expect(cars.getByText("REG777 är registrerad för platsen.")).toBeVisible();
  await expect(cars.getByRole("listitem").filter({ hasText: "REG777" })).toBeVisible();
  await cars.getByRole("button", { name: "Ta bort REG777" }).click();
  await expect(cars.getByRole("listitem").filter({ hasText: "REG777" })).toHaveCount(0);
});

test("an owner deletes a parking space and an organisation stuck in verification", async ({ page }) => {
  const sql = e2eDb();
  const [owner] = await sql`select id from users where email = 'anna@parklet.test'`;
  const [org] = await sql`
    insert into host_accounts (kind, name, org_number, signatory_role, verification_status, payout_status)
    values ('association', ${`Brf Fastnad ${Date.now()}`}, '769600-1234', 'Ordförande', 'pending', 'not_connected') returning id, name`;
  await sql`insert into host_account_members (host_account_id, user_id, role) values (${org.id}, ${owner.id}, 'owner')`;
  const [draft] = await sql`
    insert into spots (host_account_id, created_by, title, address, city, lat, lng, spot_type, price_per_hour_ore, right_basis)
    values (${org.id}, ${owner.id}, 'Utkast att ta bort', 'Testgatan 1', 'Göteborg', 57.7, 11.97, 'outdoor', 2000, 'owns') returning id`;
  await sql.end();

  await signIn(page, "anna@parklet.test");
  await page.goto(`/uthyrare/${org.id}/platser/${draft.id}`);
  await page.locator("summary", { hasText: "Ta bort parkeringsplatsen" }).click();
  await page.getByRole("button", { name: "Ta bort parkeringsplatsen" }).click();
  await expect(page.getByText("Bekräfta att du vill ta bort parkeringsplatsen.")).toBeVisible();
  await page.getByRole("checkbox", { name: /tas bort och inte går att återställa/ }).check();
  await page.getByRole("button", { name: "Ta bort parkeringsplatsen" }).click();
  await expect(page.getByText("Parkeringsplatsen är borttagen.")).toBeVisible();
  await expect(page.getByText("Inga parkeringsplatser ännu.")).toBeVisible();

  await page.goto(`/uthyrare/${org.id}`);
  await page.locator("summary", { hasText: "Ta bort uthyrarkontot" }).click();
  await page.getByRole("checkbox", { name: /uthyrarkontot tas bort/ }).check();
  await page.getByRole("button", { name: "Ta bort uthyrarkontot" }).click();
  await expect(page).toHaveURL(/\/mina-sidor\?uthyrarkonto=borttaget/);
  await expect(page.getByText("Uthyrarkontot är borttaget.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Ditt konto" }).getByRole("link", { name: org.name })).toHaveCount(0);
});

test("search results can be filtered on their tags", async ({ page }) => {
  await page.goto("/sok?q=G%C3%B6teborg&lat=57.7089&lng=11.9746");
  await openResults(page);
  const filters = page.getByRole("navigation", { name: "Filter" });
  await filters.getByRole("link", { name: "Garage" }).click();
  await expect(page).toHaveURL(/typ=garage/);
  const results = page.getByTestId("search-result");
  await expect(results.first()).toBeVisible();
  for (const r of await results.all()) await expect(r).toContainText("Garage");
  await filters.getByRole("link", { name: "Elbilsladdning" }).click();
  await expect(page).toHaveURL(/el=1/);
  for (const r of await results.all()) await expect(r).toContainText("Elbilsladdning");
  await filters.getByRole("link", { name: "Rensa filter" }).click();
  await expect(page).not.toHaveURL(/typ=|el=/);
});
