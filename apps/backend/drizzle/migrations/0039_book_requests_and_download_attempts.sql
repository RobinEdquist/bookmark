CREATE TABLE "request_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"module_id" text NOT NULL,
	"torrent_id" text NOT NULL,
	"category_id" integer,
	"status" text NOT NULL,
	"torrent_hash" text,
	"folder_name" text,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_search_schedule" (
	"id" text PRIMARY KEY NOT NULL,
	"next_run_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "requests" ALTER COLUMN "torrent_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "requests" ALTER COLUMN "category_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "book_key" text;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "language_key" text DEFAULT 'any' NOT NULL;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "language_names" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "language_ids" integer[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "language_module" text;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "approved_at" timestamp;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "last_search_at" timestamp;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "next_search_at" timestamp;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "search_failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "search_error" text;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "search_claim" uuid;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "search_lease_until" timestamp;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "release_date" timestamp;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "candidate_module" text;--> statement-breakpoint
ALTER TABLE "request_attempts" ADD CONSTRAINT "request_attempts_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "request_attempts_request_idx" ON "request_attempts" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "request_attempts_active_idx" ON "request_attempts" USING btree ("request_id") WHERE "request_attempts"."status" IN ('submitting', 'tracking', 'uncertain');--> statement-breakpoint
CREATE INDEX "requests_book_intent_idx" ON "requests" USING btree ("book_key","content_type","language_key");--> statement-breakpoint
CREATE INDEX "requests_search_due_idx" ON "requests" USING btree ("next_search_at");
--> statement-breakpoint
-- Backfill in place. Do not merge legacy duplicates or rewrite transfer identity.
UPDATE requests SET
  book_key = json_build_array(
    lower(regexp_replace(btrim(title), '[[:space:]]+', ' ', 'g')),
    lower(regexp_replace(btrim(coalesce(author, '')), '[[:space:]]+', ' ', 'g'))
  )::text,
  approved_at = CASE WHEN status IN ('approved', 'downloading', 'complete') OR auto_approved_by_user_id IS NOT NULL THEN created_at ELSE NULL END;
--> statement-breakpoint
ALTER TABLE requests ALTER COLUMN book_key SET NOT NULL;
--> statement-breakpoint
-- An approved legacy row without a hash may already have submitted a download.
-- Preserve that uncertainty rather than making it eligible for a new submission.
INSERT INTO request_attempts (request_id, module_id, torrent_id, category_id, status, torrent_hash, folder_name, created_at, updated_at, reason)
SELECT id, 'legacy', torrent_id, category_id,
  CASE WHEN status = 'complete' THEN 'complete' WHEN torrent_hash IS NOT NULL THEN 'tracking' ELSE 'uncertain' END,
  torrent_hash, folder_name, created_at, updated_at,
  CASE WHEN torrent_hash IS NULL THEN 'Legacy submission outcome needs reconciliation' ELSE NULL END
FROM requests WHERE status IN ('approved', 'downloading', 'complete');
--> statement-breakpoint
INSERT INTO request_search_schedule (id, next_run_at) VALUES ('availability', now());
