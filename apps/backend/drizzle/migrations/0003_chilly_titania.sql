CREATE TABLE "user_blacklisted_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"tag" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_permissions" (
	"user_id" text PRIMARY KEY NOT NULL,
	"can_edit_metadata" boolean DEFAULT false NOT NULL,
	"can_upload_audiobooks" boolean DEFAULT false NOT NULL,
	"can_delete_audiobooks" boolean DEFAULT false NOT NULL,
	"can_generate_api_keys" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_blacklisted_tags" ADD CONSTRAINT "user_blacklisted_tags_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_blacklisted_tags_user_id_idx" ON "user_blacklisted_tags" USING btree ("user_id");