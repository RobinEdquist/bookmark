-- Normalize audiobook paths for consistency
-- audiobooks.file_path: should be folder path (empty string for root-level files)
-- audiobook_files.file_path: should be filename only

-- Step 1: Update audiobooks.file_path to empty string for root-level files
-- Root-level files are detected by file_path ending with an audio extension
UPDATE "audiobooks"
SET "file_path" = ''
WHERE "file_path" LIKE '%.m4b'
   OR "file_path" LIKE '%.m4a'
   OR "file_path" LIKE '%.mp3'
   OR "file_path" LIKE '%.flac'
   OR "file_path" LIKE '%.ogg'
   OR "file_path" LIKE '%.wav'
   OR "file_path" LIKE '%.wma'
   OR "file_path" LIKE '%.aac';--> statement-breakpoint

-- Step 2: Update audiobook_files.file_path to just the filename (basename)
-- PostgreSQL: Use regexp_replace to extract everything after the last /
-- If no / exists, the value stays the same (already just a filename)
UPDATE "audiobook_files"
SET "file_path" = CASE
    WHEN "file_path" LIKE '%/%' THEN regexp_replace("file_path", '^.*/', '')
    ELSE "file_path"
END;
