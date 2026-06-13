CREATE TYPE "public"."comicvine_match_level" AS ENUM('series', 'book');--> statement-breakpoint
CREATE TYPE "public"."comicvine_sync_status" AS ENUM('pending', 'processing', 'failed', 'needs_review');--> statement-breakpoint
CREATE TABLE "comicvine_issue_links" (
	"book_id" uuid PRIMARY KEY NOT NULL,
	"comicvine_issue_row_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comicvine_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comicvine_issue_id" integer NOT NULL,
	"comicvine_volume_id" integer,
	"issue_number" text,
	"name" text,
	"cover_date" date,
	"store_date" date,
	"description" text,
	"image_url" text,
	"site_detail_url" text,
	"person_credits" jsonb DEFAULT '[]'::jsonb,
	"character_credits" jsonb DEFAULT '[]'::jsonb,
	"story_arc_credits" jsonb DEFAULT '[]'::jsonb,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comicvine_sync_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"level" "comicvine_match_level" NOT NULL,
	"series_id" uuid,
	"book_id" uuid,
	"status" "comicvine_sync_status" DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comicvine_volume_links" (
	"series_id" uuid PRIMARY KEY NOT NULL,
	"comicvine_volume_row_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comicvine_volumes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comicvine_volume_id" integer NOT NULL,
	"name" text NOT NULL,
	"start_year" integer,
	"publisher_name" text,
	"count_of_issues" integer,
	"description" text,
	"image_url" text,
	"site_detail_url" text,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "comicvine_api_key" text;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "comicvine_auto_sync_on_import" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "comic_metadata_priority" jsonb;--> statement-breakpoint
ALTER TABLE "comic_books" ADD COLUMN "comicvine_issue_id" integer;--> statement-breakpoint
ALTER TABLE "comic_series" ADD COLUMN "comicvine_volume_id" integer;--> statement-breakpoint
ALTER TABLE "comicvine_issue_links" ADD CONSTRAINT "comicvine_issue_links_book_id_comic_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."comic_books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comicvine_issue_links" ADD CONSTRAINT "comicvine_issue_links_comicvine_issue_row_id_comicvine_issues_id_fk" FOREIGN KEY ("comicvine_issue_row_id") REFERENCES "public"."comicvine_issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comicvine_sync_queue" ADD CONSTRAINT "comicvine_sync_queue_series_id_comic_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."comic_series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comicvine_sync_queue" ADD CONSTRAINT "comicvine_sync_queue_book_id_comic_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."comic_books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comicvine_volume_links" ADD CONSTRAINT "comicvine_volume_links_series_id_comic_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."comic_series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comicvine_volume_links" ADD CONSTRAINT "comicvine_volume_links_comicvine_volume_row_id_comicvine_volumes_id_fk" FOREIGN KEY ("comicvine_volume_row_id") REFERENCES "public"."comicvine_volumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comicvine_issue_links_issue_idx" ON "comicvine_issue_links" USING btree ("comicvine_issue_row_id");--> statement-breakpoint
CREATE UNIQUE INDEX "comicvine_issues_cvid_idx" ON "comicvine_issues" USING btree ("comicvine_issue_id");--> statement-breakpoint
CREATE INDEX "comicvine_issues_volume_idx" ON "comicvine_issues" USING btree ("comicvine_volume_id");--> statement-breakpoint
CREATE INDEX "comicvine_sync_queue_status_idx" ON "comicvine_sync_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "comicvine_sync_queue_created_idx" ON "comicvine_sync_queue" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "comicvine_sync_queue_series_idx" ON "comicvine_sync_queue" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "comicvine_sync_queue_book_idx" ON "comicvine_sync_queue" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "comicvine_volume_links_vol_idx" ON "comicvine_volume_links" USING btree ("comicvine_volume_row_id");--> statement-breakpoint
CREATE UNIQUE INDEX "comicvine_volumes_cvid_idx" ON "comicvine_volumes" USING btree ("comicvine_volume_id");--> statement-breakpoint
CREATE INDEX "comic_books_comicvine_issue_id_idx" ON "comic_books" USING btree ("comicvine_issue_id");--> statement-breakpoint
CREATE INDEX "comic_series_comicvine_volume_id_idx" ON "comic_series" USING btree ("comicvine_volume_id");