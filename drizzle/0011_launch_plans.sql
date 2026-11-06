CREATE TABLE "launch_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" text NOT NULL,
	"launch_date" date NOT NULL,
	"expected_multiple" numeric(6, 2) NOT NULL,
	"products" jsonb NOT NULL,
	"policy" jsonb NOT NULL,
	"pack_id" uuid,
	"pack_built_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
