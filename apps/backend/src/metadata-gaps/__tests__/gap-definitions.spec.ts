import { drizzle } from 'drizzle-orm/node-postgres';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import {
  DEFAULT_COMIC_METADATA_PRIORITY,
  DEFAULT_METADATA_PRIORITY,
  type ComicMetadataFieldPriority,
  type MetadataFieldPriority,
} from '../../app-settings/schema';
import {
  AUDIOBOOK_GAP_CATEGORIES,
  AUDIOBOOK_GAP_KEYS,
  COMIC_GAP_CATEGORIES,
  COMIC_GAP_KEYS,
  EBOOK_GAP_CATEGORIES,
  EBOOK_GAP_KEYS,
  buildAudiobookGapConditions,
  buildComicGapConditions,
  buildEbookGapConditions,
  countFilters,
  gapCountExpression,
  type GapDatabase,
} from '../gap-definitions';
import { anyOf, gapFilter, selectKeys } from '../metadata-gaps.service';

// Query *building* never touches the client, so a bare object is enough to
// render conditions to SQL without a database.
const db = drizzle({} as never) as unknown as GapDatabase;
const dialect = new PgDialect();

const toSql = (condition: SQL): string => dialect.sqlToQuery(condition).sql;

/** Priority with `source` stripped from every field. */
function without(source: string): MetadataFieldPriority {
  const entries = Object.entries(DEFAULT_METADATA_PRIORITY).map(
    ([field, sources]) => [field, sources.filter((s) => s !== source)],
  );
  return Object.fromEntries(entries) as MetadataFieldPriority;
}

describe('gap definitions', () => {
  describe('audiobook conditions', () => {
    it('covers every declared gap key', () => {
      const conditions = buildAudiobookGapConditions(
        db,
        DEFAULT_METADATA_PRIORITY,
      );
      for (const key of AUDIOBOOK_GAP_KEYS) {
        expect(conditions[key]).toBeDefined();
        expect(AUDIOBOOK_GAP_CATEGORIES[key]).toBeDefined();
      }
    });

    it('treats a field as present when any configured source supplies it', () => {
      const { description } = buildAudiobookGapConditions(
        db,
        DEFAULT_METADATA_PRIORITY,
      );
      const sql = toSql(description);

      // Local column, plus both external sources named in the priority list.
      expect(sql).toContain('"audiobooks"."description"');
      expect(sql).toContain('hardcover_books');
      expect(sql).toContain('goodreads_books');
    });

    it('ignores a source the priority settings have removed', () => {
      const { description } = buildAudiobookGapConditions(
        db,
        without('hardcover'),
      );
      const sql = toSql(description);

      // The resolver would never read Hardcover for this field, so a Hardcover
      // description must not count as filling the gap either.
      expect(sql).not.toContain('hardcover_books');
      expect(sql).toContain('goodreads_books');
    });

    it('checks only local rows for fields no external source carries', () => {
      const conditions = buildAudiobookGapConditions(
        db,
        DEFAULT_METADATA_PRIORITY,
      );

      const narrator = toSql(conditions.narrator);
      expect(narrator).toContain('audiobook_narrators');
      expect(narrator).not.toContain('hardcover_books');
      expect(narrator).not.toContain('goodreads_books');

      // Neither external table stores a publisher column.
      const publisher = toSql(conditions.publisher);
      expect(publisher).toContain('"audiobooks"."publisher"');
      expect(publisher).not.toContain('hardcover_books');
    });

    it('does not let external genres close the genres gap', () => {
      // `genres` sits in the default priority with hardcover+goodreads, but
      // audiobooks.service.ts does `const resolvedGenres = genres` — external
      // genres are shown under their own objects and never become the item's
      // genres. Crediting them here would hide exactly the items the worklist
      // exists to surface: linked, yet ungenred and unbrowsable.
      const { genres } = buildAudiobookGapConditions(
        db,
        DEFAULT_METADATA_PRIORITY,
      );
      const sql = toSql(genres);

      expect(sql).toContain('audiobook_genres');
      expect(sql).not.toContain('hardcover_books');
      expect(sql).not.toContain('goodreads_books');
    });

    it('does not let a linked source close the cover gap', () => {
      // Linking writes the image onto the external record only; the cover
      // endpoint has no fallback and the change-cover dialog offers upload/URL.
      const { cover } = buildAudiobookGapConditions(
        db,
        DEFAULT_METADATA_PRIORITY,
      );
      expect(toSql(cover)).not.toContain('hardcover_books');
    });

    it('groups gaps by what kind of data they are', () => {
      expect(AUDIOBOOK_GAP_CATEGORIES.cover).toBe('essentials');
      expect(AUDIOBOOK_GAP_CATEGORIES.genres).toBe('essentials');
      expect(AUDIOBOOK_GAP_CATEGORIES.narrator).toBe('audio');
      expect(AUDIOBOOK_GAP_CATEGORIES.chapters).toBe('audio');
      expect(AUDIOBOOK_GAP_CATEGORIES.publisher).toBe('publication');
      expect(AUDIOBOOK_GAP_CATEGORIES.hardcoverLink).toBe('matches');
      expect(EBOOK_GAP_CATEGORIES.isbn).toBe('publication');
      expect(EBOOK_GAP_CATEGORIES.goodreadsLink).toBe('matches');
    });

    it('does not treat a standalone book as missing a series', () => {
      // Most books are not in a series, so counting it made the worklist
      // roughly library-sized and hid the gaps that are real work.
      expect(AUDIOBOOK_GAP_KEYS).not.toContain('series');
      expect(EBOOK_GAP_KEYS).not.toContain('series');
    });

    it('keeps a chip for each external match', () => {
      expect(AUDIOBOOK_GAP_KEYS).toContain('hardcoverLink');
      expect(AUDIOBOOK_GAP_KEYS).toContain('goodreadsLink');
      expect(EBOOK_GAP_KEYS).toContain('hardcoverLink');
      expect(EBOOK_GAP_KEYS).toContain('goodreadsLink');
    });

    it('treats whitespace-only text as empty, matching hasValue()', () => {
      const { description } = buildAudiobookGapConditions(
        db,
        DEFAULT_METADATA_PRIORITY,
      );
      expect(toSql(description)).toContain('btrim');
    });

    it('reads covers from the local columns only', () => {
      const { cover } = buildAudiobookGapConditions(
        db,
        DEFAULT_METADATA_PRIORITY,
      );
      const sql = toSql(cover);
      expect(sql).toContain('"audiobooks"."cover_url"');
      expect(sql).toContain('"audiobooks"."cover_source"');
    });
  });

  describe('ebook conditions', () => {
    it('covers every declared gap key', () => {
      const conditions = buildEbookGapConditions(db, DEFAULT_METADATA_PRIORITY);
      for (const key of EBOOK_GAP_KEYS) {
        expect(conditions[key]).toBeDefined();
        expect(EBOOK_GAP_CATEGORIES[key]).toBeDefined();
      }
    });

    it('resolves description across the ebook link tables', () => {
      const { description } = buildEbookGapConditions(
        db,
        DEFAULT_METADATA_PRIORITY,
      );
      const sql = toSql(description);
      expect(sql).toContain('hardcover_ebook_links');
      expect(sql).toContain('goodreads_ebook_links');
    });
  });

  describe('comic conditions', () => {
    const comicWithout = (source: string): ComicMetadataFieldPriority =>
      Object.fromEntries(
        Object.entries(DEFAULT_COMIC_METADATA_PRIORITY).map(
          ([field, sources]) => [field, sources.filter((s) => s !== source)],
        ),
      ) as ComicMetadataFieldPriority;

    it('covers every declared gap key', () => {
      const conditions = buildComicGapConditions(
        db,
        DEFAULT_COMIC_METADATA_PRIORITY,
      );
      for (const key of COMIC_GAP_KEYS) {
        expect(conditions[key]).toBeDefined();
        expect(COMIC_GAP_CATEGORIES[key]).toBeDefined();
      }
    });

    it('lets a linked ComicVine volume fill series fields', () => {
      const { description, publisher, startYear } = buildComicGapConditions(
        db,
        DEFAULT_COMIC_METADATA_PRIORITY,
      );

      expect(toSql(description)).toContain('"comic_series"."description"');
      expect(toSql(description)).toContain('"comicvine_volumes"."description"');
      expect(toSql(publisher)).toContain(
        '"comicvine_volumes"."publisher_name"',
      );
      expect(toSql(startYear)).toContain('"comicvine_volumes"."start_year"');
    });

    it('ignores ComicVine when the priority settings leave it out', () => {
      const { description, issueCoverDates } = buildComicGapConditions(
        db,
        comicWithout('comicvine'),
      );

      expect(toSql(description)).not.toContain('comicvine_volumes');
      expect(toSql(issueCoverDates)).not.toContain('comicvine_issues');
    });

    it('rolls issue gaps up to the series, skipping hidden issues', () => {
      const { issueNumbers, issueCoverDates } = buildComicGapConditions(
        db,
        DEFAULT_COMIC_METADATA_PRIORITY,
      );

      for (const condition of [issueNumbers, issueCoverDates]) {
        const sql = toSql(condition);
        expect(sql).toMatch(/^exists/i);
        expect(sql).toContain(
          '"comic_books"."series_id" = "comic_series"."id"',
        );
        expect(sql).toContain('"comic_books"."status" <> $');
        expect(sql).toContain('comicvine_issues');
      }
    });

    it('only expects a number on issues in a numbered run', () => {
      const { issueNumbers } = buildComicGapConditions(
        db,
        DEFAULT_COMIC_METADATA_PRIORITY,
      );

      expect(toSql(issueNumbers)).toContain(
        `"comic_books"."format" IN ('single_issue', 'annual')`,
      );
    });

    it('falls back to issue covers like the series page does', () => {
      const { cover } = buildComicGapConditions(
        db,
        DEFAULT_COMIC_METADATA_PRIORITY,
      );
      const sql = toSql(cover);

      expect(sql).toContain('"comic_series"."cover_url" IS NULL');
      expect(sql).toContain('"comic_books"."cover_source" IS NOT NULL');
      expect(sql).not.toContain('comicvine');
    });

    it('checks main characters and the ComicVine link locally', () => {
      const { mainCharacters, comicvineLink } = buildComicGapConditions(
        db,
        DEFAULT_COMIC_METADATA_PRIORITY,
      );

      expect(toSql(mainCharacters)).toContain('comic_series_main_characters');
      expect(toSql(comicvineLink)).toContain('comicvine_volume_links');
      expect(COMIC_GAP_CATEGORIES.comicvineLink).toBe('matches');
    });
  });

  describe('countFilters', () => {
    it('emits one filtered aggregate per gap so a single scan answers all', () => {
      const conditions = buildAudiobookGapConditions(
        db,
        DEFAULT_METADATA_PRIORITY,
      );
      const filters = countFilters(conditions);

      expect(Object.keys(filters).sort()).toEqual(
        [...AUDIOBOOK_GAP_KEYS].sort(),
      );
      expect(toSql(filters.description)).toContain('count(*) FILTER (WHERE');
    });
  });

  describe('gapCountExpression', () => {
    it('sums every condition as an integer', () => {
      const conditions = buildAudiobookGapConditions(
        db,
        DEFAULT_METADATA_PRIORITY,
      );
      const sql = toSql(gapCountExpression(conditions));

      expect(sql).toContain('::int');
      expect(sql.split('+')).toHaveLength(AUDIOBOOK_GAP_KEYS.length);
    });
  });
});

describe('gap query helpers', () => {
  describe('selectKeys', () => {
    it('means "anything still needing work" when nothing is requested', () => {
      expect(selectKeys(AUDIOBOOK_GAP_KEYS, undefined)).toEqual([
        ...AUDIOBOOK_GAP_KEYS,
      ]);
      expect(selectKeys(AUDIOBOOK_GAP_KEYS, [])).toEqual([
        ...AUDIOBOOK_GAP_KEYS,
      ]);
    });

    it('drops keys the media type does not have', () => {
      // `chapters` is audiobook-only; asking an ebook list for it must not
      // widen the filter to every ebook gap.
      expect(selectKeys(EBOOK_GAP_KEYS, ['description', 'chapters'])).toEqual([
        'description',
      ]);
    });
  });

  describe('gapFilter', () => {
    it('joins with OR by default and AND on match=all', () => {
      const conditions = buildAudiobookGapConditions(
        db,
        DEFAULT_METADATA_PRIORITY,
      );
      const parts = [conditions.publisher, conditions.language];
      const requested = ['publisher', 'language'];

      expect(toSql(gapFilter(parts, undefined, requested))).toContain(' OR ');
      expect(toSql(gapFilter(parts, 'all', requested))).toContain(' AND ');
    });

    it('ignores match=all when no gaps were requested', () => {
      // Without a `missing` filter the list means "anything still needing
      // work". Honouring a stale match=all there would AND together every gap
      // — an item missing literally everything — and report an empty worklist
      // for a library full of gaps.
      const conditions = buildAudiobookGapConditions(
        db,
        DEFAULT_METADATA_PRIORITY,
      );
      const all = AUDIOBOOK_GAP_KEYS.map((key) => conditions[key]);

      expect(toSql(gapFilter(all, 'all', undefined))).toContain(' OR ');
      expect(toSql(gapFilter(all, 'all', []))).toContain(' OR ');
    });

    it('matches nothing when no condition survives filtering', () => {
      // Guards the `missing=chapters` against ebooks case: an empty
      // disjunction must not degrade into "return the whole library".
      expect(toSql(anyOf([]))).toBe('false');
    });
  });
});
