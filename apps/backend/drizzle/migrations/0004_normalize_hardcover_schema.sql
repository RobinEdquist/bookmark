CREATE TABLE "hardcover_audiobook_links" (
	"audiobook_id" uuid PRIMARY KEY NOT NULL,
	"hardcover_book_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hardcover_ebook_links" (
	"ebook_id" uuid PRIMARY KEY NOT NULL,
	"hardcover_book_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hardcover_books" DROP CONSTRAINT "hardcover_books_audiobook_id_unique";--> statement-breakpoint
ALTER TABLE "hardcover_sync_queue" DROP CONSTRAINT "hardcover_sync_queue_audiobook_id_unique";--> statement-breakpoint
ALTER TABLE "hardcover_books" DROP CONSTRAINT "hardcover_books_audiobook_id_audiobooks_id_fk";
--> statement-breakpoint
DROP INDEX "hardcover_books_audiobook_id_idx";--> statement-breakpoint
DROP INDEX "hardcover_books_hardcover_id_idx";--> statement-breakpoint
ALTER TABLE "hardcover_sync_queue" ALTER COLUMN "audiobook_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "hardcover_sync_queue" ADD COLUMN "ebook_id" uuid;--> statement-breakpoint
ALTER TABLE "hardcover_audiobook_links" ADD CONSTRAINT "hardcover_audiobook_links_audiobook_id_audiobooks_id_fk" FOREIGN KEY ("audiobook_id") REFERENCES "public"."audiobooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hardcover_audiobook_links" ADD CONSTRAINT "hardcover_audiobook_links_hardcover_book_id_hardcover_books_id_fk" FOREIGN KEY ("hardcover_book_id") REFERENCES "public"."hardcover_books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hardcover_ebook_links" ADD CONSTRAINT "hardcover_ebook_links_ebook_id_ebooks_id_fk" FOREIGN KEY ("ebook_id") REFERENCES "public"."ebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hardcover_ebook_links" ADD CONSTRAINT "hardcover_ebook_links_hardcover_book_id_hardcover_books_id_fk" FOREIGN KEY ("hardcover_book_id") REFERENCES "public"."hardcover_books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hardcover_audiobook_links_hardcover_book_id_idx" ON "hardcover_audiobook_links" USING btree ("hardcover_book_id");--> statement-breakpoint
CREATE INDEX "hardcover_ebook_links_hardcover_book_id_idx" ON "hardcover_ebook_links" USING btree ("hardcover_book_id");--> statement-breakpoint
ALTER TABLE "hardcover_sync_queue" ADD CONSTRAINT "hardcover_sync_queue_ebook_id_ebooks_id_fk" FOREIGN KEY ("ebook_id") REFERENCES "public"."ebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hardcover_sync_queue_audiobook_id_idx" ON "hardcover_sync_queue" USING btree ("audiobook_id");--> statement-breakpoint
CREATE INDEX "hardcover_sync_queue_ebook_id_idx" ON "hardcover_sync_queue" USING btree ("ebook_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hardcover_books_hardcover_id_idx" ON "hardcover_books" USING btree ("hardcover_id");--> statement-breakpoint
ALTER TABLE "hardcover_books" DROP COLUMN "audiobook_id";