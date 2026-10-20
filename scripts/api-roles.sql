-- The roles Supabase gives every project, for local databases served by PostgREST
-- (scripts/postgrest.mjs). Roles belong to the whole Postgres server: run once, as a
-- superuser or a role with CREATEROLE; safe to repeat. The grants per database are
-- in scripts/api-grants.sql. Never run either against Supabase: there they exist.
--
-- As on Supabase, every table in `public` has row-level security without policies
-- (migration 0004), so `anon` and `authenticated` can read nothing; `service_role`,
-- which the app uses, bypasses RLS. Like Supabase, new functions are executable by
-- everyone unless a migration revokes that, so the tests catch a missing revoke.

do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  if not exists (select from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit password 'authenticator';
  end if;
end
$$;

grant anon, authenticated, service_role to authenticator;
