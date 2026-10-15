CREATE TYPE "public"."booking_status" AS ENUM('pending_payment', 'confirmed', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."cancelled_by" AS ENUM('driver', 'host');--> statement-breakpoint
CREATE TYPE "public"."document_kind" AS ENUM('ownership_proof', 'rental_contract', 'sublet_permission', 'landlord_rules', 'org_registration', 'board_minutes', 'signatory_proof', 'other');--> statement-breakpoint
CREATE TYPE "public"."host_kind" AS ENUM('household', 'association', 'company');--> statement-breakpoint
CREATE TYPE "public"."landlord_approval" AS ENUM('not_needed', 'missing', 'requested', 'approved', 'declined');--> statement-breakpoint
CREATE TYPE "public"."landlord_kind" AS ENUM('brf', 'landlord');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('unpaid', 'paid', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('not_connected', 'active');--> statement-breakpoint
CREATE TYPE "public"."right_basis" AS ENUM('owns', 'rents');--> statement-breakpoint
CREATE TYPE "public"."spot_review" AS ENUM('draft', 'pending_review', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."spot_status" AS ENUM('active', 'paused');--> statement-breakpoint
CREATE TYPE "public"."spot_type" AS ENUM('outdoor', 'garage', 'carport', 'driveway');--> statement-breakpoint
CREATE TYPE "public"."spot_visibility" AS ENUM('public', 'link');--> statement-breakpoint
CREATE TYPE "public"."vehicle_registration" AS ENUM('not_required', 'pending', 'done');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('unverified', 'pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TABLE "availability_windows" (
	"id" serial PRIMARY KEY NOT NULL,
	"spot_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"start_minute" smallint NOT NULL,
	"end_minute" smallint NOT NULL,
	CONSTRAINT "availability_weekday_range" CHECK ("availability_windows"."weekday" BETWEEN 1 AND 7),
	CONSTRAINT "availability_minutes_range" CHECK ("availability_windows"."start_minute" >= 0 AND "availability_windows"."end_minute" <= 1440 AND "availability_windows"."start_minute" < "availability_windows"."end_minute")
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"spot_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"vehicle_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" "booking_status" DEFAULT 'pending_payment' NOT NULL,
	"hold_expires_at" timestamp with time zone,
	"vehicle_reg" text NOT NULL,
	"vehicle_registration" "vehicle_registration" DEFAULT 'not_required' NOT NULL,
	"vehicle_registered_at" timestamp with time zone,
	"base_ore" integer NOT NULL,
	"fee_ore" integer NOT NULL,
	"total_ore" integer NOT NULL,
	"payment_provider" text NOT NULL,
	"payment_ref" text,
	"payment_status" "payment_status" DEFAULT 'unpaid' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" "cancelled_by",
	CONSTRAINT "bookings_range_valid" CHECK ("bookings"."ends_at" > "bookings"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_account_id" uuid NOT NULL,
	"spot_id" uuid,
	"uploaded_by" uuid NOT NULL,
	"kind" "document_kind" NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "host_account_members" (
	"host_account_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "host_account_members_host_account_id_user_id_pk" PRIMARY KEY("host_account_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "host_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "host_kind" NOT NULL,
	"name" text NOT NULL,
	"org_number" text,
	"signatory_role" text,
	"verification_status" "verification_status" DEFAULT 'unverified' NOT NULL,
	"review_note" text,
	"reviewed_at" timestamp with time zone,
	"payout_status" "payout_status" DEFAULT 'not_connected' NOT NULL,
	"payout_account_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "host_invitations" (
	"id" text PRIMARY KEY NOT NULL,
	"host_account_id" uuid NOT NULL,
	"email" text NOT NULL,
	"invited_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_account_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"address" text NOT NULL,
	"city" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"spot_type" "spot_type" NOT NULL,
	"covered" boolean DEFAULT false NOT NULL,
	"ev_charging" boolean DEFAULT false NOT NULL,
	"max_height_cm" integer,
	"price_per_hour_ore" integer NOT NULL,
	"price_per_day_ore" integer,
	"min_duration_minutes" integer DEFAULT 60 NOT NULL,
	"min_notice_minutes" integer DEFAULT 0 NOT NULL,
	"cancellation_hours" integer DEFAULT 2 NOT NULL,
	"access_instructions" text DEFAULT '' NOT NULL,
	"visibility" "spot_visibility" DEFAULT 'public' NOT NULL,
	"status" "spot_status" DEFAULT 'active' NOT NULL,
	"right_basis" "right_basis" NOT NULL,
	"landlord_kind" "landlord_kind",
	"landlord_name" text,
	"landlord_email" text,
	"landlord_approval" "landlord_approval" DEFAULT 'not_needed' NOT NULL,
	"landlord_approval_token_hash" text,
	"landlord_approved_by_name" text,
	"landlord_approved_by_role" text,
	"landlord_responded_at" timestamp with time zone,
	"requires_vehicle_registration" boolean DEFAULT false NOT NULL,
	"vehicle_registration_note" text DEFAULT '' NOT NULL,
	"review" "spot_review" DEFAULT 'draft' NOT NULL,
	"review_note" text,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "spots_price_positive" CHECK ("spots"."price_per_hour_ore" > 0),
	CONSTRAINT "spots_day_price_positive" CHECK ("spots"."price_per_day_ore" IS NULL OR "spots"."price_per_day_ore" > 0),
	CONSTRAINT "spots_lat_range" CHECK ("spots"."lat" BETWEEN -90 AND 90),
	CONSTRAINT "spots_lng_range" CHECK ("spots"."lng" BETWEEN -180 AND 180),
	CONSTRAINT "spots_landlord_kind" CHECK (("spots"."right_basis" = 'rents') = ("spots"."landlord_kind" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"identity_verified_at" timestamp with time zone,
	"identity_provider" text,
	"identity_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"reg" text NOT NULL,
	"nickname" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "availability_windows" ADD CONSTRAINT "availability_windows_spot_id_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_spot_id_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_host_account_id_host_accounts_id_fk" FOREIGN KEY ("host_account_id") REFERENCES "public"."host_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_spot_id_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."spots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_account_members" ADD CONSTRAINT "host_account_members_host_account_id_host_accounts_id_fk" FOREIGN KEY ("host_account_id") REFERENCES "public"."host_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_account_members" ADD CONSTRAINT "host_account_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_invitations" ADD CONSTRAINT "host_invitations_host_account_id_host_accounts_id_fk" FOREIGN KEY ("host_account_id") REFERENCES "public"."host_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "host_invitations" ADD CONSTRAINT "host_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spots" ADD CONSTRAINT "spots_host_account_id_host_accounts_id_fk" FOREIGN KEY ("host_account_id") REFERENCES "public"."host_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spots" ADD CONSTRAINT "spots_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spots" ADD CONSTRAINT "spots_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "availability_windows_spot_id_idx" ON "availability_windows" USING btree ("spot_id");--> statement-breakpoint
CREATE INDEX "bookings_spot_id_idx" ON "bookings" USING btree ("spot_id","starts_at");--> statement-breakpoint
CREATE INDEX "bookings_driver_id_idx" ON "bookings" USING btree ("driver_id","starts_at");--> statement-breakpoint
CREATE INDEX "documents_host_account_idx" ON "documents" USING btree ("host_account_id");--> statement-breakpoint
CREATE INDEX "documents_spot_idx" ON "documents" USING btree ("spot_id");--> statement-breakpoint
CREATE INDEX "host_account_members_user_idx" ON "host_account_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "spots_lat_lng_idx" ON "spots" USING btree ("lat","lng");--> statement-breakpoint
CREATE INDEX "spots_host_account_idx" ON "spots" USING btree ("host_account_id");--> statement-breakpoint
CREATE INDEX "spots_review_idx" ON "spots" USING btree ("review");--> statement-breakpoint
CREATE UNIQUE INDEX "spots_landlord_token_key" ON "spots" USING btree ("landlord_approval_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "vehicles_user_reg_key" ON "vehicles" USING btree ("user_id","reg");