-- Fix recurring "duplicate key value violates unique constraint
-- user_audiobook_progress_unique" on hide / progress-save.
--
-- Duplicate (user_id, audiobook_id) rows exist because the unique index
-- backing the constraint stopped enforcing (left INVALID, or never created --
-- see 0017_fix_duplicate_progress). Reads are masked by defensive dedup, but
-- every UPDATE/upsert against a duplicated pair 500s. This migration removes
-- the duplicates and rebuilds the constraint so it is valid and enforcing.

-- 1. Remove duplicates, keeping the most recently updated row per pair.
DELETE FROM user_audiobook_progress
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, audiobook_id) id
  FROM user_audiobook_progress
  ORDER BY user_id, audiobook_id, updated_at DESC, id DESC
);
--> statement-breakpoint

-- 2. Rebuild the unique constraint from scratch. DROP IF EXISTS also drops the
-- backing index, so a fresh, valid, enforcing index is created regardless of
-- whether the constraint was missing or its index was INVALID. ADD will fail
-- loudly if step 1 left any duplicates behind.
ALTER TABLE "user_audiobook_progress" DROP CONSTRAINT IF EXISTS "user_audiobook_progress_unique";
--> statement-breakpoint

ALTER TABLE "user_audiobook_progress" ADD CONSTRAINT "user_audiobook_progress_unique" UNIQUE ("user_id", "audiobook_id");
