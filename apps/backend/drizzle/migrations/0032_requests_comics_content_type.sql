-- Custom SQL migration file, put your code below! --

-- Comics used to ride through requests typed as 'ebook' and were re-detected
-- at approval time via the module-specific category id 61. Comics are now a
-- first-class content type reported by the content request module, so retype
-- the existing rows that the old heuristic would have routed as comics.
UPDATE "requests"
SET "content_type" = 'comics'
WHERE "category_id" = 61
  AND "content_type" = 'ebook';
