CREATE TABLE "comic_characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comic_series_main_characters" (
	"series_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "comic_series_main_characters_series_id_character_id_pk" PRIMARY KEY("series_id","character_id")
);
--> statement-breakpoint
ALTER TABLE "comic_series_main_characters" ADD CONSTRAINT "comic_series_main_characters_series_id_comic_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."comic_series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comic_series_main_characters" ADD CONSTRAINT "comic_series_main_characters_character_id_comic_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."comic_characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "comic_characters_name_lower_idx" ON "comic_characters" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "comic_series_main_characters_character_id_idx" ON "comic_series_main_characters" USING btree ("character_id");