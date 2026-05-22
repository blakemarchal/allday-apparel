CREATE TYPE "public"."admin_role" AS ENUM('owner', 'manager');--> statement-breakpoint
CREATE TYPE "public"."admin_user_status" AS ENUM('invited', 'active', 'disabled');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supabase_user_id" text,
	"email" text NOT NULL,
	"name" text,
	"role" "admin_role" DEFAULT 'manager' NOT NULL,
	"status" "admin_user_status" DEFAULT 'invited' NOT NULL,
	"invited_by_id" uuid,
	"last_sign_in_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "admin_user" ADD CONSTRAINT "admin_user_invited_by_id_admin_user_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."admin_user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admin_user_supabase_id_unique" ON "admin_user" USING btree ("supabase_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admin_user_email_unique" ON "admin_user" USING btree ("email");