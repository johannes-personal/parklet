-- Supabase exposes the public schema through its Data API (PostgREST) to the
-- anon and authenticated roles. Parklet never uses that API: the app talks to
-- Postgres directly as the table owner, which bypasses RLS. Enabling RLS with
-- no policies therefore locks the Data API out of every table while leaving
-- the app unaffected. On plain Postgres this is harmless.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "vehicles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "host_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "host_account_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "host_invitations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "spots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "availability_windows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "document_blobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mail_outbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bookings" ENABLE ROW LEVEL SECURITY;
