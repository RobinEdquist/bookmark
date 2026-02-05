-- Enable trigram extension for fuzzy text matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add trigram indexes for fast similarity searches
CREATE INDEX IF NOT EXISTS audiobooks_title_trgm_idx ON audiobooks USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS audiobooks_subtitle_trgm_idx ON audiobooks USING gin (subtitle gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ebooks_title_trgm_idx ON ebooks USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ebooks_subtitle_trgm_idx ON ebooks USING gin (subtitle gin_trgm_ops);
CREATE INDEX IF NOT EXISTS people_name_trgm_idx ON people USING gin (name gin_trgm_ops);
