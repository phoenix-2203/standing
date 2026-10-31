CREATE TYPE "public"."alert_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" "alert_status" DEFAULT 'open' NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"facts" jsonb NOT NULL,
	"first_fired_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_one_open" ON "alerts" USING btree ("seller_id","kind") WHERE "alerts"."status" = 'open';