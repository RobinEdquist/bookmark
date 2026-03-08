-- Delete duplicate progress rows, keeping the one with the latest updated_at per user+audiobook
DELETE FROM user_audiobook_progress
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, audiobook_id) id
  FROM user_audiobook_progress
  ORDER BY user_id, audiobook_id, updated_at DESC
);--> statement-breakpoint

-- Re-add unique constraint if missing (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_audiobook_progress_unique'
  ) THEN
    ALTER TABLE user_audiobook_progress
    ADD CONSTRAINT user_audiobook_progress_unique UNIQUE (user_id, audiobook_id);
  END IF;
END $$;
