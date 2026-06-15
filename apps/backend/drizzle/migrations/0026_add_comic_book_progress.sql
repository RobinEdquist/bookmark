CREATE TYPE "public"."comic_read_status" AS ENUM('unread', 'in_progress', 'finished');--> statement-breakpoint
CREATE TABLE "comic_book_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"comic_book_id" uuid NOT NULL,
	"current_page" integer DEFAULT 0 NOT NULL,
	"page_count" integer DEFAULT 0 NOT NULL,
	"status" "comic_read_status" DEFAULT 'in_progress' NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "comic_book_progress_unique" UNIQUE("user_id","comic_book_id")
);
--> statement-breakpoint
ALTER TABLE "comic_book_progress" ADD CONSTRAINT "comic_book_progress_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comic_book_progress" ADD CONSTRAINT "comic_book_progress_comic_book_id_comic_books_id_fk" FOREIGN KEY ("comic_book_id") REFERENCES "public"."comic_books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comic_book_progress_user_id_idx" ON "comic_book_progress" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "comic_book_progress_comic_book_id_idx" ON "comic_book_progress" USING btree ("comic_book_id");--> statement-breakpoint
CREATE INDEX "comic_book_progress_user_status_idx" ON "comic_book_progress" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "comic_book_progress_updated_at_idx" ON "comic_book_progress" USING btree ("updated_at");