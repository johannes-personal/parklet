import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// DATABASE_URL locally; on Vercel the Supabase integration provides POSTGRES_URL.
const rawUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
const MISSING = "DATABASE_URL (or POSTGRES_URL) is not set. Copy .env.example to .env, or connect the Supabase integration on Vercel.";
// Builds don't touch the database, so a missing URL only fails when a query runs.
const url = sessionMode(cleanUrl(rawUrl ?? "postgres://missing@127.0.0.1:1/missing"));

// Any other transaction pooler does not support prepared statements.
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
 * The Supabase integration's POSTGRES_URL points at Supavisor's transaction
 * mode (port 6543). In that mode queries from postgres.js stalled for good
 * (the server showed them as "active / ClientRead"), hanging every page that
 * queried the database. The same pooler in session mode (port 5432, same host
 * and credentials) behaves like a normal connection. Parklet's traffic is far
 * below its connection limit, and idle connections are closed quickly.
 */
function sessionMode(value: string): string {
  const u = new URL(value);
  if (u.hostname.endsWith(".pooler.supabase.com") && u.port === "6543") u.port = "5432";
  return u.toString();
}

// Reuse one pool across hot reloads in development.
const globalForDb = globalThis as unknown as { pgClient?: ReturnType<typeof postgres> };
const options = {
  max: process.env.VERCEL ? 3 : 10,
  prepare: !transactionPooler,
  // Serverless instances come and go; don't hold pooler connections while idle.
  idle_timeout: process.env.VERCEL ? 20 : undefined,
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
