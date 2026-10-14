ALTER TABLE "request_attempts" ADD COLUMN "download_options" jsonb;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "transfer_state" text;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "transfer_progress" real;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "transfer_raw_state" text;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "transfer_observed_at" timestamp;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "transfer_stale" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "submission_uncertain" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "import_error_id" uuid;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_import_error_id_import_errors_id_fk" FOREIGN KEY ("import_error_id") REFERENCES "public"."import_errors"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
UPDATE "requests" SET "submission_uncertain" = true
WHERE "status" = 'approved' AND "torrent_hash" IS NULL
AND EXISTS (SELECT 1 FROM "request_attempts" WHERE "request_attempts"."request_id" = "requests"."id" AND "request_attempts"."status" = 'uncertain');
