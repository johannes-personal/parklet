import { expect, test } from "@playwright/test";

test("public pages render in Swedish without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const path of ["/", "/sok", "/sok?q=G%C3%B6teborg&lat=57.7089&lng=11.9746", "/uthyrare", "/hjalp", "/villkor", "/integritet", "/logga-in", "/registrera", "/glomt-losenord"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", "sv");
    await expect(page.locator("h1").first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow, `horizontal scroll on ${path}`).toBe(false);
  }
  expect(errors).toEqual([]);
});

test("unknown pages get a Swedish 404", async ({ page }) => {
  const res = await page.goto("/finns-inte");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Sidan finns inte" })).toBeVisible();
});

test("search lists approved spots and hides unreviewed ones", async ({ page }) => {
  await page.goto("/sok?q=G%C3%B6teborg&lat=57.7089&lng=11.9746");
  await expect(page.getByTestId("search-result").first()).toBeVisible();
  await expect(page.getByText("Carport nära Liseberg")).toBeVisible();
  await expect(page.getByText("BRF-plats i Haga")).toHaveCount(0);
});
