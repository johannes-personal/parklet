import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { afterAll, expect, test } from "vitest";
import { createClient } from "@/db/client-options";

// Production's client (Vercel, through the transaction pooler) against the test database.
const client = createClient(process.env.DATABASE_URL!, { transactionPooler: true, vercel: true });
const db = drizzle(client);
afterAll(() => client.end());

test("transactions and queries in parallel work with production's settings", async () => {
  const work = [
    ...Array.from({ length: 8 }, (_, i) => db.transaction(async (tx) => (await tx.execute(sql`select ${i}::int as n`))[0].n)),
    ...Array.from({ length: 16 }, (_, i) => db.execute(sql`select ${100 + i}::int as n`).then((r) => r[0].n)),
  ];
  const results = await Promise.all(work);
  expect(results).toEqual([...Array.from({ length: 8 }, (_, i) => i), ...Array.from({ length: 16 }, (_, i) => 100 + i)]);
});

test("a failed transaction rolls back and frees its connection", async () => {
  await db.execute(sql`create temporary table if not exists tx_probe (n int)`).catch(() => {});
  await expect(
    db.transaction(async (tx) => {
      await tx.execute(sql`select 1`);
      throw new Error("boom");
    }),
  ).rejects.toThrow("boom");
  // All three connections are usable again.
  const rows = await Promise.all(Array.from({ length: 6 }, (_, i) => db.execute(sql`select ${i}::int as n`)));
  expect(rows.map((r) => r[0].n)).toEqual([0, 1, 2, 3, 4, 5]);
});

test("nested transactions use savepoints", async () => {
  const result = await db.transaction(async (tx) => {
    await expect(
      tx.transaction(async (inner) => {
        await inner.execute(sql`select 1`);
        throw new Error("inner");
      }),
    ).rejects.toThrow("inner");
    return (await tx.execute(sql`select 42 as n`))[0].n;
  });
  expect(result).toBe(42);
});

test("no pipelining through the transaction pooler", () => {
  // Locally, pipelined and queued queries look the same; through Supavisor pipelined ones stalled.
  expect((client.options as unknown as { max_pipeline: number }).max_pipeline).toBe(0);
  const direct = createClient(process.env.DATABASE_URL!, { transactionPooler: false, vercel: true });
  expect((direct.options as unknown as { max_pipeline: number }).max_pipeline).toBe(100);
  void direct.end();
});
