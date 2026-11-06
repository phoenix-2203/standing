CREATE TYPE "public"."verification_status" AS ENUM('verified', 'unverified', 'unreadable');--> statement-breakpoint
CREATE TABLE "paypal_connections" (
	"seller_id" text PRIMARY KEY NOT NULL,
	"verification" "verification_status" NOT NULL,
	"payer_id" text,
	"debug_id" text,
	"last_error" text,
	"checked_at" timestamp with time zone NOT NULL
);
