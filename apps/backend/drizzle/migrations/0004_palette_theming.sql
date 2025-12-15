ALTER TABLE "user" ADD COLUMN "primary_color" text DEFAULT 'orange' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "surface_color" text DEFAULT 'espresso' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "theme";
