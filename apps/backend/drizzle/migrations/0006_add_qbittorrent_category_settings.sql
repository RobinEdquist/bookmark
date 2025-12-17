ALTER TABLE "app_settings" ADD COLUMN "requests_audiobook_category" text DEFAULT 'audiobooks' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "requests_ebook_category" text DEFAULT 'books' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "requests_comics_category" text DEFAULT 'comics' NOT NULL;