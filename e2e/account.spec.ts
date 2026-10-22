import { expect, test } from "@playwright/test";
import { login, logout, signIn } from "./helpers";

async function register(page: import("@playwright/test").Page, name: string, password: string) {
  const email = `${name.split(" ")[0].toLowerCase()}-${Date.now()}@example.com`;
  await page.goto("/registrera");
  await page.getByLabel("För- och efternamn").fill(name);
  await page.getByLabel("E-post").fill(email);
  await page.getByLabel("Lösenord", { exact: true }).fill(password);
  await page.getByRole("checkbox", { name: /godkänner/ }).check();
  await page.getByRole("button", { name: "Skapa konto" }).click();
  await expect(page).not.toHaveURL(/registrera/);
  return email;
}

test("a new user has the bell at once, sees their account and can delete it", async ({ page }) => {
  const password = "ett riktigt bra lösenord";
  const email = await register(page, "Nyfiken Förare", password);
  // No notifications yet, and still a bell, without a reload: it keeps itself up to date.
  await page.getByRole("button", { name: /^Notiser/ }).click();
  await expect(page.getByText("Inget nytt än.")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/mina-sidor");
  const account = page.getByRole("region", { name: "Ditt konto" });
  await expect(account.getByText("Nyfiken Förare")).toBeVisible();
  await expect(account.getByText(email)).toBeVisible();
  await expect(account.getByText("Förare", { exact: true })).toBeVisible();
  await expect(account.getByRole("link", { name: "Mina fordon" })).toHaveAttribute("href", "/fordon");
  await expect(account.getByRole("link", { name: "Bli uthyrare" })).toHaveAttribute("href", "/uthyrare/nytt");

  // Deleting needs the password and a confirmation.
  await account.getByText("Ta bort kontot").click();
  await account.getByRole("button", { name: "Ta bort mitt konto" }).click();
  await expect(account.getByText("Bekräfta att du vill ta bort kontot.")).toBeVisible();
  await account.getByRole("checkbox", { name: /inte går att återställa/ }).check();
  await account.getByLabel("Ditt lösenord").fill("fel lösenord");
  await account.getByRole("button", { name: "Ta bort mitt konto" }).click();
  await expect(account.getByText("Fel lösenord.")).toBeVisible();
  await account.getByLabel("Ditt lösenord").fill(password);
  await account.getByRole("button", { name: "Ta bort mitt konto" }).click();
  await expect(page.getByRole("heading", { name: "Ditt konto är borttaget" })).toBeVisible();

  // Signed out, and the login is gone.
  await page.goto("/mina-sidor");
  await expect(page).toHaveURL(/logga-in/);
  await page.getByLabel("E-post").fill(email);
  await page.getByLabel("Lösenord", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Logga in" }).click();
  await expect(page.getByText("Fel e-postadress eller lösenord.")).toBeVisible();
});

test("a host's account lists their host accounts", async ({ page }) => {
  await signIn(page, "erik@parklet.test");
  await page.goto("/mina-sidor");
  const account = page.getByRole("region", { name: "Ditt konto" });
  await expect(account.getByText("Förare och uthyrare")).toBeVisible();
  await expect(account.getByRole("link", { name: "Kvarteret Fastigheter AB" })).toBeVisible();
  await expect(account.getByRole("link", { name: "Skapa ett till uthyrarkonto" })).toBeVisible();
});

test("a booking says when it was made", async ({ page }) => {
  await login(page, "forare@parklet.test");
  await page.goto("/mina-sidor");
  await page.getByText("Garage Linnégatan – Plats 1").first().click();
  await expect(page.getByText("Bokad", { exact: true })).toBeVisible();
  await logout(page);
});

test("links in an e-mail shown in the admin's log open in a new tab", async ({ page, context }) => {
  // Any mail with a button: a password reset for a demo account.
  await page.goto("/glomt-losenord");
  await page.getByLabel("E-post").fill("anna@parklet.test");
  await page.getByRole("button", { name: "Skicka länk" }).click();
  await expect(page.getByText(/Om det finns ett konto med den adressen/)).toBeVisible();

  await signIn(page, "admin@parklet.test");
  await page.goto("/admin/epost");
  // The log is a table like the other admin lists: filter on the kind, open the mail.
  await page.getByLabel("Typ").selectOption("password_reset");
  await expect(page).toHaveURL(/typ=password_reset/);
  const row = page.getByRole("row").filter({ hasText: "anna@parklet.test" }).first();
  await expect(row).toContainText("Nytt lösenord");
  await row.getByRole("link", { name: "Välj ett nytt lösenord för Parklet" }).click();
  await expect(page.getByRole("heading", { name: "Välj ett nytt lösenord för Parklet" })).toBeVisible();
  const frame = page.frameLocator("iframe");
  const [tab] = await Promise.all([context.waitForEvent("page"), frame.getByRole("link", { name: "Välj nytt lösenord" }).click()]);
  await tab.waitForLoadState();
  await expect(tab).toHaveURL(/\/aterstall-losenord\//);
  await expect(tab.getByRole("heading", { level: 1 })).toBeVisible();
});

test("Mina sidor: the account first, then the bookings, which can be filtered", async ({ page }) => {
  await login(page, "forare@parklet.test");
  // The old address still leads there.
  await page.goto("/mina-bokningar");
  await expect(page).toHaveURL(/\/mina-sidor$/);
  await expect(page.getByRole("heading", { name: "Mina sidor", level: 1 })).toBeVisible();
  const account = page.getByRole("region", { name: "Ditt konto" });
  const bookings = page.getByRole("region", { name: "Mina bokningar" });
  expect((await account.boundingBox())!.y).toBeLessThan((await bookings.boundingBox())!.y);
  await expect(bookings.getByRole("heading", { name: "Kommande" })).toBeVisible();

  await bookings.getByLabel("Visa").selectOption("kommande");
  await expect(page).toHaveURL(/visa=kommande/);
  await expect(bookings.getByRole("heading", { name: /^\d+ bokning(ar)?$/ })).toBeVisible();
  await expect(bookings.getByText("Avbokad", { exact: true })).toHaveCount(0);

  // Dates apply with the button; nothing is booked years ahead.
  await bookings.getByLabel("Från").fill("2099-01-01");
  await bookings.getByRole("button", { name: "Filtrera" }).click();
  await expect(bookings.getByText("Inga bokningar matchar.")).toBeVisible();
  await bookings.getByRole("link", { name: "Rensa" }).click();
  await expect(bookings.getByRole("heading", { name: "Kommande" })).toBeVisible();
  await logout(page);
});

test("admins find any booking, filter on status and open it", async ({ page }) => {
  await signIn(page, "admin@parklet.test");
  await page.goto("/admin");
  await page.getByRole("navigation", { name: "Administration" }).getByRole("link", { name: "Bokningar" }).click();
  await expect(page.getByRole("heading", { name: "Bokningar", level: 1 })).toBeVisible();

  await page.getByRole("searchbox").fill("forare@parklet.test");
  await page.getByRole("button", { name: "Sök" }).click();
  await expect(page).toHaveURL(/q=forare%40parklet.test/);
  const rows = page.getByRole("row").filter({ hasText: "forare@parklet.test" });
  await expect(rows.first()).toBeVisible();
  // Every row is the driver's; the full name is shown with the address.
  await expect(page.getByRole("row").filter({ hasNotText: "forare@parklet.test" })).toHaveCount(1); // the header

  await page.getByRole("navigation", { name: "Status" }).getByRole("link", { name: /^Bekräftad/ }).click();
  await expect(page).toHaveURL(/status=confirmed/);
  await rows.first().getByRole("link").first().click();
  await expect(page).toHaveURL(/\/admin\/bokningar\/[0-9a-f-]+$/);
  await expect(page.getByRole("definition").filter({ hasText: "Oskar Nilsson" })).toContainText("forare@parklet.test");
  await expect(page.getByRole("link", { name: "← Alla bokningar" })).toBeVisible();
});
