ALTER TABLE "audiobook_files" ADD COLUMN "codec" text;--> statement-breakpoint
-- The scanner used to store bitrate in kilobits per second while the API and
-- the Audiobookshelf restore path used bits per second. Everything is bits per
-- second from here on; no real audio stream is under 10 kbit/s, so any value
-- below 10000 can only be an old kilobit figure.
UPDATE "audiobook_files" SET "bitrate" = "bitrate" * 1000 WHERE "bitrate" IS NOT NULL AND "bitrate" < 10000;
