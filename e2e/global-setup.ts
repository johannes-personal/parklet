import { execSync } from "node:child_process";
import { rmSync } from "node:fs";

export default function globalSetup() {
  const env = { ...process.env, DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgres://parklet:parklet@localhost:5432/parklet_e2e" };
  execSync("npm run db:migrate", { env, stdio: "inherit" });
  execSync("npm run db:seed", { env, stdio: "inherit" });
  rmSync("storage/e2e-outbox.jsonl", { force: true });
}
