CREATE TABLE "ebook_group_members" (
	"group_id" uuid NOT NULL,
	"ebook_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"role" text,
	CONSTRAINT "ebook_group_members_group_id_ebook_id_pk" PRIMARY KEY("group_id","ebook_id")
);
--> statement-breakpoint
CREATE TABLE "ebook_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sort_name" text,
	"description" text,
	"cover_url" text,
	"cover_source" "cover_source",
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ebook_group_members" ADD CONSTRAINT "ebook_group_members_group_id_ebook_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."ebook_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ebook_group_members" ADD CONSTRAINT "ebook_group_members_ebook_id_ebooks_id_fk" FOREIGN KEY ("ebook_id") REFERENCES "public"."ebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ebook_group_members_group_position_idx" ON "ebook_group_members" USING btree ("group_id","position");--> statement-breakpoint
CREATE INDEX "ebook_group_members_ebook_id_idx" ON "ebook_group_members" USING btree ("ebook_id");--> statement-breakpoint
CREATE INDEX "ebook_groups_name_idx" ON "ebook_groups" USING btree ("name");--> statement-breakpoint
CREATE INDEX "ebook_groups_sort_name_idx" ON "ebook_groups" USING btree ("sort_name");--> statement-breakpoint
CREATE INDEX "ebook_groups_created_at_idx" ON "ebook_groups" USING btree ("created_at");