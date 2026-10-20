import { expect, test } from "@playwright/test";
import { e2eDb, lastMailLink, login, logout, signIn } from "./helpers";

test("a forgotten password is reset by e-mail, once", async ({ page }) => {
  const email = `glomsk-${Date.now()}@example.com`;
  await page.goto("/registrera");
  await page.getByLabel("För- och efternamn").fill("Glömsk Person");
  await page.getByLabel("E-post").fill(email);
  await page.getByLabel("Lösenord", { exact: true }).fill("det gamla lösenordet");
  await page.getByRole("checkbox", { name: /godkänner/ }).check();
  await page.getByRole("button", { name: "Skapa konto" }).click();
  await expect(page).not.toHaveURL(/registrera/);
  await logout(page);

  await page.goto("/glomt-losenord");
  await page.getByLabel("E-post").fill(email);
  await page.getByRole("button", { name: "Skicka länk" }).click();
  await expect(page.getByText(/Om det finns ett konto med den adressen/)).toBeVisible();
  const link = lastMailLink("/aterstall-losenord/");

  await page.goto(link);
  await page.getByLabel("Nytt lösenord", { exact: true }).fill("ett helt nytt lösenord");
  await page.getByRole("button", { name: "Spara och logga in" }).click();
  await expect(page).toHaveURL(/\/$/);
  await logout(page);

  // The link works once; the old password no longer does, the new one does.
  await page.goto(link);
  await page.getByLabel("Nytt lösenord", { exact: true }).fill("ett tredje lösenord");
  await page.getByRole("button", { name: "Spara och logga in" }).click();
  await expect(page.getByText("Länken är ogiltig eller har gått ut. Begär en ny.")).toBeVisible();
  await page.goto("/logga-in");
  await page.getByLabel("E-post").fill(email);
  await page.getByLabel("Lösenord", { exact: true }).fill("det gamla lösenordet");
  await page.getByRole("button", { name: "Logga in" }).click();
  await expect(page.getByText("Fel e-postadress eller lösenord.")).toBeVisible();
  await login(page, email, "ett helt nytt lösenord");
});

test("a BankID answer only verifies the user who asked for it", async ({ browser }) => {
  const stamp = Date.now();
  const sql = e2eDb();
  for (const who of ["a", "b"]) {
    await sql`insert into users (email, name, password_hash) values (${`bankid-${who}-${stamp}@example.com`}, ${"Lisa Uthyrare"}, 'x')`;
  }
  const a = await (await browser.newContext()).newPage();
  const b = await (await browser.newContext()).newPage();
  await signIn(a, `bankid-a-${stamp}@example.com`);
  await signIn(b, `bankid-b-${stamp}@example.com`);

  // A goes through BankID; the answer (the fake IdP's redirect back to Parklet) is
  // caught instead of followed. Playwright can't intercept a redirect target itself.
  let callback = "";
  await a.route(/decision=approve/, async (route) => {
    const res = await route.fetch({ maxRedirects: 0 });
    callback = res.headers()["location"] ?? "";
    await route.abort();
  });
  await a.goto("/konto/verifiera?next=/uthyrare");
  await a.getByRole("button", { name: "Legitimera med BankID" }).click();
  await a.getByRole("button", { name: "Godkänn" }).click();
  await expect.poll(() => callback).toContain("state=");
  await a.unroute(/decision=approve/);

  // B replays A's answer: refused, and B stays unverified.
  await b.goto(callback);
  await expect(b.getByText("Legitimeringen tog för lång tid. Försök igen.")).toBeVisible();
  // A completes it; replaying it afterwards is refused too.
  await a.goto(callback);
  await expect(a).toHaveURL(/\/uthyrare/);
  // Replaying it afterwards changes nothing: the request was used up (A, already verified,
  // is just sent on).
  await a.goto(callback);
  await expect(a).not.toHaveURL(/callback/);

  const [{ open }] = await sql`select count(*)::int as open from identity_requests r join users u on u.id = r.user_id where u.email like ${`bankid-%-${stamp}@example.com`}`;
  expect(open).toBe(0);
  const rows = await sql`select email, identity_verified_at is not null as verified from users where email like ${`bankid-%-${stamp}@example.com`} order by email`;
  await sql.end();
  expect(rows).toEqual([
    { email: `bankid-a-${stamp}@example.com`, verified: true },
    { email: `bankid-b-${stamp}@example.com`, verified: false },
  ]);
});
