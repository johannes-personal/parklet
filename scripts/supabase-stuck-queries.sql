-- Safety net for the production database on Supabase (not part of the app's migrations:
-- pg_cron exists only there). Apply in the SQL editor; running it again is harmless.
--
-- Every 5 minutes, end app queries that have waited for more than 2 minutes in the middle of
-- a request ("active / ClientRead" through Supavisor). Such a query can never finish: it is
-- the kind of stall that hung the site on 2026-10-20. The app replaces its own connections
-- after 20 s (src/db/index.ts); this also frees the database side. Admins are told in the bell.

create or replace function public.parklet_end_stuck_queries() returns integer
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  stuck record;
  ended integer := 0;
begin
  for stuck in
    select pid, now() - query_start as running, left(query, 200) as query
    from pg_stat_activity
    where datname = current_database()
      and application_name = 'Supavisor'
      and state = 'active'
      and wait_event = 'ClientRead'
      and query_start < now() - interval '2 minutes'
  loop
    perform pg_terminate_backend(stuck.pid);
    ended := ended + 1;
    raise log 'parklet: ended stuck query (pid %, running %): %', stuck.pid, stuck.running, stuck.query;
  end loop;

  if ended > 0 then
    insert into notifications (user_id, kind, title, body, href)
    select id,
           'admin_db_stuck',
           'Databasen: ' || ended || case when ended = 1 then ' fastnad fråga avslutades' else ' fastnade frågor avslutades' end,
           'Frågor från appen hade väntat i mer än 2 minuter och avslutades automatiskt. Händer det igen, titta i Supabase-loggarna (Postgres, "ended stuck query").',
           '/admin'
    from users
    where is_admin;
  end if;
  return ended;
end
$$;

-- Not callable through Supabase's public API.
revoke all on function public.parklet_end_stuck_queries() from public, anon, authenticated;

select cron.schedule('parklet-end-stuck-queries', '*/5 * * * *', 'select public.parklet_end_stuck_queries()');
