import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test("the header follows who is signed in, through log out and in again", async ({ page }) => {
  await login(page, "anna@parklet.test");
  const nav = page.getByRole("navigation", { name: "Huvudmeny" });
  await expect(nav.getByRole("link", { name: "Anna", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Meny" }).click();
  await page.getByRole("dialog", { name: "Meny" }).getByRole("button", { name: "Logga ut" }).click();
  await expect(nav.getByRole("link", { name: "Logga in" })).toBeVisible();

  await nav.getByRole("link", { name: "Logga in" }).click();
  await page.getByLabel("E-post").fill("forare@parklet.test");
  await page.getByLabel("Lösenord", { exact: true }).fill("parklet-demo-1");
  await page.getByRole("button", { name: "Logga in" }).click();
  await expect(page).not.toHaveURL(/logga-in/);
  await page.goto("/mina-sidor");
  await expect(page.getByRole("region", { name: "Ditt konto" }).getByText("Oskar Nilsson")).toBeVisible();
  await expect(nav.getByRole("link", { name: "Oskar", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Anna", exact: true })).toHaveCount(0);
});

test("a tab that stays open follows a log-in as someone else in another tab", async ({ page, context }) => {
  await login(page, "anna@parklet.test");
  const nav = page.getByRole("navigation", { name: "Huvudmeny" });
  await expect(nav.getByRole("link", { name: "Anna", exact: true })).toBeVisible();

  // Another tab logs out and in as Oskar.
  const other = await context.newPage();
  await other.goto("/");
  await other.getByRole("button", { name: "Meny" }).click();
  await other.getByRole("dialog", { name: "Meny" }).getByRole("button", { name: "Logga ut" }).click();
  await login(other, "forare@parklet.test");
  await other.close();

  // Back in the first tab, the next navigation shows the new user in the header too.
  await page.getByRole("contentinfo").getByRole("link", { name: "Så fungerar det" }).first().click();
  await expect(nav.getByRole("link", { name: "Oskar", exact: true })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Anna", exact: true })).toHaveCount(0);
});
