import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import postgres from "postgres";

/** The demo hosts' payout account in the fake Stripe (the seed gives them the mock's, which Stripe can't pay). */
export const E2E_CONNECTED_ACCOUNT = "acct_e2e_seed";

export default async function globalSetup() {
  const url = process.env.E2E_DATABASE_URL ?? "postgres://parklet:parklet@localhost:5432/parklet_e2e";
  const env = { ...process.env, DATABASE_URL: url };
  execSync("npm run db:migrate", { env, stdio: "inherit" });
  execSync("npm run db:seed", { env, stdio: "inherit" });
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await sql`update host_accounts set payout_account_ref = ${E2E_CONNECTED_ACCOUNT} where payout_account_ref like 'acct\_mock\_%'`;
  await sql.end();
  rmSync("storage/e2e-outbox.jsonl", { force: true });
}
