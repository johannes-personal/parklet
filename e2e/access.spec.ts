import { expect, test, type Page } from "@playwright/test";
import { e2eDb, signIn } from "./helpers";

/** Ids from the seed (scripts/seed.mts). */
async function seedIds() {
  const sql = e2eDb();
  try {
    const [doc] = await sql`select d.id from documents d join spots s on s.id = d.spot_id where s.title = 'BRF-plats i Haga' limit 1`;
    const [pendingSpot] = await sql`select id from spots where title = 'BRF-plats i Haga'`;
    const [erikCompany] = await sql`select id from host_accounts where name = 'Kvarteret Fastigheter AB'`;
    const [erikSpot] = await sql`select id, host_account_id from spots where title = 'Garage på Södermalm'`;
    const [annaAccount] = await sql`select a.id from host_accounts a join host_account_members m on m.host_account_id = a.id join users u on u.id = m.user_id where u.email = 'anna@parklet.test' and a.kind = 'household'`;
    const [driverBooking] = await sql`select b.id from bookings b join users u on u.id = b.driver_id where u.email = 'forare@parklet.test' and b.status = 'confirmed' limit 1`;
    return { doc: doc.id, pendingSpot: pendingSpot.id, erikCompany: erikCompany.id, erikSpot, annaAccount: annaAccount.id, driverBooking: driverBooking.id };
  } finally {
    await sql.end();
  }
}

async function documentStatus(page: Page, id: string) {
  const res = await page.request.get(`/api/dokument/${id}`, { maxRedirects: 0 });
  return { status: res.status(), type: res.headers()["content-type"] };
}

test("the admin area is closed to everyone but admins", async ({ page }) => {
  const ids = await seedIds();
  const adminPages = ["/admin", "/admin/epost", "/admin/platser", "/admin/konton", `/admin/platser/${ids.pendingSpot}`, `/admin/konton/${ids.erikCompany}`];
  // Signed out: to the login page.
  for (const path of adminPages) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/logga-in/);
  }
  // A driver or host: away from the admin area. The outbox holds password-reset links.
  await signIn(page, "forare@parklet.test");
  for (const path of adminPages) {
    await page.goto(path);
    await expect(page, path).not.toHaveURL(/\/admin/);
  }
});

test("verification documents are served to the account's members and admins only", async ({ browser }) => {
  const { doc } = await seedIds();
  const as = async (email: string | null) => {
    const page = await (await browser.newContext()).newPage();
    if (email) await signIn(page, email);
    return documentStatus(page, doc);
  };
  expect(await as(null)).toMatchObject({ status: 401 });
  expect(await as("erik@parklet.test")).toMatchObject({ status: 404 });
  expect(await as("forare@parklet.test")).toMatchObject({ status: 404 });
  expect(await as("anna@parklet.test")).toEqual({ status: 200, type: "application/pdf" });
  expect(await as("admin@parklet.test")).toEqual({ status: 200, type: "application/pdf" });
});

test("another account's pages explain themselves instead of a bare 404", async ({ page }) => {
  const ids = await seedIds();
  await signIn(page, "anna@parklet.test");

  // Erik's company: not hers; she can sign in with another account.
  await page.goto(`/uthyrare/${ids.erikCompany}`);
  await expect(page.getByRole("heading", { name: "Du har inte tillgång till sidan" })).toBeVisible();
  await expect(page.getByText("Du är inloggad som anna@parklet.test.")).toBeVisible();
  await expect(page.getByText("Kvarteret Fastigheter AB")).toHaveCount(0);
  // Erik's spot under her own account's address: the spot isn't hers either.
  await page.goto(`/uthyrare/${ids.erikSpot.host_account_id}/platser/${ids.erikSpot.id}`);
  await expect(page.getByRole("heading", { name: "Du har inte tillgång till sidan" })).toBeVisible();
  await page.goto(`/uthyrare/${ids.annaAccount}/platser/${ids.erikSpot.id}`);
  await expect(page.getByRole("heading", { name: "Platsen finns inte" })).toBeVisible();

  // The driver's booking.
  await page.goto(`/bokning/${ids.driverBooking}`);
  await expect(page.getByRole("heading", { name: "Bokningen hittades inte" })).toBeVisible();
  await page.goto(`/betala/${ids.driverBooking}`);
  await expect(page.getByRole("heading", { name: "Bokningen hittades inte" })).toBeVisible();

  // "Logga in med ett annat konto" brings her back to the page after signing in as the driver.
  await page.goto(`/bokning/${ids.driverBooking}`);
  await page.getByRole("button", { name: "Logga in med ett annat konto" }).click();
  await expect(page).toHaveURL(/\/logga-in\?next=/);
  await page.getByLabel("E-post").fill("forare@parklet.test");
  await page.getByLabel("Lösenord", { exact: true }).fill("parklet-demo-1");
  await page.getByRole("button", { name: "Logga in" }).click();
  await expect(page).toHaveURL(new RegExp(`/bokning/${ids.driverBooking}$`));
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText("Bokningen hittades inte");
});

test("an admin following a host's link is sent to the admin view", async ({ page }) => {
  const ids = await seedIds();
  await signIn(page, "admin@parklet.test");
  await page.goto(`/uthyrare/${ids.erikCompany}`);
  await page.getByRole("link", { name: "Öppna kontot i administrationen" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/konton/${ids.erikCompany}$`));
  await expect(page.getByRole("heading", { name: "Kvarteret Fastigheter AB" })).toBeVisible();

  await page.goto(`/uthyrare/${ids.erikSpot.host_account_id}/platser/${ids.erikSpot.id}`);
  await page.getByRole("link", { name: "Öppna platsen i administrationen" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/platser/${ids.erikSpot.id}$`));
});

test("a spot that can't be booked says so and offers a search nearby", async ({ page }) => {
  const ids = await seedIds();
  await page.goto(`/plats/${ids.pendingSpot}`);
  await expect(page.getByRole("heading", { name: "Platsen kan inte bokas just nu" })).toBeVisible();
  await page.getByRole("link", { name: "Hitta parkering i närheten" }).click();
  await expect(page).toHaveURL(/\/sok\?q=G%C3%B6teborg/);

  await page.goto("/plats/00000000-0000-4000-8000-000000000000");
  await expect(page.getByRole("heading", { name: "Platsen finns inte" })).toBeVisible();
});
