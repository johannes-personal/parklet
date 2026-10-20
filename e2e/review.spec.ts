import { expect, test } from "@playwright/test";
import { e2eDb, logout, signIn } from "./helpers";

test("a spot under review is locked, can be taken back, and the admin's decisions follow its state", async ({ page }) => {
  const sql = e2eDb();
  const [spot] = await sql`select id, host_account_id from spots where title = 'BRF-plats i Haga'`;
  await sql.end();
  const hostPage = `/uthyrare/${spot.host_account_id}/platser/${spot.id}`;
  const steps = page.getByRole("list", { name: "Steg" });

  // Under review: documents are locked, with a way to take the spot back.
  await signIn(page, "anna@parklet.test");
  await page.goto(hostPage);
  await expect(page.getByText("Granskas av Parklet")).toBeVisible();
  await expect(page.getByText(/Underlagen är låsta medan Parklet granskar platsen/)).toBeVisible();
  await expect(page.getByLabel(/^Välj fil|^Lägg till fil/)).toHaveCount(0);
  await expect(steps.getByText("✓")).toHaveCount(2);
  await page.getByRole("button", { name: "Ta tillbaka från granskningen" }).click();
  await expect(page.getByText("Utkast – underlag saknas")).toBeVisible();
  await expect(page.getByLabel(/^Välj fil|^Lägg till fil/).first()).toBeVisible();
  await page.getByRole("button", { name: "Skicka in för granskning" }).click();
  await expect(page.getByText(/^Inskickad/)).toBeVisible();
  await logout(page);

  // The admin can approve or reject a submission; a rejection needs a reason.
  await signIn(page, "admin@parklet.test");
  await page.goto(`/admin/platser/${spot.id}`);
  const decision = page.locator("form").filter({ has: page.getByRole("heading", { name: "Beslut" }) });
  await expect(decision.getByRole("button")).toHaveText(["Godkänn", "Avslå / begär komplettering"]);
  await decision.getByRole("button", { name: "Avslå / begär komplettering" }).click();
  await expect(page.getByText("Skriv en motivering.")).toBeVisible();
  await page.getByLabel(/Motivering till uthyraren/).fill("Hyresavtalet saknar platsnummer.");
  await page.getByRole("button", { name: "Avslå / begär komplettering" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await logout(page);

  // The host sees why, and can change the documents again.
  await signIn(page, "anna@parklet.test");
  await page.goto(hostPage);
  await expect(page.getByText("Ej godkänd: Hyresavtalet saknar platsnummer.")).toBeVisible();
  await expect(page.getByText(/Underlagen är låsta/)).toHaveCount(0);
  await logout(page);

  // A rejected spot can only be approved; an approved one only have its approval removed.
  await signIn(page, "admin@parklet.test");
  await page.goto(`/admin/platser/${spot.id}`);
  await expect(decision.getByRole("button")).toHaveText(["Godkänn"]);
  await decision.getByRole("button", { name: "Godkänn" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/platser/${spot.id}$`));
  await expect(decision.getByText(/^Godkänd/)).toBeVisible();
  await expect(decision.getByRole("button")).toHaveText(["Ta bort godkännandet"]);
  await logout(page);

  // Approved: all three steps are checked off, and the documents stay locked.
  await signIn(page, "anna@parklet.test");
  await page.goto(hostPage);
  await expect(steps.getByText("✓")).toHaveCount(3);
  await expect(page.getByText(/Platsen är godkänd och underlagen är låsta/)).toBeVisible();
  await logout(page);

  // Removing the approval takes the spot out of search at once.
  await signIn(page, "admin@parklet.test");
  await page.goto(`/admin/platser/${spot.id}`);
  await page.getByLabel(/Motivering till uthyraren/).fill("Föreningen har dragit tillbaka sitt godkännande.");
  await decision.getByRole("button", { name: "Ta bort godkännandet" }).click();
  await expect(decision.getByRole("button")).toHaveText(["Godkänn"]);
  // As a visitor (admins can still preview it).
  await logout(page);
  await page.goto(`/plats/${spot.id}`);
  await expect(page.getByRole("heading", { name: "Platsen kan inte bokas just nu" })).toBeVisible();
});

test("an organisation's verification: approve, remove, approve again", async ({ page }) => {
  const sql = e2eDb();
  const [owner] = await sql`select id from users where email = 'styrelsen@parklet.test'`;
  const [account] = await sql`
    insert into host_accounts (kind, name, org_number, signatory_role, verification_status, payout_status)
    values ('association', ${`Brf Granskningen ${Date.now()}`}, '769600-1234', 'Ordförande', 'pending', 'not_connected') returning id, name`;
  await sql`insert into host_account_members (host_account_id, user_id, role) values (${account.id}, ${owner.id}, 'owner')`;
  await sql.end();

  await signIn(page, "admin@parklet.test");
  await page.goto(`/admin/konton?q=${encodeURIComponent(account.name)}`);
  // Statuses are shown in Swedish, never as "pending"/"verified".
  await expect(page.getByRole("row").filter({ hasText: account.name }).getByText("Granskas")).toBeVisible();
  await page.getByRole("link", { name: account.name }).click();
  await expect(page.getByText("pending", { exact: true })).toHaveCount(0);
  const decision = page.locator("form").filter({ has: page.getByRole("heading", { name: "Beslut" }) });
  await expect(decision.getByRole("button")).toHaveText(["Godkänn", "Avslå / begär komplettering"]);
  await decision.getByRole("button", { name: "Godkänn" }).click();
  await expect(page).toHaveURL(/\/admin$/);

  // Verified: no "Godkänn" or "Avslå" any more, only removing the verification.
  await page.goto(`/admin/konton/${account.id}`);
  await expect(page.getByText("Verifierad", { exact: true })).toBeVisible();
  await expect(decision.getByRole("button")).toHaveText(["Ta bort godkännandet"]);
  await decision.getByRole("button", { name: "Ta bort godkännandet" }).click();
  await expect(page.getByText("Skriv en motivering.")).toBeVisible();
  await page.getByLabel(/Motivering till uthyraren/).fill("Fel organisationsnummer.");
  await decision.getByRole("button", { name: "Ta bort godkännandet" }).click();
  await expect(decision.getByText("Ej godkänd (Fel organisationsnummer). Väntar på att uthyraren kompletterar.")).toBeVisible();
  await expect(decision.getByRole("button")).toHaveText(["Godkänn"]);
  await logout(page);

  // The board sees the reason in the bell.
  await signIn(page, "styrelsen@parklet.test");
  await page.goto("/");
  await page.getByRole("button", { name: /^Notiser/ }).click();
  await expect(page.getByRole("link", { name: /Verifieringen av er organisation har tagits bort/ })).toBeVisible();
});
