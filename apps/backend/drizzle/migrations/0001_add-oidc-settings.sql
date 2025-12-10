DROP INDEX "api_key_user_id_idx";--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "oidc_button_text" text DEFAULT 'Sign in with SSO' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "email_password_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "oidc_auto_create_users" text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
CREATE INDEX "api_key_v2_user_id_idx" ON "api_key" USING btree ("user_id");