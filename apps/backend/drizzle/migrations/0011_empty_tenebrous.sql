CREATE TYPE "public"."hardcover_sync_status" AS ENUM('pending', 'processing', 'failed');--> statement-breakpoint
CREATE TABLE "hardcover_sync_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audiobook_id" uuid NOT NULL,
	"status" "hardcover_sync_status" DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hardcover_sync_queue_audiobook_id_unique" UNIQUE("audiobook_id")
);
--> statement-breakpoint
ALTER TABLE "hardcover_sync_queue" ADD CONSTRAINT "hardcover_sync_queue_audiobook_id_audiobooks_id_fk" FOREIGN KEY ("audiobook_id") REFERENCES "public"."audiobooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hardcover_sync_queue_status_idx" ON "hardcover_sync_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "hardcover_sync_queue_created_at_idx" ON "hardcover_sync_queue" USING btree ("created_at");