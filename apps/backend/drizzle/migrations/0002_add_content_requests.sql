CREATE TABLE "request_supporters" (
	"request_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "request_supporters_request_id_user_id_pk" PRIMARY KEY("request_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"mam_torrent_id" text NOT NULL,
	"torrent_hash" text,
	"folder_name" text,
	"title" text NOT NULL,
	"author" text,
	"narrator" text,
	"series" text,
	"description" text,
	"cover_url" text,
	"content_type" text NOT NULL,
	"rejection_reason" text,
	"library_item_id" uuid,
	"library_item_type" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN "requests_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD COLUMN "can_request_content" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "request_supporters" ADD CONSTRAINT "request_supporters_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_supporters" ADD CONSTRAINT "request_supporters_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "request_supporters_request_id_idx" ON "request_supporters" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "requests_status_idx" ON "requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "requests_user_id_idx" ON "requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "requests_folder_name_idx" ON "requests" USING btree ("folder_name");--> statement-breakpoint
CREATE INDEX "requests_mam_torrent_id_idx" ON "requests" USING btree ("mam_torrent_id");