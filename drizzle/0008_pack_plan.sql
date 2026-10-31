ALTER TABLE "packs" ADD COLUMN "plan" jsonb;--> statement-breakpoint
ALTER TABLE "packs" ADD COLUMN "facts" jsonb;--> statement-breakpoint
ALTER TABLE "packs" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;