CREATE TABLE "list_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"list_id" uuid NOT NULL,
	"item_type" text NOT NULL,
	"audiobook_id" uuid,
	"ebook_id" uuid,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_audiobook_id_audiobooks_id_fk" FOREIGN KEY ("audiobook_id") REFERENCES "public"."audiobooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_items" ADD CONSTRAINT "list_items_ebook_id_ebooks_id_fk" FOREIGN KEY ("ebook_id") REFERENCES "public"."ebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lists" ADD CONSTRAINT "lists_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "list_items_list_id_idx" ON "list_items" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "list_items_audiobook_id_idx" ON "list_items" USING btree ("audiobook_id");--> statement-breakpoint
CREATE INDEX "list_items_ebook_id_idx" ON "list_items" USING btree ("ebook_id");--> statement-breakpoint
CREATE INDEX "list_items_list_order_idx" ON "list_items" USING btree ("list_id","order");--> statement-breakpoint
CREATE INDEX "lists_user_id_idx" ON "lists" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lists_is_public_idx" ON "lists" USING btree ("is_public");