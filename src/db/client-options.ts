import postgres from "postgres";

/**
 * The postgres.js client, apart from the URL. Kept separate so tests use
 * exactly what production uses through Supabase's transaction pooler.
 */
export function createClient(url: string, { transactionPooler, vercel }: { transactionPooler: boolean; vercel: boolean }) {
  const client = postgres(url, {
    max: vercel ? 3 : 10,
    // Supabase's transaction pooler (Supavisor, port 6543) does not support prepared statements.
    prepare: !transactionPooler,
    // postgres.js otherwise sends further queries down a connection that is still busy
    // ("pipelining"). Through the transaction pooler such queries stalled for good: the
    // admin pages, which run several queries at once, hung until the watchdog gave up.
    // One query at a time per connection. (The option is missing from the type definitions.)
    ...(transactionPooler ? { max_pipeline: 0 } : {}),
    // Serverless instances come and go; don't hold pooler connections while idle.
    idle_timeout: vercel ? 20 : undefined,
    onnotice: () => {},
  });
  // Without pipelining, postgres.js' own sql.begin can't set its connection aside and
  // fails with UNSAFE_TRANSACTION, so run transactions on a reserved connection.
  if (transactionPooler) client.begin = beginOnReserved(client);
  return client;
}

type Reserved = postgres.ReservedSql & { savepoint?: (fn: (sql: Reserved) => unknown) => Promise<unknown> };

function beginOnReserved(client: postgres.Sql): postgres.Sql["begin"] {
  return (async (...args: unknown[]) => {
    const fn = (args.length > 1 ? args[1] : args[0]) as (sql: Reserved) => unknown;
    const options = args.length > 1 ? String(args[0]) : "";
    const sql: Reserved = await client.reserve();
    let savepoints = 0;
    // Drizzle runs nested transactions as savepoints.
    sql.savepoint = async (inner) => {
      const name = `s${++savepoints}`;
      await sql.unsafe(`savepoint ${name}`);
      try {
        const result = await inner(sql);
        await sql.unsafe(`release savepoint ${name}`);
        return result;
      } catch (error) {
        await sql.unsafe(`rollback to savepoint ${name}`);
        throw error;
      }
    };
    try {
      await sql.unsafe(`begin ${options.replace(/[^a-z ]/gi, "")}`);
      const result = await fn(sql);
      await sql.unsafe("commit");
      return result;
    } catch (error) {
      await sql.unsafe("rollback").catch(() => {});
      throw error;
    } finally {
      sql.release();
    }
  }) as postgres.Sql["begin"];
}
