CREATE TABLE "shop_orders" (
	"capture_id" text PRIMARY KEY NOT NULL,
	"seller_id" text NOT NULL,
	"order_id" text NOT NULL,
	"item_categories" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "severity" text DEFAULT 'warning' NOT NULL;--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "link" text;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "tracker_id" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "trackers_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_tracker_id_unique" UNIQUE("tracker_id");