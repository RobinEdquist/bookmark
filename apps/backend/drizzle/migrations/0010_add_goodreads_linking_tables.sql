CREATE TABLE "goodreads_audiobook_links" (
	"audiobook_id" uuid PRIMARY KEY NOT NULL,
	"goodreads_book_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goodreads_books" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goodreads_id" text NOT NULL,
	"title" text NOT NULL,
	"author" text NOT NULL,
	"description" text,
	"cover_url" text,
	"url" text NOT NULL,
	"rating" numeric(3, 2),
	"ratings_count" integer,
	"genres" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goodreads_ebook_links" (
	"ebook_id" uuid PRIMARY KEY NOT NULL,
	"goodreads_book_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "goodreads_audiobook_links" ADD CONSTRAINT "goodreads_audiobook_links_audiobook_id_audiobooks_id_fk" FOREIGN KEY ("audiobook_id") REFERENCES "public"."audiobooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goodreads_audiobook_links" ADD CONSTRAINT "goodreads_audiobook_links_goodreads_book_id_goodreads_books_id_fk" FOREIGN KEY ("goodreads_book_id") REFERENCES "public"."goodreads_books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goodreads_ebook_links" ADD CONSTRAINT "goodreads_ebook_links_ebook_id_ebooks_id_fk" FOREIGN KEY ("ebook_id") REFERENCES "public"."ebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goodreads_ebook_links" ADD CONSTRAINT "goodreads_ebook_links_goodreads_book_id_goodreads_books_id_fk" FOREIGN KEY ("goodreads_book_id") REFERENCES "public"."goodreads_books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goodreads_audiobook_links_goodreads_book_id_idx" ON "goodreads_audiobook_links" USING btree ("goodreads_book_id");--> statement-breakpoint
CREATE UNIQUE INDEX "goodreads_books_goodreads_id_idx" ON "goodreads_books" USING btree ("goodreads_id");--> statement-breakpoint
CREATE INDEX "goodreads_ebook_links_goodreads_book_id_idx" ON "goodreads_ebook_links" USING btree ("goodreads_book_id");