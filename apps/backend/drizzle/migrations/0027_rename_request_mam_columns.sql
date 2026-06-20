DROP INDEX "requests_mam_torrent_id_idx";--> statement-breakpoint
ALTER TABLE "requests" RENAME COLUMN "mam_torrent_id" TO "torrent_id";--> statement-breakpoint
ALTER TABLE "requests" RENAME COLUMN "mam_category" TO "category_id";--> statement-breakpoint
CREATE INDEX "requests_torrent_id_idx" ON "requests" USING btree ("torrent_id");
