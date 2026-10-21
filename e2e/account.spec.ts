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

  await page.goto("/mina-bokningar");
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
  await page.goto("/mina-bokningar");
  await expect(page).toHaveURL(/logga-in/);
  await page.getByLabel("E-post").fill(email);
  await page.getByLabel("Lösenord", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Logga in" }).click();
  await expect(page.getByText("Fel e-postadress eller lösenord.")).toBeVisible();
});

test("a host's account lists their host accounts", async ({ page }) => {
  await signIn(page, "erik@parklet.test");
  await page.goto("/mina-bokningar");
  const account = page.getByRole("region", { name: "Ditt konto" });
  await expect(account.getByText("Förare och uthyrare")).toBeVisible();
  await expect(account.getByRole("link", { name: "Kvarteret Fastigheter AB" })).toBeVisible();
  await expect(account.getByRole("link", { name: "Skapa ett till uthyrarkonto" })).toBeVisible();
});

test("a booking says when it was made", async ({ page }) => {
  await login(page, "forare@parklet.test");
  await page.goto("/mina-bokningar");
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
  const mail = page.getByRole("listitem").filter({ hasText: "anna@parklet.test" }).first();
  await mail.getByText("Visa som mejl").click();
  const frame = mail.frameLocator("iframe");
  const [tab] = await Promise.all([context.waitForEvent("page"), frame.getByRole("link", { name: "Välj nytt lösenord" }).click()]);
  await tab.waitForLoadState();
  await expect(tab).toHaveURL(/\/aterstall-losenord\//);
  await expect(tab.getByRole("heading", { level: 1 })).toBeVisible();
});
