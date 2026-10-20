/**
 * postgres.js settings, apart from the URL. Kept separate so tests can use
 * exactly what production uses through Supabase's transaction pooler.
 *
 * Don't limit pipelining here (`max_pipeline`): postgres.js only reserves a
 * connection for a transaction when the BEGIN fits under that limit, so any
 * low value breaks transactions (UNSAFE_TRANSACTION). Stalled queries are
 * handled by the watchdog in ./index.ts instead.
 */
export function clientOptions({ transactionPooler, vercel }: { transactionPooler: boolean; vercel: boolean }) {
  return {
    max: vercel ? 3 : 10,
    // Supabase's transaction pooler (Supavisor, port 6543) does not support prepared statements.
    prepare: !transactionPooler,
    // Serverless instances come and go; don't hold pooler connections while idle.
    idle_timeout: vercel ? 20 : undefined,
    onnotice: () => {},
  };
}
