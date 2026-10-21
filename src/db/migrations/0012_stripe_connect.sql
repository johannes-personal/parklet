ALTER TYPE "public"."payout_status" ADD VALUE 'onboarding' BEFORE 'active';--> statement-breakpoint
ALTER TYPE "public"."payout_status" ADD VALUE 'pending' BEFORE 'active';--> statement-breakpoint
ALTER TYPE "public"."payout_status" ADD VALUE 'restricted' BEFORE 'active';--> statement-breakpoint
CREATE TABLE "stripe_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "checkout_session_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_checkout_session_key" ON "bookings" USING btree ("checkout_session_id");--> statement-breakpoint
CREATE INDEX "bookings_payment_ref_idx" ON "bookings" USING btree ("payment_ref");--> statement-breakpoint
-- Like every other table: no access through Supabase's public API, only the app's service key.
ALTER TABLE "stripe_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Let a running PostgREST see the new table and column (Supabase also does this by itself).
NOTIFY pgrst, 'reload schema';
