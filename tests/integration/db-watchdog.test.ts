import { sql } from "drizzle-orm";
import { afterAll, expect, test, vi } from "vitest";

// A short limit, set before the database module loads.
process.env.DB_QUERY_TIMEOUT_MS = "300";
const { db } = await import("@/db");

afterAll(async () => {
  await db.$client.end();
});

test("a stuck query fails, and the next query gets a fresh pool", async () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const first = db.$client;

  await expect(db.execute(sql`select pg_sleep(2)`)).rejects.toThrow();
  expect(errors).toHaveBeenCalledWith(expect.stringContaining("replacing the connection pool"));
  expect(db.$client).not.toBe(first);

  const rows = await db.execute(sql`select 1 as ok`);
  expect(rows[0]).toEqual({ ok: 1 });
  errors.mockRestore();
});

test("a stuck transaction fails too", async () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(db.transaction(async (tx) => tx.execute(sql`select pg_sleep(2)`))).rejects.toThrow();
  const rows = await db.execute(sql`select 2 as ok`);
  expect(rows[0]).toEqual({ ok: 2 });
  errors.mockRestore();
});

test("queries that finish in time are left alone", async () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const client = db.$client;
  await Promise.all(Array.from({ length: 20 }, () => db.execute(sql`select pg_sleep(0.01)`)));
  await new Promise((r) => setTimeout(r, 400));
  expect(errors).not.toHaveBeenCalled();
  expect(db.$client).toBe(client);
  errors.mockRestore();
});
