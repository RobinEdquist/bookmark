CREATE TABLE "hardcover_books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audiobook_id" uuid NOT NULL,
	"hardcover_id" text NOT NULL,
	"title" text NOT NULL,
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
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hardcover_books_audiobook_id_unique" UNIQUE("audiobook_id")
);
--> statement-breakpoint
ALTER TABLE "hardcover_books" ADD CONSTRAINT "hardcover_books_audiobook_id_audiobooks_id_fk" FOREIGN KEY ("audiobook_id") REFERENCES "public"."audiobooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hardcover_books_audiobook_id_idx" ON "hardcover_books" USING btree ("audiobook_id");--> statement-breakpoint
CREATE INDEX "hardcover_books_hardcover_id_idx" ON "hardcover_books" USING btree ("hardcover_id");