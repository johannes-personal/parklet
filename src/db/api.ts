import "server-only";
import { PostgrestClient } from "@supabase/postgrest-js";
import { getTableColumns, getTableName } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

/**
 * The app reaches its database only through Supabase's HTTP API (PostgREST),
 * with the service key, from the server. Every call is an ordinary HTTPS
 * request: no database connections to pool, so nothing can get stuck in
 * Supabase's connection pooler (the cause of the hangs fixed in #9–#13).
 * Work that must happen in one step (bookings, spots with their opening
 * hours…) runs as Postgres functions, see src/db/migrations/0010_http_api.sql.
 *
 * The table definitions in ./schema.ts stay the source of truth: they give
 * the row types, the column names for queries (`names(t)`), the select lists
 * that rename snake_case columns to the app's camelCase (`cols(t)`) and the
 * conversion of timestamps to Date (`parse(t, row)`).
 *
 * Production: SUPABASE_URL plus SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY
 * (both set by the Supabase integration). Locally and in tests:
 * SUPABASE_REST_URL points at scripts/postgrest.mjs.
 */

const REQUEST_TIMEOUT_MS = 15_000;
const MISSING = "SUPABASE_URL (or SUPABASE_REST_URL) and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) must be set.";

/** The service key's headers, for every Supabase API (also Storage, see src/server/storage.ts). */
export function serviceHeaders(): Record<string, string> {
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error(MISSING);
  // Supabase's opaque secret keys (sb_secret_…) go in the apikey header only; the
  // gateway turns them into a service_role token. Legacy keys are that token already.
  return key.startsWith("sb_") ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };
}

function config() {
  const rest = process.env.SUPABASE_REST_URL || (process.env.SUPABASE_URL ? `${process.env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1` : null);
  if (!rest) throw new Error(MISSING);
  return { rest, headers: serviceHeaders() };
}

/**
 * Next.js may cache fetch(); database reads must never be cached. Each request
 * gets a time limit, and reads are retried once after a network error or a
 * gateway failure (writes are not: they might have gone through).
 */
async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const attempt = () =>
    fetch(input, {
      ...init,
      cache: "no-store",
      signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]) : AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  if (method !== "GET" && method !== "HEAD") return attempt();
  try {
    const res = await attempt();
    if (res.status === 502 || res.status === 503 || res.status === 504) return attempt();
    return res;
  } catch (err) {
    if (init.signal?.aborted) throw err;
    return attempt();
  }
}

let client: PostgrestClient | null = null;

/** The PostgREST client (created on first use, so builds don't need the variables). */
export function api(): PostgrestClient {
  if (!client) {
    const c = config();
    client = new PostgrestClient(c.rest, { headers: c.headers, fetch: apiFetch });
  }
  return client;
}

/** A failed API call, with PostgREST's error code (e.g. 23P01, 23505, PGRST116). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string | undefined,
    readonly details?: string | null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Result = { data: unknown; error: { message: string; code?: string; details?: string | null; hint?: string | null } | null };

/**
 * The data of a call, or an ApiError. The type comes from the caller: select
 * lists here are built from the schema at runtime, so postgrest-js can't infer it.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function must<T = any>(result: Result, what: string): T {
  if (result.error) {
    const e = result.error;
    throw new ApiError(`${what}: ${e.message}${e.details ? ` (${e.details})` : ""}`, e.code, e.details);
  }
  return result.data as T;
}

/** The count of a `{ count: "exact", head: true }` query. */
export function mustCount(result: Result & { count: number | null }, what: string): number {
  must(result, what);
  return result.count ?? 0;
}

/* ------------------------------------------------- schema-driven mapping */

type Columns<T extends PgTable> = T["_"]["columns"];
export type Row<T extends PgTable> = T["$inferSelect"];
export type Key<T extends PgTable> = keyof Row<T> & string;

const columnsOf = (table: PgTable) => getTableColumns(table) as Record<string, PgColumn>;

/** The table's name in the API. */
export const tableName = (table: PgTable) => getTableName(table);

/** Column names for filters and ordering: `names(spots).hostAccountId` is "host_account_id". */
export function names<T extends PgTable>(table: T): { [K in keyof Columns<T>]: string } {
  return Object.fromEntries(Object.entries(columnsOf(table)).map(([key, col]) => [key, col.name])) as { [K in keyof Columns<T>]: string };
}

/** A select list that returns the given (or all) columns under their camelCase names. */
export function cols<T extends PgTable>(table: T, keys?: readonly Key<T>[]): string {
  const all = columnsOf(table);
  return (keys ?? (Object.keys(all) as Key<T>[]))
    .map((key) => {
      const col = all[key];
      if (!col) throw new Error(`${tableName(table)} has no column ${key}`);
      return col.name === key ? key : `${key}:${col.name}`;
    })
    .join(",");
}

/** An embedded related row, e.g. `embed("spot", spots, ["id", "title"], { inner: true })`. */
export function embed<T extends PgTable>(alias: string, table: T, keys?: readonly Key<T>[], opts: { inner?: boolean; fk?: string } = {}) {
  return `${alias}:${tableName(table)}${opts.fk ? `!${opts.fk}` : ""}${opts.inner ? "!inner" : ""}(${cols(table, keys)})`;
}

const isTimestamp = (col: PgColumn) => col.columnType === "PgTimestamp";

/** An API row (selected with `cols`) with its timestamps as Date. */
export function parse<T extends PgTable, R = Row<T>>(table: T, row: unknown): R {
  const out = { ...(row as Record<string, unknown>) };
  for (const [key, col] of Object.entries(columnsOf(table))) {
    if (isTimestamp(col) && typeof out[key] === "string") out[key] = new Date(out[key] as string);
  }
  return out as R;
}

export const parseAll = <T extends PgTable, R = Row<T>>(table: T, rows: unknown[] | null) => (rows ?? []).map((r) => parse<T, R>(table, r));

/** A row as the database names it (e.g. from `to_jsonb(t)` in a function), under camelCase keys with Date timestamps. */
export function fromDb<T extends PgTable, R = Row<T>>(table: T, row: Record<string, unknown>): R {
  const out: Record<string, unknown> = {};
  for (const [key, col] of Object.entries(columnsOf(table))) {
    if (!(col.name in row)) continue;
    const value = row[col.name];
    out[key] = isTimestamp(col) && typeof value === "string" ? new Date(value) : value;
  }
  return out as R;
}

/** Values for an insert or update: camelCase keys to column names, Dates to ISO strings. Unknown keys are an error. */
export function toDb<T extends PgTable>(table: T, values: Partial<T["$inferInsert"]>): Record<string, unknown> {
  const all = columnsOf(table);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) continue;
    const col = all[key];
    if (!col) throw new Error(`${tableName(table)} has no column ${key}`);
    out[col.name] = value instanceof Date ? value.toISOString() : value;
  }
  return out;
}

/** A Postgres function, via the API. */
export async function rpc<T = unknown>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  return must<T>(await api().rpc(fn, args), fn);
}
