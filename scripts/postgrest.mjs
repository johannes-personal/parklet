/**
 * Supabase's HTTP API (PostgREST) for a local database: development, the
 * integration tests and the end-to-end tests. Production uses Supabase's own.
 *
 *   node scripts/postgrest.mjs [--db parklet] [--port 3300]
 *   node scripts/postgrest.mjs --prepare [--db parklet]   roles and grants only
 *
 * Downloads the same PostgREST version Supabase runs, once, into
 * node_modules/.cache, prepares the database's roles (scripts/api-roles.sql)
 * and serves it. The app then needs SUPABASE_REST_URL=http://localhost:<port>
 * and the local service key: `node scripts/postgrest.mjs --print-key`.
 */
import { spawn, execFileSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const VERSION = "14.18";
const SHA256 = "98de1c0be7787aea5f5e11a25f303ea0077634d6fc1000b687bfa825fd27d299";
/** Local only; never used outside this machine's own databases. */
export const LOCAL_JWT_SECRET = "parklet-local-postgrest-jwt-secret-0000";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = path.join(root, "node_modules", ".cache", "postgrest");
const binary = path.join(cacheDir, `postgrest-${VERSION}`);

/** The service_role key for the local PostgREST: an HS256 JWT like Supabase's legacy keys. */
export function localServiceKey() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ role: "service_role", iss: "parklet-local" })}`;
  return `${body}.${createHmac("sha256", LOCAL_JWT_SECRET).update(body).digest("base64url")}`;
}

/** A free local TCP port. */
export function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

export async function ensureBinary() {
  if (existsSync(binary)) return binary;
  if (process.platform !== "linux" || process.arch !== "x64") {
    throw new Error(`No PostgREST download configured for ${process.platform}/${process.arch}; install PostgREST ${VERSION} and put it at ${binary}.`);
  }
  mkdirSync(cacheDir, { recursive: true });
  const url = `https://github.com/PostgREST/postgrest/releases/download/v${VERSION}/postgrest-v${VERSION}-linux-static-x86-64.tar.xz`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Downloading PostgREST failed: HTTP ${res.status}`);
  const archive = Buffer.from(await res.arrayBuffer());
  const sum = createHash("sha256").update(archive).digest("hex");
  if (sum !== SHA256) throw new Error(`PostgREST download has the wrong checksum (${sum})`);
  const tarball = path.join(cacheDir, "postgrest.tar.xz");
  writeFileSync(tarball, archive);
  execFileSync("tar", ["xJf", tarball, "-C", cacheDir]);
  execFileSync("mv", [path.join(cacheDir, "postgrest"), binary]);
  chmodSync(binary, 0o755);
  return binary;
}

/** Roles and grants as on Supabase (scripts/api-roles.sql, scripts/api-grants.sql). */
export async function prepareDatabase(databaseUrl) {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    const [{ ready }] = await sql`select count(*) = 4 as ready from pg_roles where rolname in ('anon', 'authenticated', 'service_role', 'authenticator')`;
    if (!ready) {
      try {
        await sql.unsafe(readFileSync(path.join(root, "scripts", "api-roles.sql"), "utf8"));
      } catch (err) {
        throw new Error(
          `Creating the API roles needs a superuser. Run once: psql -U postgres -f scripts/api-roles.sql (${err instanceof Error ? err.message : err})`,
        );
      }
    }
    await sql.unsafe(readFileSync(path.join(root, "scripts", "api-grants.sql"), "utf8"));
  } finally {
    await sql.end();
  }
}

/** Start PostgREST for a database; resolves once it answers. */
export async function startPostgrest({ databaseUrl, port }) {
  const bin = await ensureBinary();
  await prepareDatabase(databaseUrl);
  const db = new URL(databaseUrl);
  db.username = "authenticator";
  db.password = "authenticator";
  const child = spawn(bin, [], {
    stdio: ["ignore", "inherit", "inherit"],
    env: {
      ...process.env,
      PGRST_DB_URI: db.toString(),
      PGRST_DB_SCHEMAS: "public",
      PGRST_DB_ANON_ROLE: "anon",
      PGRST_JWT_SECRET: LOCAL_JWT_SECRET,
      PGRST_SERVER_PORT: String(port),
      PGRST_DB_MAX_ROWS: "1000",
      PGRST_DB_CHANNEL_ENABLED: "true",
      PGRST_LOG_LEVEL: process.env.PGRST_LOG_LEVEL ?? "error",
    },
  });
  // Never outlive the process that started it (e.g. a seed that fails half-way).
  process.once("exit", () => child.kill());
  const deadline = Date.now() + 20_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`PostgREST exited with code ${child.exitCode}`);
    try {
      const res = await fetch(`http://localhost:${port}/`, { headers: { Authorization: `Bearer ${localServiceKey()}` } });
      if (res.ok) break;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) {
      child.kill();
      throw new Error("PostgREST did not start within 20 s");
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return child;
}

// No top-level await: the Playwright config imports this module with require().
async function main() {
  const arg = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`);
    return i > 0 ? process.argv[i + 1] : fallback;
  };
  const base = process.env.DATABASE_URL ?? "postgres://parklet:parklet@localhost:5432/parklet";
  const url = new URL(base);
  if (arg("db")) url.pathname = `/${arg("db")}`;
  if (process.argv.includes("--print-key")) {
    console.log(localServiceKey());
  } else if (process.argv.includes("--prepare")) {
    // Before the first migration, as on Supabase where the roles always exist.
    await prepareDatabase(url.toString());
  } else {
    const port = Number(arg("port", "3300"));
    const child = await startPostgrest({ databaseUrl: url.toString(), port });
    console.log(`PostgREST ${VERSION} for ${url.pathname.slice(1)} on http://localhost:${port}`);
    const stop = () => child.kill();
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    child.on("exit", (code) => process.exit(code ?? 0));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
