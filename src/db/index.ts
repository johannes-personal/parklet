import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createClient } from "./client-options";
import * as schema from "./schema";

// DATABASE_URL locally; on Vercel the Supabase integration provides POSTGRES_URL.
const rawUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
const MISSING = "DATABASE_URL (or POSTGRES_URL) is not set. Copy .env.example to .env, or connect the Supabase integration on Vercel.";
// Builds don't touch the database, so a missing URL only fails when a query runs.
const url = cleanUrl(rawUrl ?? "postgres://missing@127.0.0.1:1/missing");

// Supabase's transaction pooler (Supavisor, port 6543); see ./client-options.ts.
const transactionPooler = /:6543\//.test(url);

/**
 * postgres.js forwards unknown query parameters as server startup parameters,
 * which poolers reject (the Supabase integration adds e.g. `supa=…`). Keep
 * only the ones that configure the client.
 */
function cleanUrl(value: string): string {
  const u = new URL(value);
  for (const key of [...u.searchParams.keys()]) if (key !== "sslmode") u.searchParams.delete(key);
  return u.toString();
}

/**
 * A query, or a whole transaction, that hasn't finished after this long is
 * taken as stuck. Nothing in Parklet comes close; postgres.js itself would
 * wait forever. Overridable for tests.
 */
const QUERY_TIMEOUT_MS = Number(process.env.DB_QUERY_TIMEOUT_MS) || 20_000;
const TRANSACTION_TIMEOUT_MS = QUERY_TIMEOUT_MS * 1.5;

type Pool = { client: postgres.Sql; db: ReturnType<typeof drizzle<typeof schema>> };

function connect(): Pool {
  const client = createClient(url, { transactionPooler, vercel: Boolean(process.env.VERCEL) });
  watch(client);
  return { client, db: drizzle(client, { schema }) };
}

/**
 * Time every query and transaction. A stuck one means its connection can't
 * be trusted, and the others in the pool may be stuck the same way: replace
 * the whole pool, so the stuck requests fail and later ones get fresh
 * connections, instead of every request on this instance hanging.
 */
function watch(client: postgres.Sql) {
  const unsafe = client.unsafe;
  client.unsafe = ((...args: Parameters<typeof unsafe>) => {
    const query = unsafe(...args) as ReturnType<typeof unsafe> & { resolve: (x: unknown) => void; reject: (e: unknown) => void };
    // Queries are lazy promises; hook their settling rather than calling then(), which would run them early.
    const timer = setTimeout(() => replacePool(client, `query: ${args[0].slice(0, 200)}`, QUERY_TIMEOUT_MS), QUERY_TIMEOUT_MS);
    const { resolve, reject } = query;
    query.resolve = (x) => (clearTimeout(timer), resolve(x));
    query.reject = (e) => (clearTimeout(timer), reject(e));
    return query;
  }) as typeof unsafe;
  const begin = client.begin;
  client.begin = ((...args: Parameters<typeof begin>) => {
    const timer = setTimeout(() => replacePool(client, "transaction", TRANSACTION_TIMEOUT_MS), TRANSACTION_TIMEOUT_MS);
    return begin(...args).finally(() => clearTimeout(timer));
  }) as typeof begin;
}

function replacePool(stuck: postgres.Sql, what: string, afterMs: number) {
  if (pool.client !== stuck) return; // already replaced
  console.error(`db: ${what} has not finished after ${afterMs / 1000} s; replacing the connection pool`);
  setPool(connect());
  // Close the old connections at once; their pending queries fail instead of hanging.
  void stuck.end({ timeout: 0 });
}

// Reuse one pool across hot reloads in development.
const globalForDb = globalThis as unknown as { dbPool?: Pool };
let pool = globalForDb.dbPool ?? connect();
function setPool(next: Pool) {
  pool = next;
  if (process.env.NODE_ENV !== "production") globalForDb.dbPool = next;
}
setPool(pool);

type Database = Pool["db"];
// Callers keep one `db`; it always uses the current pool.
export const db: Database = new Proxy({} as Database, {
  get(_, key) {
    if (!rawUrl) throw new Error(MISSING);
    return Reflect.get(pool.db, key, pool.db);
  },
});
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
