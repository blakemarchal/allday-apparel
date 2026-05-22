CREATE TYPE "public"."drop_status" AS ENUM('draft', 'scheduled', 'live', 'ended');--> statement-breakpoint
CREATE TYPE "public"."invoice_upload_source" AS ENUM('manual_upload', 'email_inbound', 'api');--> statement-breakpoint
CREATE TYPE "public"."invoice_upload_status" AS ENUM('uploaded', 'extracting', 'extracted', 'applied', 'rejected', 'failed');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'paid', 'fulfilled', 'cancelled', 'refunded', 'partially_refunded');--> statement-breakpoint
CREATE TYPE "public"."payout_accrual_status" AS ENUM('accrued', 'paid', 'voided');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('held', 'consumed', 'released');--> statement-breakpoint
CREATE TYPE "public"."variant_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "storefront" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"free_shipping_threshold_cents" integer,
	"flat_shipping_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "storefront_host" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storefront_id" uuid NOT NULL,
	"hostname" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "theme_config" (
	"storefront_id" uuid PRIMARY KEY NOT NULL,
	"tokens" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"landing" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invoice_upload" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"r2_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"content_type" text NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"file_sha256" text,
	"source" "invoice_upload_source" DEFAULT 'manual_upload' NOT NULL,
	"uploaded_by" text,
	"status" "invoice_upload_status" DEFAULT 'uploaded' NOT NULL,
	"vendor_extracted" text,
	"invoice_date_extracted" date,
	"invoice_number_extracted" text,
	"total_cents_extracted" integer,
	"currency_extracted" text,
	"extraction_payload" jsonb,
	"extraction_model" text,
	"extraction_error" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"applied_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inventory_item" (
	"variant_id" uuid PRIMARY KEY NOT NULL,
	"qty_on_hand" integer DEFAULT 0 NOT NULL,
	"qty_reserved" integer DEFAULT 0 NOT NULL,
	"low_stock_threshold" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qty_on_hand_non_negative" CHECK ("inventory_item"."qty_on_hand" >= 0),
	CONSTRAINT "qty_reserved_non_negative" CHECK ("inventory_item"."qty_reserved" >= 0),
	CONSTRAINT "qty_reserved_lte_on_hand" CHECK ("inventory_item"."qty_reserved" <= "inventory_item"."qty_on_hand")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storefront_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "product_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_option" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_option_value" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_option_id" uuid NOT NULL,
	"value" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stock_receipt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"qty_received" integer NOT NULL,
	"unit_cost_cents" integer NOT NULL,
	"total_cost_cents" integer NOT NULL,
	"vendor" text,
	"reference" text,
	"received_at" timestamp with time zone NOT NULL,
	"notes" text,
	"source_invoice_upload_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qty_received_positive" CHECK ("stock_receipt"."qty_received" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "variant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"price_cents" integer NOT NULL,
	"weight_grams" integer,
	"cost_cents" integer,
	"stripe_product_id" text,
	"stripe_price_id" text,
	"status" "variant_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "variant_option_value" (
	"variant_id" uuid NOT NULL,
	"product_option_value_id" uuid NOT NULL,
	CONSTRAINT "variant_option_value_variant_id_product_option_value_id_pk" PRIMARY KEY("variant_id","product_option_value_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drop" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storefront_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"quantity_cap" integer,
	"per_customer_cap" integer,
	"status" "drop_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drop_allocation" (
	"drop_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"allocated_qty" integer,
	CONSTRAINT "drop_allocation_drop_id_variant_id_pk" PRIMARY KEY("drop_id","variant_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"stripe_customer_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "order" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storefront_id" uuid NOT NULL,
	"customer_id" uuid,
	"stripe_checkout_session_id" text NOT NULL,
	"stripe_payment_intent_id" text,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"subtotal_cents" integer DEFAULT 0 NOT NULL,
	"tax_cents" integer DEFAULT 0 NOT NULL,
	"shipping_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"shipping_address" jsonb,
	"billing_address" jsonb,
	"email_snapshot" text,
	"refunded_amount_cents" integer DEFAULT 0 NOT NULL,
	"refund_reason" text,
	"stripe_fee_cents" integer,
	"shipping_label_cost_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"fulfilled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "order_line_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"sku_snapshot" text NOT NULL,
	"title_snapshot" text NOT NULL,
	"options_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"qty" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"line_total_cents" integer NOT NULL,
	"unit_cost_cents_snapshot" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reservation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"qty" integer NOT NULL,
	"stripe_checkout_session_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" "reservation_status" DEFAULT 'held' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stripe_webhook_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payout_accrual" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"gross_cents" integer NOT NULL,
	"cogs_cents" integer DEFAULT 0 NOT NULL,
	"stripe_fee_cents" integer DEFAULT 0 NOT NULL,
	"shipping_label_cost_cents" integer,
	"net_margin_cents" integer NOT NULL,
	"pct_basis_points_snapshot" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" "payout_accrual_status" DEFAULT 'accrued' NOT NULL,
	"disbursement_id" uuid,
	"voided_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payout_disbursement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"amount_cents" integer NOT NULL,
	"method" text NOT NULL,
	"reference" text,
	"paid_at" timestamp with time zone NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "storefront_host" ADD CONSTRAINT "storefront_host_storefront_id_storefront_id_fk" FOREIGN KEY ("storefront_id") REFERENCES "public"."storefront"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "theme_config" ADD CONSTRAINT "theme_config_storefront_id_storefront_id_fk" FOREIGN KEY ("storefront_id") REFERENCES "public"."storefront"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory_item" ADD CONSTRAINT "inventory_item_variant_id_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variant"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product" ADD CONSTRAINT "product_storefront_id_storefront_id_fk" FOREIGN KEY ("storefront_id") REFERENCES "public"."storefront"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_option" ADD CONSTRAINT "product_option_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_option_value" ADD CONSTRAINT "product_option_value_product_option_id_product_option_id_fk" FOREIGN KEY ("product_option_id") REFERENCES "public"."product_option"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_receipt" ADD CONSTRAINT "stock_receipt_variant_id_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variant"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stock_receipt" ADD CONSTRAINT "stock_receipt_source_invoice_upload_id_invoice_upload_id_fk" FOREIGN KEY ("source_invoice_upload_id") REFERENCES "public"."invoice_upload"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "variant" ADD CONSTRAINT "variant_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "variant_option_value" ADD CONSTRAINT "variant_option_value_variant_id_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variant"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "variant_option_value" ADD CONSTRAINT "variant_option_value_product_option_value_id_product_option_value_id_fk" FOREIGN KEY ("product_option_value_id") REFERENCES "public"."product_option_value"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drop" ADD CONSTRAINT "drop_storefront_id_storefront_id_fk" FOREIGN KEY ("storefront_id") REFERENCES "public"."storefront"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drop_allocation" ADD CONSTRAINT "drop_allocation_drop_id_drop_id_fk" FOREIGN KEY ("drop_id") REFERENCES "public"."drop"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "drop_allocation" ADD CONSTRAINT "drop_allocation_variant_id_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variant"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order" ADD CONSTRAINT "order_storefront_id_storefront_id_fk" FOREIGN KEY ("storefront_id") REFERENCES "public"."storefront"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order" ADD CONSTRAINT "order_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order_line_item" ADD CONSTRAINT "order_line_item_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order_line_item" ADD CONSTRAINT "order_line_item_variant_id_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variant"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reservation" ADD CONSTRAINT "reservation_variant_id_variant_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variant"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payout_accrual" ADD CONSTRAINT "payout_accrual_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payout_accrual" ADD CONSTRAINT "payout_accrual_disbursement_id_payout_disbursement_id_fk" FOREIGN KEY ("disbursement_id") REFERENCES "public"."payout_disbursement"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "storefront_slug_unique" ON "storefront" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "storefront_host_hostname_unique" ON "storefront_host" USING btree ("hostname");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_upload_status_created_at_idx" ON "invoice_upload" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoice_upload_sha256_idx" ON "invoice_upload" USING btree ("file_sha256");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_storefront_slug_unique" ON "product" USING btree ("storefront_id","slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_storefront_status_idx" ON "product" USING btree ("storefront_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_option_value_option_value_unique" ON "product_option_value" USING btree ("product_option_id","value");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_receipt_variant_received_at_idx" ON "stock_receipt" USING btree ("variant_id","received_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stock_receipt_invoice_upload_idx" ON "stock_receipt" USING btree ("source_invoice_upload_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "variant_product_sku_unique" ON "variant" USING btree ("product_id","sku");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "variant_product_status_idx" ON "variant" USING btree ("product_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "variant_stripe_price_idx" ON "variant" USING btree ("stripe_price_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "drop_storefront_slug_unique" ON "drop" USING btree ("storefront_id","slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drop_storefront_status_idx" ON "drop" USING btree ("storefront_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drop_starts_at_idx" ON "drop" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "customer_email_idx" ON "customer" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "order_stripe_checkout_session_unique" ON "order" USING btree ("stripe_checkout_session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_storefront_created_at_idx" ON "order" USING btree ("storefront_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_status_idx" ON "order" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_line_item_order_idx" ON "order_line_item" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reservation_session_idx" ON "reservation" USING btree ("stripe_checkout_session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reservation_held_expires_idx" ON "reservation" USING btree ("expires_at") WHERE status = 'held';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stripe_webhook_event_stripe_event_id_unique" ON "stripe_webhook_event" USING btree ("stripe_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payout_accrual_order_unique" ON "payout_accrual" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payout_accrual_status_created_at_idx" ON "payout_accrual" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payout_accrual_disbursement_idx" ON "payout_accrual" USING btree ("disbursement_id");