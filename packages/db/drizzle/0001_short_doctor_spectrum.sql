CREATE TYPE "public"."email_subscriber_source" AS ENUM('popup', 'footer', 'checkout', 'drop_signup', 'manual_admin');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "email_subscriber" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storefront_id" uuid NOT NULL,
	"email" text NOT NULL,
	"source" "email_subscriber_source" NOT NULL,
	"confirmed_at" timestamp with time zone,
	"confirm_token" text,
	"unsubscribe_token" text NOT NULL,
	"unsubscribed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "email_subscriber" ADD CONSTRAINT "email_subscriber_storefront_id_storefront_id_fk" FOREIGN KEY ("storefront_id") REFERENCES "public"."storefront"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_subscriber_storefront_email_unique" ON "email_subscriber" USING btree ("storefront_id","email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "email_subscriber_active_idx" ON "email_subscriber" USING btree ("storefront_id") WHERE confirmed_at IS NOT NULL AND unsubscribed_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_subscriber_confirm_token_unique" ON "email_subscriber" USING btree ("confirm_token");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "email_subscriber_unsubscribe_token_unique" ON "email_subscriber" USING btree ("unsubscribe_token");