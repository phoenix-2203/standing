CREATE TYPE "public"."product_kind" AS ENUM('physical', 'digital', 'service');--> statement-breakpoint
CREATE TABLE "disputes" (
	"dispute_id" text PRIMARY KEY NOT NULL,
	"seller_id" text NOT NULL,
	"created_at_paypal" timestamp with time zone NOT NULL,
	"updated_at_paypal" timestamp with time zone,
	"status" text NOT NULL,
	"reason" text,
	"stage" text,
	"currency" text,
	"amount" numeric(14, 2),
	"seller_transaction_ids" jsonb NOT NULL,
	"raw" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" text NOT NULL,
	"sku" text,
	"name" text NOT NULL,
	"category" text,
	"kind" "product_kind",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" text NOT NULL,
	"transaction_id" text NOT NULL,
	"tracking_number" text,
	"carrier" text,
	"status" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_state" (
	"seller_id" text NOT NULL,
	"job" text NOT NULL,
	"synced_through" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"last_error" text,
	"last_debug_id" text,
	CONSTRAINT "sync_state_seller_id_job_pk" PRIMARY KEY("seller_id","job")
);
--> statement-breakpoint
CREATE TABLE "transaction_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" text NOT NULL,
	"position" integer NOT NULL,
	"name" text,
	"sku" text,
	"quantity" integer,
	"unit_amount" numeric(14, 2)
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"transaction_id" text PRIMARY KEY NOT NULL,
	"seller_id" text NOT NULL,
	"event_code" text NOT NULL,
	"status" text NOT NULL,
	"initiated_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone,
	"currency" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"paypal_reference_id" text,
	"raw" jsonb NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_transaction_id_transactions_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("transaction_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "disputes_seller_created" ON "disputes" USING btree ("seller_id","created_at_paypal");--> statement-breakpoint
CREATE UNIQUE INDEX "products_seller_sku" ON "products" USING btree ("seller_id","sku");--> statement-breakpoint
CREATE UNIQUE INDEX "products_seller_name" ON "products" USING btree ("seller_id","name");--> statement-breakpoint
CREATE INDEX "shipments_transaction" ON "shipments" USING btree ("transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_items_position" ON "transaction_items" USING btree ("transaction_id","position");--> statement-breakpoint
CREATE INDEX "transactions_seller_time" ON "transactions" USING btree ("seller_id","initiated_at");