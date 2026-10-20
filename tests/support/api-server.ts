// Vitest global setup: the integration tests talk to the test database the way the app
// does in production, through PostgREST (Supabase's HTTP API), started here.
import type { ChildProcess } from "node:child_process";
import { startPostgrest } from "../../scripts/postgrest.mjs";
import { TEST_API_PORT, TEST_DATABASE_URL } from "./env";

let child: ChildProcess | undefined;

export async function setup() {
  child = await startPostgrest({ databaseUrl: TEST_DATABASE_URL, port: TEST_API_PORT });
}

export async function teardown() {
  child?.kill();
}
