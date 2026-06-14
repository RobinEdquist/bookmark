CREATE TABLE "comic_collection_series" (
	"collection_id" uuid NOT NULL,
	"series_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "comic_collection_series_collection_id_series_id_pk" PRIMARY KEY("collection_id","series_id")
);
--> statement-breakpoint
CREATE TABLE "comic_collections" (
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
ALTER TABLE "comic_collection_series" ADD CONSTRAINT "comic_collection_series_collection_id_comic_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."comic_collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comic_collection_series" ADD CONSTRAINT "comic_collection_series_series_id_comic_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."comic_series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comic_collection_series_collection_position_idx" ON "comic_collection_series" USING btree ("collection_id","position");--> statement-breakpoint
CREATE INDEX "comic_collection_series_series_id_idx" ON "comic_collection_series" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "comic_collections_name_idx" ON "comic_collections" USING btree ("name");--> statement-breakpoint
CREATE INDEX "comic_collections_sort_name_idx" ON "comic_collections" USING btree ("sort_name");--> statement-breakpoint
CREATE INDEX "comic_collections_created_at_idx" ON "comic_collections" USING btree ("created_at");