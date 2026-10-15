import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { DateTime } from "luxon";

export const PASSWORD = "parklet-demo-1";

export async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto("/logga-in");
  await page.getByLabel("E-post").fill(email);
  await page.getByLabel("Lösenord", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Logga in" }).click();
  await expect(page).not.toHaveURL(/logga-in/);
}

export async function logout(page: Page) {
  await page.context().clearCookies();
}

/** datetime-local value N days from now at the given hour, Stockholm time. */
export function localAt(daysFromNow: number, hour: number) {
  return DateTime.now().setZone("Europe/Stockholm").plus({ days: daysFromNow }).set({ hour, minute: 0, second: 0, millisecond: 0 }).toFormat("yyyy-MM-dd'T'HH:mm");
}

/** Last link in the dev outbox matching a path, e.g. "/godkannande/". */
export function lastMailLink(pathPart: string): string {
  const lines = readFileSync("storage/e2e-outbox.jsonl", "utf8").trim().split("\n").reverse();
  for (const line of lines) {
    const m = (JSON.parse(line).text as string).match(new RegExp(`https?://[^\\s]+${pathPart}[^\\s]+`));
    if (m) return new URL(m[0]).pathname;
  }
  throw new Error(`No mail containing ${pathPart}`);
}
