CREATE TYPE "public"."comic_book_format" AS ENUM('single_issue', 'annual', 'tpb', 'omnibus', 'one_shot', 'special', 'graphic_novel', 'other');--> statement-breakpoint
CREATE TYPE "public"."comic_book_status" AS ENUM('available', 'missing', 'importing', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."comic_container" AS ENUM('cbz', 'cbr', 'pdf');--> statement-breakpoint
CREATE TYPE "public"."comic_creator_role" AS ENUM('writer', 'penciller', 'inker', 'colorist', 'letterer', 'cover_artist', 'editor', 'other');--> statement-breakpoint
CREATE TYPE "public"."comic_series_status" AS ENUM('available', 'missing', 'importing', 'hidden');--> statement-breakpoint
ALTER TYPE "public"."cover_source" ADD VALUE 'folder_image';--> statement-breakpoint
CREATE TABLE "comic_book_creators" (
	"book_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"role" "comic_creator_role" NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "comic_book_creators_book_id_person_id_role_pk" PRIMARY KEY("book_id","person_id","role")
);
--> statement-breakpoint
CREATE TABLE "comic_books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"series_id" uuid NOT NULL,
	"title" text,
	"number" text,
	"sort_number" numeric(8, 2),
	"format" "comic_book_format" DEFAULT 'single_issue' NOT NULL,
	"cover_date" date,
	"store_date" date,
	"summary" text,
	"page_count" integer,
	"file_path" text NOT NULL,
	"file_name" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"container" "comic_container" NOT NULL,
	"cover_url" text,
	"cover_source" "cover_source",
	"status" "comic_book_status" DEFAULT 'available' NOT NULL,
	"missing_at" timestamp,
	"manual_fields" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "comic_books_file_path_unique" UNIQUE("file_path")
);
--> statement-breakpoint
CREATE TABLE "comic_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"sort_title" text,
	"description" text,
	"publisher" text,
	"imprint" text,
	"start_year" integer,
	"total_issue_count" integer,
	"language" text,
	"age_rating" text,
	"cover_url" text,
	"cover_source" "cover_source",
	"folder_path" text NOT NULL,
	"status" "comic_series_status" DEFAULT 'available' NOT NULL,
	"missing_at" timestamp,
	"manual_fields" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "comic_series_folder_path_unique" UNIQUE("folder_path")
);
--> statement-breakpoint
CREATE TABLE "comic_series_genres" (
	"series_id" uuid NOT NULL,
	"genre_id" uuid NOT NULL,
	CONSTRAINT "comic_series_genres_series_id_genre_id_pk" PRIMARY KEY("series_id","genre_id")
);
--> statement-breakpoint
CREATE TABLE "comic_series_tags" (
	"series_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "comic_series_tags_series_id_tag_id_pk" PRIMARY KEY("series_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "comic_library_path" text;--> statement-breakpoint
ALTER TABLE "comic_book_creators" ADD CONSTRAINT "comic_book_creators_book_id_comic_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."comic_books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comic_book_creators" ADD CONSTRAINT "comic_book_creators_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comic_books" ADD CONSTRAINT "comic_books_series_id_comic_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."comic_series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comic_series_genres" ADD CONSTRAINT "comic_series_genres_series_id_comic_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."comic_series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comic_series_genres" ADD CONSTRAINT "comic_series_genres_genre_id_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comic_series_tags" ADD CONSTRAINT "comic_series_tags_series_id_comic_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."comic_series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comic_series_tags" ADD CONSTRAINT "comic_series_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comic_book_creators_book_id_idx" ON "comic_book_creators" USING btree ("book_id");--> statement-breakpoint
CREATE INDEX "comic_book_creators_person_id_idx" ON "comic_book_creators" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "comic_books_series_id_idx" ON "comic_books" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "comic_books_title_idx" ON "comic_books" USING btree ("title");--> statement-breakpoint
CREATE INDEX "comic_books_sort_number_idx" ON "comic_books" USING btree ("sort_number");--> statement-breakpoint
CREATE INDEX "comic_books_cover_date_idx" ON "comic_books" USING btree ("cover_date");--> statement-breakpoint
CREATE INDEX "comic_books_status_idx" ON "comic_books" USING btree ("status");--> statement-breakpoint
CREATE INDEX "comic_books_created_at_idx" ON "comic_books" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "comic_series_title_idx" ON "comic_series" USING btree ("title");--> statement-breakpoint
CREATE INDEX "comic_series_sort_title_idx" ON "comic_series" USING btree ("sort_title");--> statement-breakpoint
CREATE INDEX "comic_series_publisher_idx" ON "comic_series" USING btree ("publisher");--> statement-breakpoint
CREATE INDEX "comic_series_start_year_idx" ON "comic_series" USING btree ("start_year");--> statement-breakpoint
CREATE INDEX "comic_series_status_idx" ON "comic_series" USING btree ("status");--> statement-breakpoint
CREATE INDEX "comic_series_created_at_idx" ON "comic_series" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "comic_series_genres_series_id_idx" ON "comic_series_genres" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "comic_series_genres_genre_id_idx" ON "comic_series_genres" USING btree ("genre_id");--> statement-breakpoint
CREATE INDEX "comic_series_tags_series_id_idx" ON "comic_series_tags" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "comic_series_tags_tag_id_idx" ON "comic_series_tags" USING btree ("tag_id");