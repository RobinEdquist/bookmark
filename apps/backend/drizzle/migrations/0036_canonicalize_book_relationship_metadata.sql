-- External metadata used to be exposed with response-only IDs such as
-- `hc-series-0` and `gr-author-0`. Materialize provider people and series as
-- normal library entities, then attach them to books that do not already have
-- embedded or manually-entered relationship metadata.

INSERT INTO "people" ("name")
SELECT DISTINCT author_name
FROM (
  SELECT btrim(author.value) AS author_name
  FROM "hardcover_books" hb
  CROSS JOIN LATERAL jsonb_array_elements_text(hb."author_names") author(value)

  UNION

  SELECT btrim(author.value) AS author_name
  FROM "goodreads_books" gb
  CROSS JOIN LATERAL regexp_split_to_table(gb."author", ',') author(value)
) external_authors
WHERE author_name <> ''
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "series" ("name")
SELECT DISTINCT btrim(hb."featured_series_name")
FROM "hardcover_books" hb
WHERE hb."featured_series_name" IS NOT NULL
  AND btrim(hb."featured_series_name") <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM "series" s
    WHERE lower(s."name") = lower(btrim(hb."featured_series_name"))
  );

-- Default priority is embedded, then Hardcover, then Goodreads. Existing core
-- relations therefore win; provider relationships fill the records that were
-- previously represented only by virtual API objects.
INSERT INTO "audiobook_authors" ("audiobook_id", "person_id", "order")
SELECT hal."audiobook_id", p."id", (author.ordinality - 1)::integer
FROM "hardcover_audiobook_links" hal
JOIN "audiobooks" ab ON ab."id" = hal."audiobook_id"
JOIN "hardcover_books" hb ON hb."id" = hal."hardcover_book_id"
CROSS JOIN LATERAL jsonb_array_elements_text(hb."author_names") WITH ORDINALITY author(value, ordinality)
JOIN "people" p ON p."name" = btrim(author.value)
WHERE btrim(author.value) <> ''
  AND NOT (COALESCE(ab."manual_fields", '[]'::jsonb) ?| ARRAY['author', 'authors'])
  AND NOT EXISTS (
    SELECT 1 FROM "audiobook_authors" aa
    WHERE aa."audiobook_id" = hal."audiobook_id"
  )
ON CONFLICT DO NOTHING;

INSERT INTO "audiobook_authors" ("audiobook_id", "person_id", "order")
SELECT gal."audiobook_id", p."id", (author.ordinality - 1)::integer
FROM "goodreads_audiobook_links" gal
JOIN "audiobooks" ab ON ab."id" = gal."audiobook_id"
JOIN "goodreads_books" gb ON gb."id" = gal."goodreads_book_id"
CROSS JOIN LATERAL regexp_split_to_table(gb."author", ',') WITH ORDINALITY author(value, ordinality)
JOIN "people" p ON p."name" = btrim(author.value)
WHERE btrim(author.value) <> ''
  AND NOT (COALESCE(ab."manual_fields", '[]'::jsonb) ?| ARRAY['author', 'authors'])
  AND NOT EXISTS (
    SELECT 1 FROM "audiobook_authors" aa
    WHERE aa."audiobook_id" = gal."audiobook_id"
  )
ON CONFLICT DO NOTHING;

INSERT INTO "ebook_authors" ("ebook_id", "person_id", "order")
SELECT hel."ebook_id", p."id", (author.ordinality - 1)::integer
FROM "hardcover_ebook_links" hel
JOIN "ebooks" eb ON eb."id" = hel."ebook_id"
JOIN "hardcover_books" hb ON hb."id" = hel."hardcover_book_id"
CROSS JOIN LATERAL jsonb_array_elements_text(hb."author_names") WITH ORDINALITY author(value, ordinality)
JOIN "people" p ON p."name" = btrim(author.value)
WHERE btrim(author.value) <> ''
  AND NOT (COALESCE(eb."manual_fields", '[]'::jsonb) ?| ARRAY['author', 'authors'])
  AND NOT EXISTS (
    SELECT 1 FROM "ebook_authors" ea
    WHERE ea."ebook_id" = hel."ebook_id"
  )
ON CONFLICT DO NOTHING;

INSERT INTO "ebook_authors" ("ebook_id", "person_id", "order")
SELECT gel."ebook_id", p."id", (author.ordinality - 1)::integer
FROM "goodreads_ebook_links" gel
JOIN "ebooks" eb ON eb."id" = gel."ebook_id"
JOIN "goodreads_books" gb ON gb."id" = gel."goodreads_book_id"
CROSS JOIN LATERAL regexp_split_to_table(gb."author", ',') WITH ORDINALITY author(value, ordinality)
JOIN "people" p ON p."name" = btrim(author.value)
WHERE btrim(author.value) <> ''
  AND NOT (COALESCE(eb."manual_fields", '[]'::jsonb) ?| ARRAY['author', 'authors'])
  AND NOT EXISTS (
    SELECT 1 FROM "ebook_authors" ea
    WHERE ea."ebook_id" = gel."ebook_id"
  )
ON CONFLICT DO NOTHING;

-- If a library explicitly ranks Hardcover ahead of embedded series metadata,
-- make the canonical relationship match the value already shown by the API.
DELETE FROM "audiobook_series" existing_series
USING "audiobooks" ab,
      "hardcover_audiobook_links" hal,
      "hardcover_books" hb
WHERE existing_series."audiobook_id" = ab."id"
  AND hal."audiobook_id" = ab."id"
  AND hb."id" = hal."hardcover_book_id"
  AND hb."featured_series_name" IS NOT NULL
  AND btrim(hb."featured_series_name") <> ''
  AND NOT (COALESCE(ab."manual_fields", '[]'::jsonb) ? 'series')
  AND COALESCE((
    SELECT source.ordinality
    FROM jsonb_array_elements_text(COALESCE(
      (SELECT settings."metadata_priority"->'series' FROM "app_settings" settings WHERE settings."id" = 'app_settings'),
      '["manual", "embedded", "hardcover", "goodreads", "filename"]'::jsonb
    )) WITH ORDINALITY source(value, ordinality)
    WHERE source.value = 'hardcover'
  ), 2147483647) < COALESCE((
    SELECT source.ordinality
    FROM jsonb_array_elements_text(COALESCE(
      (SELECT settings."metadata_priority"->'series' FROM "app_settings" settings WHERE settings."id" = 'app_settings'),
      '["manual", "embedded", "hardcover", "goodreads", "filename"]'::jsonb
    )) WITH ORDINALITY source(value, ordinality)
    WHERE source.value = 'embedded'
  ), 2147483647);

DELETE FROM "ebook_series" existing_series
USING "ebooks" eb,
      "hardcover_ebook_links" hel,
      "hardcover_books" hb
WHERE existing_series."ebook_id" = eb."id"
  AND hel."ebook_id" = eb."id"
  AND hb."id" = hel."hardcover_book_id"
  AND hb."featured_series_name" IS NOT NULL
  AND btrim(hb."featured_series_name") <> ''
  AND NOT (COALESCE(eb."manual_fields", '[]'::jsonb) ? 'series')
  AND COALESCE((
    SELECT source.ordinality
    FROM jsonb_array_elements_text(COALESCE(
      (SELECT settings."metadata_priority"->'series' FROM "app_settings" settings WHERE settings."id" = 'app_settings'),
      '["manual", "embedded", "hardcover", "goodreads", "filename"]'::jsonb
    )) WITH ORDINALITY source(value, ordinality)
    WHERE source.value = 'hardcover'
  ), 2147483647) < COALESCE((
    SELECT source.ordinality
    FROM jsonb_array_elements_text(COALESCE(
      (SELECT settings."metadata_priority"->'series' FROM "app_settings" settings WHERE settings."id" = 'app_settings'),
      '["manual", "embedded", "hardcover", "goodreads", "filename"]'::jsonb
    )) WITH ORDINALITY source(value, ordinality)
    WHERE source.value = 'embedded'
  ), 2147483647);

INSERT INTO "audiobook_series" ("audiobook_id", "series_id", "order")
SELECT hal."audiobook_id", canonical_series."id",
       COALESCE(hb."featured_series_position", 0)
FROM "hardcover_audiobook_links" hal
JOIN "audiobooks" ab ON ab."id" = hal."audiobook_id"
JOIN "hardcover_books" hb ON hb."id" = hal."hardcover_book_id"
JOIN LATERAL (
  SELECT s."id"
  FROM "series" s
  WHERE lower(s."name") = lower(btrim(hb."featured_series_name"))
  ORDER BY s."created_at", s."id"
  LIMIT 1
) canonical_series ON true
WHERE hb."featured_series_name" IS NOT NULL
  AND btrim(hb."featured_series_name") <> ''
  AND NOT (COALESCE(ab."manual_fields", '[]'::jsonb) ? 'series')
  AND NOT EXISTS (
    SELECT 1 FROM "audiobook_series" abs
    WHERE abs."audiobook_id" = hal."audiobook_id"
  )
ON CONFLICT DO NOTHING;

INSERT INTO "ebook_series" ("ebook_id", "series_id", "order")
SELECT hel."ebook_id", canonical_series."id",
       COALESCE(hb."featured_series_position", 0)
FROM "hardcover_ebook_links" hel
JOIN "ebooks" eb ON eb."id" = hel."ebook_id"
JOIN "hardcover_books" hb ON hb."id" = hel."hardcover_book_id"
JOIN LATERAL (
  SELECT s."id"
  FROM "series" s
  WHERE lower(s."name") = lower(btrim(hb."featured_series_name"))
  ORDER BY s."created_at", s."id"
  LIMIT 1
) canonical_series ON true
WHERE hb."featured_series_name" IS NOT NULL
  AND btrim(hb."featured_series_name") <> ''
  AND NOT (COALESCE(eb."manual_fields", '[]'::jsonb) ? 'series')
  AND NOT EXISTS (
    SELECT 1 FROM "ebook_series" es
    WHERE es."ebook_id" = hel."ebook_id"
  )
ON CONFLICT DO NOTHING;
