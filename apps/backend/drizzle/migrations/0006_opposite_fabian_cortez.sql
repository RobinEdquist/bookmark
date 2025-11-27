CREATE TYPE "public"."audiobook_status" AS ENUM('available', 'missing', 'importing');--> statement-breakpoint
CREATE TYPE "public"."import_error_status" AS ENUM('pending', 'retrying', 'resolved', 'ignored');--> statement-breakpoint
CREATE TABLE "import_errors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_path" text NOT NULL,
	"error_message" text NOT NULL,
	"error_code" text,
	"error_details" jsonb,
	"status" "import_error_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 1 NOT NULL,
	"first_occurred_at" timestamp DEFAULT now() NOT NULL,
	"last_occurred_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	"ignored_at" timestamp,
	"ignored_by" text
);
--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "watcher_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "metadata_priority" jsonb;--> statement-breakpoint
ALTER TABLE "audiobooks" ADD COLUMN "status" "audiobook_status" DEFAULT 'available' NOT NULL;--> statement-breakpoint
ALTER TABLE "audiobooks" ADD COLUMN "missing_at" timestamp;--> statement-breakpoint
ALTER TABLE "import_errors" ADD CONSTRAINT "import_errors_ignored_by_user_id_fk" FOREIGN KEY ("ignored_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_errors_status_idx" ON "import_errors" USING btree ("status");--> statement-breakpoint
CREATE INDEX "import_errors_file_path_idx" ON "import_errors" USING btree ("file_path");--> statement-breakpoint
CREATE INDEX "audiobooks_status_idx" ON "audiobooks" USING btree ("status");