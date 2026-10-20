import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, expect, test } from "vitest";
import { clientOptions } from "@/db/client-options";

// Production's settings (Vercel, through the transaction pooler) against the test database.
const client = postgres(process.env.DATABASE_URL!, { ...clientOptions({ transactionPooler: true, vercel: true }), ...extra() });
const db = drizzle(client);
afterAll(() => client.end());

/** Lets a check run against other settings, e.g. DB_TEST_EXTRA_OPTIONS='{"max_pipeline":0}'. */
function extra() {
  return process.env.DB_TEST_EXTRA_OPTIONS ? JSON.parse(process.env.DB_TEST_EXTRA_OPTIONS) : {};
}

test("transactions and queries in parallel work with production's settings", async () => {
  const work = [
    ...Array.from({ length: 8 }, (_, i) => db.transaction(async (tx) => (await tx.execute(sql`select ${i}::int as n`))[0].n)),
    ...Array.from({ length: 16 }, (_, i) => db.execute(sql`select ${100 + i}::int as n`).then((r) => r[0].n)),
  ];
  const results = await Promise.all(work);
  expect(results).toEqual([...Array.from({ length: 8 }, (_, i) => i), ...Array.from({ length: 16 }, (_, i) => 100 + i)]);
});
