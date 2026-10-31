CREATE TYPE "public"."evidence_kind" AS ENUM('txn', 'delivery', 'digital_delivery', 'invoice', 'traffic_source', 'sales_summary');--> statement-breakpoint
CREATE TABLE "evidence_items" (
	"seller_id" text NOT NULL,
	"id" text NOT NULL,
	"kind" "evidence_kind" NOT NULL,
	"transaction_id" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"summary" text NOT NULL,
	"facts" jsonb NOT NULL,
	"source" text NOT NULL,
	"simulated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "evidence_items_seller_id_id_pk" PRIMARY KEY("seller_id","id")
);
--> statement-breakpoint
CREATE INDEX "evidence_seller_kind" ON "evidence_items" USING btree ("seller_id","kind");