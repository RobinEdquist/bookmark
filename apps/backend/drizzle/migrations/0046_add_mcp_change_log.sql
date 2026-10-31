CREATE TABLE "mcp_change_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"change_set_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"user_id" text,
	"tool" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"field" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"undone_at" timestamp,
	"undone_by" uuid
);
--> statement-breakpoint
ALTER TABLE "mcp_change_log" ADD CONSTRAINT "mcp_change_log_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mcp_change_log_change_set_id_idx" ON "mcp_change_log" USING btree ("change_set_id");--> statement-breakpoint
CREATE INDEX "mcp_change_log_entity_idx" ON "mcp_change_log" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "mcp_change_log_user_created_at_idx" ON "mcp_change_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "mcp_change_log_created_at_idx" ON "mcp_change_log" USING btree ("created_at");