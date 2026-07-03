CREATE TYPE "public"."tts_job_status" AS ENUM('pending', 'extracting', 'generating', 'assembling', 'importing', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "tts_generation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ebook_id" uuid NOT NULL,
	"audiobook_id" uuid,
	"status" "tts_job_status" DEFAULT 'pending' NOT NULL,
	"voice" text NOT NULL,
	"speed" real DEFAULT 1 NOT NULL,
	"model" text DEFAULT 'kokoro' NOT NULL,
	"total_chapters" integer,
	"completed_chapters" integer DEFAULT 0 NOT NULL,
	"current_chapter_title" text,
	"total_characters" integer,
	"cancel_requested" boolean DEFAULT false NOT NULL,
	"error_message" text,
	"warning_message" text,
	"requested_by" text,
	"started_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "tts_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "tts_base_url" text;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "tts_api_key" text;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "tts_voice" text DEFAULT 'af_heart' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "tts_speed" real DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "tts_model" text DEFAULT 'kokoro' NOT NULL;--> statement-breakpoint
ALTER TABLE "audiobooks" ADD COLUMN "generated_from_ebook_id" uuid;--> statement-breakpoint
ALTER TABLE "tts_generation_jobs" ADD CONSTRAINT "tts_generation_jobs_ebook_id_ebooks_id_fk" FOREIGN KEY ("ebook_id") REFERENCES "public"."ebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tts_generation_jobs" ADD CONSTRAINT "tts_generation_jobs_audiobook_id_audiobooks_id_fk" FOREIGN KEY ("audiobook_id") REFERENCES "public"."audiobooks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tts_jobs_status_idx" ON "tts_generation_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tts_jobs_ebook_id_idx" ON "tts_generation_jobs" USING btree ("ebook_id");--> statement-breakpoint
CREATE INDEX "tts_jobs_created_at_idx" ON "tts_generation_jobs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tts_jobs_active_ebook_uq" ON "tts_generation_jobs" USING btree ("ebook_id") WHERE "tts_generation_jobs"."status" IN ('pending', 'extracting', 'generating', 'assembling', 'importing');--> statement-breakpoint
ALTER TABLE "audiobooks" ADD CONSTRAINT "audiobooks_generated_from_ebook_id_ebooks_id_fk" FOREIGN KEY ("generated_from_ebook_id") REFERENCES "public"."ebooks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audiobooks_generated_from_ebook_id_idx" ON "audiobooks" USING btree ("generated_from_ebook_id");