CREATE TYPE "public"."action_status" AS ENUM('preview', 'scheduled', 'sent', 'cancelled', 'failed', 'unknown');--> statement-breakpoint
CREATE TABLE "actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"payload" jsonb,
	"request_id" text NOT NULL,
	"status" "action_status" DEFAULT 'preview' NOT NULL,
	"undo_until" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"paypal_http_status" integer,
	"paypal_debug_id" text,
	"paypal_response" jsonb,
	"responded_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "actions_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"resource_type" text,
	"transmission_id" text NOT NULL,
	"verify_debug_id" text,
	"body" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
