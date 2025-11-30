CREATE TABLE "listening_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"audiobook_id" uuid NOT NULL,
	"started_at" timestamp NOT NULL,
	"ended_at" timestamp NOT NULL,
	"duration_seconds" integer NOT NULL,
	"start_position" integer NOT NULL,
	"end_position" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_audiobook_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"audiobook_id" uuid NOT NULL,
	"current_position" integer DEFAULT 0 NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_audiobook_progress_unique" UNIQUE("user_id","audiobook_id")
);
--> statement-breakpoint
ALTER TABLE "listening_sessions" ADD CONSTRAINT "listening_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listening_sessions" ADD CONSTRAINT "listening_sessions_audiobook_id_audiobooks_id_fk" FOREIGN KEY ("audiobook_id") REFERENCES "public"."audiobooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_audiobook_progress" ADD CONSTRAINT "user_audiobook_progress_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_audiobook_progress" ADD CONSTRAINT "user_audiobook_progress_audiobook_id_audiobooks_id_fk" FOREIGN KEY ("audiobook_id") REFERENCES "public"."audiobooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "listening_sessions_user_started_idx" ON "listening_sessions" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "listening_sessions_audiobook_id_idx" ON "listening_sessions" USING btree ("audiobook_id");--> statement-breakpoint
CREATE INDEX "user_audiobook_progress_user_id_idx" ON "user_audiobook_progress" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_audiobook_progress_audiobook_id_idx" ON "user_audiobook_progress" USING btree ("audiobook_id");--> statement-breakpoint
CREATE INDEX "user_audiobook_progress_updated_at_idx" ON "user_audiobook_progress" USING btree ("updated_at");