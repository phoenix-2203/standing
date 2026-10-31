ALTER TYPE "public"."action_status" ADD VALUE 'sending';--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "summary" text;