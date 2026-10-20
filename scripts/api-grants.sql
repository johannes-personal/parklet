-- Per-database grants as on Supabase, for a local database served by PostgREST.
-- Run in each database after scripts/api-roles.sql; safe to repeat.
grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
-- Functions: only service_role here. On Supabase anon and authenticated get EXECUTE
-- through the default privileges below, on functions created after the roles; each
-- migration revokes that for its functions, which the tests check.
grant execute on all functions in schema public to service_role;

alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
