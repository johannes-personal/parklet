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

test("a household that loses its approval starts over, and its spots can't be booked until approved again", async ({ page }) => {
  // A fresh, fully set-up household with one approved spot (a copy of a seeded one).
  const stamp = Date.now();
  const email = `hushall-${stamp}@example.com`;
  const title = `Hushållsplats ${stamp}`;
  const sql = e2eDb();
  const [user] = await sql`
    insert into users (email, name, password_hash, identity_verified_at, identity_provider)
    select ${email}, 'Lisa Lindgren', password_hash, now(), 'mock-bankid' from users where email = 'anna@parklet.test' returning id`;
  const [account] = await sql`
    insert into host_accounts (kind, name, verification_status, payout_status, payout_account_ref)
    values ('household', 'Lisa Lindgren', 'verified', 'active', 'acct_e2e') returning id`;
  await sql`insert into host_account_members (host_account_id, user_id, role) values (${account.id}, ${user.id}, 'owner')`;
  await sql`create temp table copy as select * from spots where title = 'Carport nära Liseberg'`;
  const [original] = await sql`select id from copy`;
  const [spot] = await sql`update copy set id = gen_random_uuid(), host_account_id = ${account.id}, title = ${title} returning id`;
  await sql`insert into spots select * from copy`;
  await sql`
    insert into availability_windows (spot_id, weekday, start_minute, end_minute)
    select ${spot.id}, weekday, start_minute, end_minute from availability_windows where spot_id = ${original.id}`;
  await sql.end();

  const step = (name: string, done: boolean) => page.getByText(`${name} (${done ? "klart" : "ej klart"})`, { exact: true });
  const setup = page.getByRole("heading", { name: "Innan du kan ta emot bokningar" });
  const bookable = async (yes: boolean) => {
    await logout(page);
    await page.goto(`/plats/${spot.id}`);
    if (yes) await expect(page.getByRole("form", { name: "Boka platsen" })).toBeVisible();
    else await expect(page.getByRole("heading", { name: "Platsen kan inte bokas just nu" })).toBeVisible();
  };
  const decide = async (path: string, button: string, note?: string) => {
    await logout(page);
    await signIn(page, "admin@parklet.test");
    await page.goto(path);
    const decision = page.locator("form").filter({ has: page.getByRole("heading", { name: "Beslut" }) });
    if (note) await page.getByLabel(/Motivering till uthyraren/).fill(note);
    await decision.getByRole("button", { name: button }).click();
    await expect(page).not.toHaveURL(/fel=/);
  };
  const asHost = async () => {
    await logout(page);
    await signIn(page, email);
    await page.goto("/uthyrare");
  };

  await bookable(true);
  await asHost();
  await expect(page.getByRole("heading", { name: "Lisa Lindgren" })).toBeVisible();
  await expect(setup).toHaveCount(0);

  // The spot loses its approval: the spot step is open again, and the spot can't be booked.
  await decide(`/admin/platser/${spot.id}`, "Ta bort godkännandet", "Föreningen har dragit tillbaka godkännandet.");
  await bookable(false);
  await asHost();
  await expect(setup).toBeVisible();
  await expect(step("Legitimera dig med BankID", true)).toBeVisible();
  await expect(step("Koppla konto för utbetalningar", true)).toBeVisible();
  await expect(step("Lägg upp en plats med underlag och få den godkänd", false)).toBeVisible();
  await expect(page.getByText("Ej godkänd", { exact: true })).toBeVisible();
  await decide(`/admin/platser/${spot.id}`, "Godkänn");
  await bookable(true);

  // The account loses its approval: BankID and the spot have to be done again.
  await decide(`/admin/konton/${account.id}`, "Ta bort godkännandet", "Kontot tillhör någon annan.");
  await bookable(false);
  await page.goto("/sok?q=G%C3%B6teborg&lat=57.7089&lng=11.9746");
  await expect(page.getByTestId("search-result").first()).toBeAttached();
  await expect(page.getByText(title)).toHaveCount(0);

  await asHost();
  await expect(setup).toBeVisible();
  await expect(step("Legitimera dig med BankID", false)).toBeVisible();
  await expect(step("Parklet godkänner kontot", false)).toBeVisible();
  await expect(page.getByText("Ej godkänt: Kontot tillhör någon annan.")).toBeVisible();
  await expect(step("Lägg upp en plats med underlag och få den godkänd", false)).toBeVisible();
  await page.getByRole("button", { name: /^Notiser/ }).click();
  await expect(page.getByRole("link", { name: /Godkännandet av ditt uthyrarkonto har tagits bort/ })).toBeVisible();
  await page.keyboard.press("Escape");

  // BankID again sends the account back to Parklet's review; it doesn't approve it.
  await page.getByRole("link", { name: "Legitimera dig igen" }).click();
  await expect(page.getByText(/Ditt uthyrarkonto är inte godkänt längre/)).toBeVisible();
  await page.getByRole("button", { name: "Legitimera med BankID" }).click();
  await page.getByRole("button", { name: "Godkänn" }).click();
  await expect(page.getByText("Kontot granskas av Parklet, oftast inom en arbetsdag.")).toBeVisible();
  await expect(step("Legitimera dig med BankID", true)).toBeVisible();
  await bookable(false);

  // The admin hears about it and approves the account; the spot is reviewed on its own.
  await logout(page);
  await signIn(page, "admin@parklet.test");
  await page.goto("/");
  await page.getByRole("button", { name: /^Notiser/ }).click();
  await expect(page.getByRole("link", { name: /Privat uthyrare att granska igen: Lisa Lindgren/ })).toBeVisible();
  await decide(`/admin/konton/${account.id}`, "Godkänn");
  await bookable(false);
  await asHost();
  await expect(step("Lägg upp en plats med underlag och få den godkänd", false)).toBeVisible();
  await decide(`/admin/platser/${spot.id}`, "Godkänn");
  await bookable(true);
  await asHost();
  await expect(setup).toHaveCount(0);
});
