-- Deduplicate genres and tags that differ only by case,
-- then add unique indexes on LOWER(name) to prevent future duplicates.

-- Step 1: Deduplicate genres
-- For each group of case-insensitive duplicates, keep the one with the earliest created_at.
-- Reassign all audiobook_genres references from duplicate genres to the keeper.
WITH genre_keepers AS (
  SELECT DISTINCT ON (LOWER(name)) id AS keeper_id, LOWER(name) AS lower_name
  FROM genres
  ORDER BY LOWER(name), created_at ASC
),
genre_duplicates AS (
  SELECT g.id AS dup_id, gk.keeper_id
  FROM genres g
  JOIN genre_keepers gk ON LOWER(g.name) = gk.lower_name
  WHERE g.id != gk.keeper_id
)
-- Reassign audiobook_genres: update references, skip if the keeper relation already exists
UPDATE audiobook_genres ag
SET genre_id = gd.keeper_id
FROM genre_duplicates gd
WHERE ag.genre_id = gd.dup_id
  AND NOT EXISTS (
    SELECT 1 FROM audiobook_genres ag2
    WHERE ag2.audiobook_id = ag.audiobook_id AND ag2.genre_id = gd.keeper_id
  );

-- Delete leftover audiobook_genres pointing to duplicates (where keeper relation already existed)
DELETE FROM audiobook_genres ag
USING (
  SELECT g.id AS dup_id
  FROM genres g
  JOIN (
    SELECT DISTINCT ON (LOWER(name)) id AS keeper_id, LOWER(name) AS lower_name
    FROM genres
    ORDER BY LOWER(name), created_at ASC
  ) gk ON LOWER(g.name) = gk.lower_name
  WHERE g.id != gk.keeper_id
) gd
WHERE ag.genre_id = gd.dup_id;

-- Same for ebook_genres
WITH genre_keepers AS (
  SELECT DISTINCT ON (LOWER(name)) id AS keeper_id, LOWER(name) AS lower_name
  FROM genres
  ORDER BY LOWER(name), created_at ASC
),
genre_duplicates AS (
  SELECT g.id AS dup_id, gk.keeper_id
  FROM genres g
  JOIN genre_keepers gk ON LOWER(g.name) = gk.lower_name
  WHERE g.id != gk.keeper_id
)
UPDATE ebook_genres eg
SET genre_id = gd.keeper_id
FROM genre_duplicates gd
WHERE eg.genre_id = gd.dup_id
  AND NOT EXISTS (
    SELECT 1 FROM ebook_genres eg2
    WHERE eg2.ebook_id = eg.ebook_id AND eg2.genre_id = gd.keeper_id
  );

DELETE FROM ebook_genres eg
USING (
  SELECT g.id AS dup_id
  FROM genres g
  JOIN (
    SELECT DISTINCT ON (LOWER(name)) id AS keeper_id, LOWER(name) AS lower_name
    FROM genres
    ORDER BY LOWER(name), created_at ASC
  ) gk ON LOWER(g.name) = gk.lower_name
  WHERE g.id != gk.keeper_id
) gd
WHERE eg.genre_id = gd.dup_id;

-- Delete the duplicate genre rows
DELETE FROM genres
WHERE id NOT IN (
  SELECT DISTINCT ON (LOWER(name)) id
  FROM genres
  ORDER BY LOWER(name), created_at ASC
);

-- Step 2: Deduplicate tags (same pattern)
WITH tag_keepers AS (
  SELECT DISTINCT ON (LOWER(name)) id AS keeper_id, LOWER(name) AS lower_name
  FROM tags
  ORDER BY LOWER(name), created_at ASC
),
tag_duplicates AS (
  SELECT t.id AS dup_id, tk.keeper_id
  FROM tags t
  JOIN tag_keepers tk ON LOWER(t.name) = tk.lower_name
  WHERE t.id != tk.keeper_id
)
UPDATE audiobook_tags at_
SET tag_id = td.keeper_id
FROM tag_duplicates td
WHERE at_.tag_id = td.dup_id
  AND NOT EXISTS (
    SELECT 1 FROM audiobook_tags at2
    WHERE at2.audiobook_id = at_.audiobook_id AND at2.tag_id = td.keeper_id
  );

DELETE FROM audiobook_tags at_
USING (
  SELECT t.id AS dup_id
  FROM tags t
  JOIN (
    SELECT DISTINCT ON (LOWER(name)) id AS keeper_id, LOWER(name) AS lower_name
    FROM tags
    ORDER BY LOWER(name), created_at ASC
  ) tk ON LOWER(t.name) = tk.lower_name
  WHERE t.id != tk.keeper_id
) td
WHERE at_.tag_id = td.dup_id;

-- Same for ebook_tags
WITH tag_keepers AS (
  SELECT DISTINCT ON (LOWER(name)) id AS keeper_id, LOWER(name) AS lower_name
  FROM tags
  ORDER BY LOWER(name), created_at ASC
),
tag_duplicates AS (
  SELECT t.id AS dup_id, tk.keeper_id
  FROM tags t
  JOIN tag_keepers tk ON LOWER(t.name) = tk.lower_name
  WHERE t.id != tk.keeper_id
)
UPDATE ebook_tags et
SET tag_id = td.keeper_id
FROM tag_duplicates td
WHERE et.tag_id = td.dup_id
  AND NOT EXISTS (
    SELECT 1 FROM ebook_tags et2
    WHERE et2.ebook_id = et.ebook_id AND et2.tag_id = td.keeper_id
  );

DELETE FROM ebook_tags et
USING (
  SELECT t.id AS dup_id
  FROM tags t
  JOIN (
    SELECT DISTINCT ON (LOWER(name)) id AS keeper_id, LOWER(name) AS lower_name
    FROM tags
    ORDER BY LOWER(name), created_at ASC
  ) tk ON LOWER(t.name) = tk.lower_name
  WHERE t.id != tk.keeper_id
) td
WHERE et.tag_id = td.dup_id;

-- Delete the duplicate tag rows
DELETE FROM tags
WHERE id NOT IN (
  SELECT DISTINCT ON (LOWER(name)) id
  FROM tags
  ORDER BY LOWER(name), created_at ASC
);

-- Step 3: Add unique indexes on LOWER(name) to prevent future case-insensitive duplicates
CREATE UNIQUE INDEX genres_name_lower_unique ON genres (LOWER(name));
CREATE UNIQUE INDEX tags_name_lower_unique ON tags (LOWER(name));
