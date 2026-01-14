CREATE TABLE "user_ebook_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"ebook_id" uuid NOT NULL,
	"cfi" text,
	"progress_percent" integer DEFAULT 0 NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_ebook_progress_unique" UNIQUE("user_id","ebook_id")
);
--> statement-breakpoint
ALTER TABLE "user_ebook_progress" ADD CONSTRAINT "user_ebook_progress_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_ebook_progress" ADD CONSTRAINT "user_ebook_progress_ebook_id_ebooks_id_fk" FOREIGN KEY ("ebook_id") REFERENCES "public"."ebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_ebook_progress_user_id_idx" ON "user_ebook_progress" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_ebook_progress_ebook_id_idx" ON "user_ebook_progress" USING btree ("ebook_id");--> statement-breakpoint
CREATE INDEX "user_ebook_progress_updated_at_idx" ON "user_ebook_progress" USING btree ("updated_at");