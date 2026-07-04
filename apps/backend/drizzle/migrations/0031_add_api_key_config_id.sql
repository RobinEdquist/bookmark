ALTER TABLE "api_key" ADD COLUMN "config_id" text DEFAULT 'default' NOT NULL;--> statement-breakpoint
CREATE INDEX "api_key_v2_key_idx" ON "api_key" USING btree ("key");--> statement-breakpoint
CREATE INDEX "api_key_v2_config_id_idx" ON "api_key" USING btree ("config_id");