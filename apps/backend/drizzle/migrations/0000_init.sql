CREATE TYPE "public"."audiobook_status" AS ENUM('available', 'missing', 'importing', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."chapter_source" AS ENUM('embedded', 'manual', 'external');--> statement-breakpoint
CREATE TYPE "public"."cover_source" AS ENUM('embedded', 'uploaded');--> statement-breakpoint
CREATE TYPE "public"."ebook_status" AS ENUM('available', 'missing', 'importing', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."hardcover_sync_status" AS ENUM('pending', 'processing', 'failed');--> statement-breakpoint
CREATE TYPE "public"."import_error_status" AS ENUM('pending', 'retrying', 'resolved', 'ignored');--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" text PRIMARY KEY DEFAULT 'app_settings' NOT NULL,
	"signups_enabled" boolean DEFAULT true NOT NULL,
	"audiobook_library_path" text,
	"ebook_library_path" text,
	"watcher_enabled" boolean DEFAULT true NOT NULL,
	"metadata_priority" jsonb,
	"hardcover_api_key" text,
	"hardcover_auto_sync_on_import" boolean DEFAULT false NOT NULL,
	"opds_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "single_row" CHECK ("app_settings"."id" = 'app_settings')
);
--> statement-breakpoint
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
	"status" "audiobook_status" DEFAULT 'available' NOT NULL,
	"missing_at" timestamp,
	"manual_fields" jsonb DEFAULT '[]'::jsonb,
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
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"language" text DEFAULT 'en' NOT NULL,
	"theme" text DEFAULT 'default' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"role" text,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "hardcover_audiobook_links" (
	"audiobook_id" uuid PRIMARY KEY NOT NULL,
	"hardcover_book_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hardcover_books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hardcover_id" text NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"author_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content_warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"featured_series_name" text,
	"featured_series_position" numeric(5, 1),
	"genres" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"image_url" text,
	"isbns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"moods" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rating" numeric(3, 2),
	"ratings_count" integer,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hardcover_ebook_links" (
	"ebook_id" uuid PRIMARY KEY NOT NULL,
	"hardcover_book_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hardcover_sync_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audiobook_id" uuid,
	"ebook_id" uuid,
	"status" "hardcover_sync_status" DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "listening_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"audiobook_id" uuid NOT NULL,
	"started_at" timestamp NOT NULL,
	"ended_at" timestamp NOT NULL,
	"duration_seconds" integer NOT NULL,
	"start_position" integer NOT NULL,
	"end_position" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_audiobook_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"audiobook_id" uuid NOT NULL,
	"current_position" integer DEFAULT 0 NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_audiobook_progress_unique" UNIQUE("user_id","audiobook_id")
);
--> statement-breakpoint
CREATE TABLE "user_blacklisted_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_permissions" (
	"user_id" text PRIMARY KEY NOT NULL,
	"can_edit_metadata" boolean DEFAULT false NOT NULL,
	"can_upload_audiobooks" boolean DEFAULT false NOT NULL,
	"can_delete_audiobooks" boolean DEFAULT false NOT NULL,
	"can_generate_api_keys" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_key" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"start" text,
	"prefix" text,
	"key" text NOT NULL,
	"user_id" text NOT NULL,
	"remaining" integer,
	"refill_amount" integer,
	"refill_interval" integer,
	"last_refill_at" timestamp,
	"enabled" boolean DEFAULT true NOT NULL,
	"rate_limit_enabled" boolean,
	"rate_limit_time_window" integer,
	"rate_limit_max" integer,
	"request_count" integer,
	"last_request" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"permissions" text,
	"metadata" text
);
--> statement-breakpoint
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
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ebook_authors" ADD CONSTRAINT "ebook_authors_ebook_id_ebooks_id_fk" FOREIGN KEY ("ebook_id") REFERENCES "public"."ebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ebook_authors" ADD CONSTRAINT "ebook_authors_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ebook_genres" ADD CONSTRAINT "ebook_genres_ebook_id_ebooks_id_fk" FOREIGN KEY ("ebook_id") REFERENCES "public"."ebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ebook_genres" ADD CONSTRAINT "ebook_genres_genre_id_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ebook_series" ADD CONSTRAINT "ebook_series_ebook_id_ebooks_id_fk" FOREIGN KEY ("ebook_id") REFERENCES "public"."ebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ebook_series" ADD CONSTRAINT "ebook_series_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ebook_tags" ADD CONSTRAINT "ebook_tags_ebook_id_ebooks_id_fk" FOREIGN KEY ("ebook_id") REFERENCES "public"."ebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ebook_tags" ADD CONSTRAINT "ebook_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hardcover_audiobook_links" ADD CONSTRAINT "hardcover_audiobook_links_audiobook_id_audiobooks_id_fk" FOREIGN KEY ("audiobook_id") REFERENCES "public"."audiobooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hardcover_audiobook_links" ADD CONSTRAINT "hardcover_audiobook_links_hardcover_book_id_hardcover_books_id_fk" FOREIGN KEY ("hardcover_book_id") REFERENCES "public"."hardcover_books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hardcover_ebook_links" ADD CONSTRAINT "hardcover_ebook_links_ebook_id_ebooks_id_fk" FOREIGN KEY ("ebook_id") REFERENCES "public"."ebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hardcover_ebook_links" ADD CONSTRAINT "hardcover_ebook_links_hardcover_book_id_hardcover_books_id_fk" FOREIGN KEY ("hardcover_book_id") REFERENCES "public"."hardcover_books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hardcover_sync_queue" ADD CONSTRAINT "hardcover_sync_queue_audiobook_id_audiobooks_id_fk" FOREIGN KEY ("audiobook_id") REFERENCES "public"."audiobooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hardcover_sync_queue" ADD CONSTRAINT "hardcover_sync_queue_ebook_id_ebooks_id_fk" FOREIGN KEY ("ebook_id") REFERENCES "public"."ebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_errors" ADD CONSTRAINT "import_errors_ignored_by_user_id_fk" FOREIGN KEY ("ignored_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listening_sessions" ADD CONSTRAINT "listening_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listening_sessions" ADD CONSTRAINT "listening_sessions_audiobook_id_audiobooks_id_fk" FOREIGN KEY ("audiobook_id") REFERENCES "public"."audiobooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_audiobook_progress" ADD CONSTRAINT "user_audiobook_progress_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_audiobook_progress" ADD CONSTRAINT "user_audiobook_progress_audiobook_id_audiobooks_id_fk" FOREIGN KEY ("audiobook_id") REFERENCES "public"."audiobooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blacklisted_tags" ADD CONSTRAINT "user_blacklisted_tags_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blacklisted_tags" ADD CONSTRAINT "user_blacklisted_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
CREATE INDEX "audiobooks_status_idx" ON "audiobooks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "chapters_audiobook_id_idx" ON "chapters" USING btree ("audiobook_id");--> statement-breakpoint
CREATE INDEX "people_name_idx" ON "people" USING btree ("name");--> statement-breakpoint
CREATE INDEX "series_name_idx" ON "series" USING btree ("name");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
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
CREATE INDEX "ebooks_status_idx" ON "ebooks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "hardcover_audiobook_links_hardcover_book_id_idx" ON "hardcover_audiobook_links" USING btree ("hardcover_book_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hardcover_books_hardcover_id_idx" ON "hardcover_books" USING btree ("hardcover_id");--> statement-breakpoint
CREATE INDEX "hardcover_ebook_links_hardcover_book_id_idx" ON "hardcover_ebook_links" USING btree ("hardcover_book_id");--> statement-breakpoint
CREATE INDEX "hardcover_sync_queue_status_idx" ON "hardcover_sync_queue" USING btree ("status");--> statement-breakpoint
CREATE INDEX "hardcover_sync_queue_created_at_idx" ON "hardcover_sync_queue" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "hardcover_sync_queue_audiobook_id_idx" ON "hardcover_sync_queue" USING btree ("audiobook_id");--> statement-breakpoint
CREATE INDEX "hardcover_sync_queue_ebook_id_idx" ON "hardcover_sync_queue" USING btree ("ebook_id");--> statement-breakpoint
CREATE INDEX "import_errors_status_idx" ON "import_errors" USING btree ("status");--> statement-breakpoint
CREATE INDEX "import_errors_file_path_idx" ON "import_errors" USING btree ("file_path");--> statement-breakpoint
CREATE INDEX "listening_sessions_user_started_idx" ON "listening_sessions" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "listening_sessions_audiobook_id_idx" ON "listening_sessions" USING btree ("audiobook_id");--> statement-breakpoint
CREATE INDEX "user_audiobook_progress_user_id_idx" ON "user_audiobook_progress" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_audiobook_progress_audiobook_id_idx" ON "user_audiobook_progress" USING btree ("audiobook_id");--> statement-breakpoint
CREATE INDEX "user_audiobook_progress_updated_at_idx" ON "user_audiobook_progress" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "user_blacklisted_tags_user_id_idx" ON "user_blacklisted_tags" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_blacklisted_tags_tag_id_idx" ON "user_blacklisted_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "api_key_user_id_idx" ON "api_key" USING btree ("user_id");