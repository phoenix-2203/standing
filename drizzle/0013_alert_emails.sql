CREATE TABLE "alert_emails" (
	"alert_id" uuid PRIMARY KEY NOT NULL,
	"seller_id" text NOT NULL,
	"status" text NOT NULL,
	"provider_id" text,
	"error" text,
	"attempts" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
