CREATE TYPE "public"."reading_list_media_type" AS ENUM('audiobook', 'ebook', 'comic');--> statement-breakpoint
CREATE TABLE "reading_list_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reading_list_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"comic_book_id" uuid,
	"audiobook_id" uuid,
	"ebook_id" uuid,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reading_list_entries_comic_book_unique" UNIQUE("reading_list_id","comic_book_id"),
	CONSTRAINT "reading_list_entries_audiobook_unique" UNIQUE("reading_list_id","audiobook_id"),
	CONSTRAINT "reading_list_entries_ebook_unique" UNIQUE("reading_list_id","ebook_id"),
	CONSTRAINT "reading_list_entries_one_item" CHECK (num_nonnulls("reading_list_entries"."comic_book_id", "reading_list_entries"."audiobook_id", "reading_list_entries"."ebook_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "reading_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_type" "reading_list_media_type" NOT NULL,
	"name" text NOT NULL,
	"sort_name" text,
	"description" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reading_list_entries" ADD CONSTRAINT "reading_list_entries_reading_list_id_reading_lists_id_fk" FOREIGN KEY ("reading_list_id") REFERENCES "public"."reading_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_list_entries" ADD CONSTRAINT "reading_list_entries_comic_book_id_comic_books_id_fk" FOREIGN KEY ("comic_book_id") REFERENCES "public"."comic_books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_list_entries" ADD CONSTRAINT "reading_list_entries_audiobook_id_audiobooks_id_fk" FOREIGN KEY ("audiobook_id") REFERENCES "public"."audiobooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_list_entries" ADD CONSTRAINT "reading_list_entries_ebook_id_ebooks_id_fk" FOREIGN KEY ("ebook_id") REFERENCES "public"."ebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_lists" ADD CONSTRAINT "reading_lists_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reading_list_entries_list_position_idx" ON "reading_list_entries" USING btree ("reading_list_id","position");--> statement-breakpoint
CREATE INDEX "reading_list_entries_comic_book_id_idx" ON "reading_list_entries" USING btree ("comic_book_id");--> statement-breakpoint
CREATE INDEX "reading_list_entries_audiobook_id_idx" ON "reading_list_entries" USING btree ("audiobook_id");--> statement-breakpoint
CREATE INDEX "reading_list_entries_ebook_id_idx" ON "reading_list_entries" USING btree ("ebook_id");--> statement-breakpoint
CREATE INDEX "reading_lists_media_type_idx" ON "reading_lists" USING btree ("media_type");--> statement-breakpoint
CREATE INDEX "reading_lists_name_idx" ON "reading_lists" USING btree ("name");