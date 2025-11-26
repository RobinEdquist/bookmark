CREATE TYPE "public"."chapter_source" AS ENUM('embedded', 'manual', 'external');--> statement-breakpoint
CREATE TYPE "public"."cover_source" AS ENUM('embedded', 'uploaded');--> statement-breakpoint
CREATE TABLE "audiobook_authors" (
	"audiobook_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "audiobook_authors_audiobook_id_person_id_pk" PRIMARY KEY("audiobook_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "audiobook_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audiobook_id" uuid NOT NULL,
	"file_path" text NOT NULL,
	"file_name" text NOT NULL,
	"order" integer NOT NULL,
	"duration" integer NOT NULL,
	"format" text NOT NULL,
	"bitrate" integer,
	"sample_rate" integer,
	"size_bytes" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audiobook_genres" (
	"audiobook_id" uuid NOT NULL,
	"genre_id" uuid NOT NULL,
	CONSTRAINT "audiobook_genres_audiobook_id_genre_id_pk" PRIMARY KEY("audiobook_id","genre_id")
);
--> statement-breakpoint
CREATE TABLE "audiobook_narrators" (
	"audiobook_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "audiobook_narrators_audiobook_id_person_id_pk" PRIMARY KEY("audiobook_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "audiobook_series" (
	"audiobook_id" uuid NOT NULL,
	"series_id" uuid NOT NULL,
	"order" numeric(5, 1) NOT NULL,
	CONSTRAINT "audiobook_series_audiobook_id_series_id_pk" PRIMARY KEY("audiobook_id","series_id")
);
--> statement-breakpoint
CREATE TABLE "audiobook_tags" (
	"audiobook_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "audiobook_tags_audiobook_id_tag_id_pk" PRIMARY KEY("audiobook_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "audiobooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"subtitle" text,
	"description" text,
	"publisher" text,
	"language" text,
	"published_date" date,
	"isbn" text,
	"asin" text,
	"duration" integer,
	"cover_url" text,
	"cover_source" "cover_source",
	"file_path" text NOT NULL,
	"is_explicit" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chapters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audiobook_id" uuid NOT NULL,
	"title" text NOT NULL,
	"start_time" integer NOT NULL,
	"end_time" integer,
	"order" integer NOT NULL,
	"source" "chapter_source" DEFAULT 'embedded' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "genres" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "genres_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"bio" text,
	"image_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "user_blacklisted_tags" DROP COLUMN "tag";--> statement-breakpoint
ALTER TABLE "user_blacklisted_tags" ADD COLUMN "tag_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "audiobook_authors" ADD CONSTRAINT "audiobook_authors_audiobook_id_audiobooks_id_fk" FOREIGN KEY ("audiobook_id") REFERENCES "public"."audiobooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audiobook_authors" ADD CONSTRAINT "audiobook_authors_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audiobook_files" ADD CONSTRAINT "audiobook_files_audiobook_id_audiobooks_id_fk" FOREIGN KEY ("audiobook_id") REFERENCES "public"."audiobooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audiobook_genres" ADD CONSTRAINT "audiobook_genres_audiobook_id_audiobooks_id_fk" FOREIGN KEY ("audiobook_id") REFERENCES "public"."audiobooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audiobook_genres" ADD CONSTRAINT "audiobook_genres_genre_id_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audiobook_narrators" ADD CONSTRAINT "audiobook_narrators_audiobook_id_audiobooks_id_fk" FOREIGN KEY ("audiobook_id") REFERENCES "public"."audiobooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audiobook_narrators" ADD CONSTRAINT "audiobook_narrators_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audiobook_series" ADD CONSTRAINT "audiobook_series_audiobook_id_audiobooks_id_fk" FOREIGN KEY ("audiobook_id") REFERENCES "public"."audiobooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audiobook_series" ADD CONSTRAINT "audiobook_series_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audiobook_tags" ADD CONSTRAINT "audiobook_tags_audiobook_id_audiobooks_id_fk" FOREIGN KEY ("audiobook_id") REFERENCES "public"."audiobooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audiobook_tags" ADD CONSTRAINT "audiobook_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_audiobook_id_audiobooks_id_fk" FOREIGN KEY ("audiobook_id") REFERENCES "public"."audiobooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audiobook_authors_audiobook_id_idx" ON "audiobook_authors" USING btree ("audiobook_id");--> statement-breakpoint
CREATE INDEX "audiobook_authors_person_id_idx" ON "audiobook_authors" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "audiobook_files_audiobook_id_idx" ON "audiobook_files" USING btree ("audiobook_id");--> statement-breakpoint
CREATE INDEX "audiobook_genres_audiobook_id_idx" ON "audiobook_genres" USING btree ("audiobook_id");--> statement-breakpoint
CREATE INDEX "audiobook_genres_genre_id_idx" ON "audiobook_genres" USING btree ("genre_id");--> statement-breakpoint
CREATE INDEX "audiobook_narrators_audiobook_id_idx" ON "audiobook_narrators" USING btree ("audiobook_id");--> statement-breakpoint
CREATE INDEX "audiobook_narrators_person_id_idx" ON "audiobook_narrators" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "audiobook_series_audiobook_id_idx" ON "audiobook_series" USING btree ("audiobook_id");--> statement-breakpoint
CREATE INDEX "audiobook_series_series_id_idx" ON "audiobook_series" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "audiobook_tags_audiobook_id_idx" ON "audiobook_tags" USING btree ("audiobook_id");--> statement-breakpoint
CREATE INDEX "audiobook_tags_tag_id_idx" ON "audiobook_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "audiobooks_title_idx" ON "audiobooks" USING btree ("title");--> statement-breakpoint
CREATE INDEX "audiobooks_subtitle_idx" ON "audiobooks" USING btree ("subtitle");--> statement-breakpoint
CREATE INDEX "audiobooks_created_at_idx" ON "audiobooks" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audiobooks_language_idx" ON "audiobooks" USING btree ("language");--> statement-breakpoint
CREATE INDEX "chapters_audiobook_id_idx" ON "chapters" USING btree ("audiobook_id");--> statement-breakpoint
CREATE INDEX "people_name_idx" ON "people" USING btree ("name");--> statement-breakpoint
CREATE INDEX "series_name_idx" ON "series" USING btree ("name");--> statement-breakpoint
ALTER TABLE "user_blacklisted_tags" ADD CONSTRAINT "user_blacklisted_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_blacklisted_tags_tag_id_idx" ON "user_blacklisted_tags" USING btree ("tag_id");