CREATE TYPE "public"."comic_metadata_tag_type" AS ENUM('story_arc', 'character', 'team', 'location');--> statement-breakpoint
CREATE TABLE "comic_book_metadata_tags" (
	"book_id" uuid NOT NULL,
	"type" "comic_metadata_tag_type" NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "comic_book_metadata_tags_book_id_type_value_pk" PRIMARY KEY("book_id","type","value")
);
--> statement-breakpoint
ALTER TABLE "comic_books" ADD COLUMN "web" text;--> statement-breakpoint
ALTER TABLE "comic_books" ADD COLUMN "language" text;--> statement-breakpoint
ALTER TABLE "comic_books" ADD COLUMN "age_rating" text;--> statement-breakpoint
ALTER TABLE "comic_books" ADD COLUMN "issue_count_from_file" integer;--> statement-breakpoint
ALTER TABLE "comic_book_metadata_tags" ADD CONSTRAINT "comic_book_metadata_tags_book_id_comic_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."comic_books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comic_book_metadata_tags_type_value_idx" ON "comic_book_metadata_tags" USING btree ("type","value");--> statement-breakpoint
CREATE INDEX "comic_book_metadata_tags_book_idx" ON "comic_book_metadata_tags" USING btree ("book_id");