import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// DATABASE_URL locally; on Vercel the Supabase integration provides POSTGRES_URL.
const rawUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
const MISSING = "DATABASE_URL (or POSTGRES_URL) is not set. Copy .env.example to .env, or connect the Supabase integration on Vercel.";
// Builds don't touch the database, so a missing URL only fails when a query runs.
const url = cleanUrl(rawUrl ?? "postgres://missing@127.0.0.1:1/missing");

// Supabase's transaction pooler (Supavisor, port 6543) does not support
// prepared statements. Serverless functions also keep their pools small.
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

// Reuse one pool across hot reloads in development.
const globalForDb = globalThis as unknown as { pgClient?: ReturnType<typeof postgres> };
const options = {
  max: process.env.VERCEL ? 3 : 10,
  prepare: !transactionPooler,
  // postgres.js pipelines queries on a busy connection. Through the
  // transaction pooler, pipelined queries can stall for good (the server shows
  // them as "active / ClientRead"), hanging every page that runs several
  // queries at once. Send one query at a time per connection there.
  // (The option exists but is missing from the type definitions.)
  max_pipeline: transactionPooler ? 0 : 100,
  onnotice: () => {},
};
const client = globalForDb.pgClient ?? postgres(url, options);
if (process.env.NODE_ENV !== "production") globalForDb.pgClient = client;

const realDb = drizzle(client, { schema });
export const db: typeof realDb = rawUrl
  ? realDb
  : new Proxy(realDb, {
      get() {
        throw new Error(MISSING);
      },
    });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
