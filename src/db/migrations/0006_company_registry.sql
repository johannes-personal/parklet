ALTER TABLE "host_accounts" ADD COLUMN "registry_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "host_accounts" ADD COLUMN "registry_name" text;--> statement-breakpoint
ALTER TABLE "host_accounts" ADD COLUMN "registry_form" text;--> statement-breakpoint
ALTER TABLE "host_accounts" ADD COLUMN "registry_status" text;