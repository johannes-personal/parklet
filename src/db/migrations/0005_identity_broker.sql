CREATE TABLE "identity_requests" (
	"state" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"nonce" text NOT NULL,
	"code_verifier" text NOT NULL,
	"next" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "identity_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "personnummer_encrypted" text;--> statement-breakpoint
ALTER TABLE "identity_requests" ADD CONSTRAINT "identity_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Same as every other table (0004): the app connects as owner; the Data API sees nothing.
ALTER TABLE "identity_requests" ENABLE ROW LEVEL SECURITY;
