ALTER TYPE "public"."comic_book_format" ADD VALUE 'compendium' BEFORE 'one_shot';--> statement-breakpoint
ALTER TABLE "comic_series" ALTER COLUMN "folder_path" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "comic_books" ADD COLUMN "collects" text;