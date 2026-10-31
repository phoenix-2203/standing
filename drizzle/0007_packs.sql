CREATE TYPE "public"."pack_status" AS ENUM('draft', 'blocked', 'ready');--> statement-breakpoint
CREATE TABLE "packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" text NOT NULL,
	"period_from" timestamp with time zone NOT NULL,
	"period_to" timestamp with time zone NOT NULL,
	"status" "pack_status" DEFAULT 'draft' NOT NULL,
	"sales_curve" jsonb NOT NULL,
	"summary_evidence_id" text NOT NULL,
	"letter" jsonb,
	"evidence" jsonb NOT NULL,
	"validation" jsonb,
	"provider" text,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
