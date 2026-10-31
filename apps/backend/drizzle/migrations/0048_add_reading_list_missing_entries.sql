ALTER TABLE "reading_list_entries" DROP CONSTRAINT "reading_list_entries_one_item";--> statement-breakpoint
ALTER TABLE "reading_list_entries" ADD COLUMN "missing_title" text;--> statement-breakpoint
ALTER TABLE "reading_list_entries" ADD COLUMN "comicvine_issue_id" integer;--> statement-breakpoint
ALTER TABLE "reading_list_entries" ADD COLUMN "comicvine_volume_id" integer;--> statement-breakpoint
ALTER TABLE "reading_list_entries" ADD COLUMN "issue_number" text;--> statement-breakpoint
CREATE INDEX "reading_list_entries_comicvine_issue_id_idx" ON "reading_list_entries" USING btree ("comicvine_issue_id");--> statement-breakpoint
CREATE INDEX "reading_list_entries_comicvine_volume_id_idx" ON "reading_list_entries" USING btree ("comicvine_volume_id");--> statement-breakpoint
ALTER TABLE "reading_list_entries" ADD CONSTRAINT "reading_list_entries_one_item" CHECK (num_nonnulls("reading_list_entries"."comic_book_id", "reading_list_entries"."audiobook_id", "reading_list_entries"."ebook_id", "reading_list_entries"."missing_title") = 1);