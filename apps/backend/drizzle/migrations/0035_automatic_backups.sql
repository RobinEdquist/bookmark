ALTER TABLE "app_settings" ADD COLUMN "backup_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "backup_path" text;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "backup_schedule" text DEFAULT '0 2 * * *' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "backups_to_keep" integer DEFAULT 7 NOT NULL;