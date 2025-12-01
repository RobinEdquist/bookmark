CREATE TYPE "public"."ebook_status" AS ENUM('available', 'missing', 'importing', 'hidden');--> statement-breakpoint
CREATE TABLE "ebook_authors" (
	"ebook_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ebook_authors_ebook_id_person_id_pk" PRIMARY KEY("ebook_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "ebook_genres" (
	"ebook_id" uuid NOT NULL,
	"genre_id" uuid NOT NULL,
	CONSTRAINT "ebook_genres_ebook_id_genre_id_pk" PRIMARY KEY("ebook_id","genre_id")
);
--> statement-breakpoint
CREATE TABLE "ebook_series" (
	"ebook_id" uuid NOT NULL,
	"series_id" uuid NOT NULL,
	"order" numeric(5, 1) NOT NULL,
	CONSTRAINT "ebook_series_ebook_id_series_id_pk" PRIMARY KEY("ebook_id","series_id")
);
--> statement-breakpoint
CREATE TABLE "ebook_tags" (
	"ebook_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "ebook_tags_ebook_id_tag_id_pk" PRIMARY KEY("ebook_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "ebooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"description" text,
	"publisher" text,
	"language" text,
	"published_date" date,
	"isbn" text,
	"asin" text,
	"page_count" integer,
	"cover_url" text,
	"cover_source" "cover_source",
	"file_path" text NOT NULL,
	"file_name" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"format" text DEFAULT 'epub' NOT NULL,
	"is_explicit" boolean DEFAULT false NOT NULL,
	"status" "ebook_status" DEFAULT 'available' NOT NULL,
	"missing_at" timestamp,
	"manual_fields" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ebook_authors" ADD CONSTRAINT "ebook_authors_ebook_id_ebooks_id_fk" FOREIGN KEY ("ebook_id") REFERENCES "public"."ebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ebook_authors" ADD CONSTRAINT "ebook_authors_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ebook_genres" ADD CONSTRAINT "ebook_genres_ebook_id_ebooks_id_fk" FOREIGN KEY ("ebook_id") REFERENCES "public"."ebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ebook_genres" ADD CONSTRAINT "ebook_genres_genre_id_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ebook_series" ADD CONSTRAINT "ebook_series_ebook_id_ebooks_id_fk" FOREIGN KEY ("ebook_id") REFERENCES "public"."ebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ebook_series" ADD CONSTRAINT "ebook_series_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ebook_tags" ADD CONSTRAINT "ebook_tags_ebook_id_ebooks_id_fk" FOREIGN KEY ("ebook_id") REFERENCES "public"."ebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ebook_tags" ADD CONSTRAINT "ebook_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ebook_authors_ebook_id_idx" ON "ebook_authors" USING btree ("ebook_id");--> statement-breakpoint
CREATE INDEX "ebook_authors_person_id_idx" ON "ebook_authors" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "ebook_genres_ebook_id_idx" ON "ebook_genres" USING btree ("ebook_id");--> statement-breakpoint
CREATE INDEX "ebook_genres_genre_id_idx" ON "ebook_genres" USING btree ("genre_id");--> statement-breakpoint
CREATE INDEX "ebook_series_ebook_id_idx" ON "ebook_series" USING btree ("ebook_id");--> statement-breakpoint
CREATE INDEX "ebook_series_series_id_idx" ON "ebook_series" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "ebook_tags_ebook_id_idx" ON "ebook_tags" USING btree ("ebook_id");--> statement-breakpoint
CREATE INDEX "ebook_tags_tag_id_idx" ON "ebook_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "ebooks_title_idx" ON "ebooks" USING btree ("title");--> statement-breakpoint
CREATE INDEX "ebooks_subtitle_idx" ON "ebooks" USING btree ("subtitle");--> statement-breakpoint
CREATE INDEX "ebooks_created_at_idx" ON "ebooks" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ebooks_language_idx" ON "ebooks" USING btree ("language");--> statement-breakpoint
CREATE INDEX "ebooks_status_idx" ON "ebooks" USING btree ("status");