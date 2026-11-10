CREATE TABLE "demo_workspaces" (
	"seller_id" text PRIMARY KEY NOT NULL,
	"source_seller_id" text NOT NULL,
	"asks" integer DEFAULT 0 NOT NULL,
	"packs" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
