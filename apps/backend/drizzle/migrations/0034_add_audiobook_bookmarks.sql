CREATE TABLE "audiobook_bookmarks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"audiobook_id" uuid NOT NULL,
	"note" text,
	"position" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audiobook_bookmarks" ADD CONSTRAINT "audiobook_bookmarks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audiobook_bookmarks" ADD CONSTRAINT "audiobook_bookmarks_audiobook_id_audiobooks_id_fk" FOREIGN KEY ("audiobook_id") REFERENCES "public"."audiobooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audiobook_bookmarks_user_id_audiobook_id_idx" ON "audiobook_bookmarks" USING btree ("user_id","audiobook_id");--> statement-breakpoint
CREATE INDEX "audiobook_bookmarks_audiobook_id_idx" ON "audiobook_bookmarks" USING btree ("audiobook_id");--> statement-breakpoint
CREATE INDEX "audiobook_bookmarks_user_id_created_at_idx" ON "audiobook_bookmarks" USING btree ("user_id","created_at");