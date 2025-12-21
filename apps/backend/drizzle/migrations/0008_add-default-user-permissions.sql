ALTER TABLE "user_permissions" RENAME COLUMN "can_upload_audiobooks" TO "can_upload";--> statement-breakpoint
ALTER TABLE "user_permissions" RENAME COLUMN "can_delete_audiobooks" TO "can_delete";--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "default_can_edit_metadata" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "default_can_upload" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "default_can_delete" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "default_can_generate_api_keys" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "default_can_request_content" boolean DEFAULT false NOT NULL;