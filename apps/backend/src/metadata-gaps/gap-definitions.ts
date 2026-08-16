import {
  and,
  eq,
  notExists,
  sql,
  type SQL,
  type SQLWrapper,
} from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import type {
  MetadataFieldPriority,
  MetadataSource,
} from '../app-settings/schema';
import * as audiobooksSchema from '../audiobooks/schema';
import * as ebooksSchema from '../ebooks/schema';
import * as hardcoverSchema from '../hardcover/schema';
import * as goodreadsSchema from '../gr-finder/schema';

/**
 * "Missing metadata" is a *resolved* question, not a column check.
 *
 * Every field a user sees goes through `resolveFieldByPriority` (see
 * common/utils/metadata-priority.utils.ts), which walks the configured source
 * order and returns the first non-empty value. So an audiobook whose own
 * `description` column is null but which is linked to a Hardcover book that
 * has one is *not* missing a description — the detail page renders it fine.
 *
 * The useful consequence: for the "is it missing?" question the priority
 * *order* is irrelevant. A field is missing exactly when *every* configured
 * source is empty, and AND is commutative. That turns what would have been a
 * reimplementation of priority resolution in SQL into a flat conjunction.
 *
 * Order still matters in one direction: a source that is *not* in the field's
 * priority list is never consulted by the resolver (it falls back to the
 * embedded column), so its value must not count towards filling the gap
 * either. Hence every external check below is gated on `uses(field, source)`.
 *
 * `manual` needs no separate check: manual edits are written to the same
 * column as the embedded value — `manualFields[]` only records *that* the user
 * typed it (see audiobooks.service.ts, which passes the same column as both
 * `manual` and `embedded`).
 */

export const AUDIOBOOK_GAP_KEYS = [
  'cover',
  'description',
  'authors',
  'narrator',
  'genres',
  'series',
  'chapters',
  'publisher',
  'publishedDate',
  'language',
  'hardcoverLink',
  'goodreadsLink',
] as const;

export type AudiobookGapKey = (typeof AUDIOBOOK_GAP_KEYS)[number];

export const EBOOK_GAP_KEYS = [
  'cover',
  'description',
  'authors',
  'genres',
  'series',
  'publisher',
  'publishedDate',
  'language',
  'isbn',
  'pageCount',
  'hardcoverLink',
  'goodreadsLink',
] as const;

export type EbookGapKey = (typeof EBOOK_GAP_KEYS)[number];

export type GapKey = AudiobookGapKey | EbookGapKey;

/**
 * How a gap can actually be closed. Drives the grouping in the admin UI —
 * a worklist that mixes "one click links this" with "someone has to type
 * this" is a worklist nobody finishes.
 *
 * - `link`  — linking an external source fills it (often several at once)
 * - `manual`— no external source carries this field; it has to be typed
 * - `file`  — it comes from the media file itself (re-tag, or import chapters)
 */
export type GapFixMethod = 'link' | 'manual' | 'file';

/**
 * Which fields an external source can actually fill, verified against the
 * detail services rather than assumed from the priority settings. Getting this
 * wrong in either direction is a real bug: over-crediting a source hides items
 * that need work, under-crediting it reports gaps that are not gaps.
 *
 * Priority-resolved (an external source genuinely fills the displayed value):
 *   title, subtitle, description, authors, series
 *
 * NOT priority-resolved, despite what the default priority lists say:
 *   - `genres` — `audiobooks.service.ts` does `const resolvedGenres = genres`
 *     and `ebooks.service.ts` returns the junction rows as-is; Hardcover and
 *     Goodreads genres are surfaced separately under their own objects and are
 *     never written to `audiobook_genres` / `ebook_genres`.
 *   - `publisher` / `publishedDate` / `language` — resolved, but the call sites
 *     pass `hardcover: null, goodreads: null`, because neither external table
 *     stores those columns.
 *   - `cover` — linking writes the image onto the *external* record only. The
 *     cover endpoint has no fallback: it 404s without a local cover, and the
 *     change-cover dialog offers upload and URL, not the linked source.
 *
 * Those five therefore check local state only, and are `manual` work.
 */
export const AUDIOBOOK_GAP_FIX_METHODS: Record<AudiobookGapKey, GapFixMethod> =
  {
    cover: 'manual',
    description: 'link',
    authors: 'link',
    narrator: 'manual',
    genres: 'manual',
    series: 'link',
    chapters: 'file',
    publisher: 'manual',
    publishedDate: 'manual',
    language: 'manual',
    hardcoverLink: 'link',
    goodreadsLink: 'link',
  };

export const EBOOK_GAP_FIX_METHODS: Record<EbookGapKey, GapFixMethod> = {
  cover: 'manual',
  description: 'link',
  authors: 'link',
  genres: 'manual',
  series: 'link',
  publisher: 'manual',
  publishedDate: 'manual',
  language: 'manual',
  isbn: 'manual',
  pageCount: 'file',
  hardcoverLink: 'link',
  goodreadsLink: 'link',
};

/** The schemas the gap subqueries reach into. */
export type GapDatabase = NodePgDatabase<
  typeof audiobooksSchema &
    typeof ebooksSchema &
    typeof hardcoverSchema &
    typeof goodreadsSchema
>;

/**
 * The junction/child tables a gap check counts rows in. They differ in shape
 * but all hang off the parent id, which is the only column these checks touch.
 */
type AudiobookChildTable = PgTable & { audiobookId: AnyPgColumn };
type EbookChildTable = PgTable & { ebookId: AnyPgColumn };

/** TRUE when a text column holds no usable value — mirrors `hasValue()`. */
function textEmpty(column: AnyPgColumn): SQL<boolean> {
  return sql<boolean>`(${column} IS NULL OR btrim(${column}) = '')`;
}

/** TRUE when a text column holds a usable value — mirrors `hasValue()`. */
function textPresent(column: AnyPgColumn): SQL<boolean> {
  return sql<boolean>`(${column} IS NOT NULL AND btrim(${column}) <> '')`;
}

/** TRUE when a jsonb array column holds at least one entry. */
function jsonArrayPresent(column: AnyPgColumn): SQL<boolean> {
  return sql<boolean>`(${column} IS NOT NULL AND jsonb_array_length(${column}) > 0)`;
}

/**
 * `NOT EXISTS (…)` is a boolean expression, but drizzle types `notExists` as
 * `SQL<unknown>`. Narrowing it here keeps every gap condition typed as the
 * boolean it is, so the list query can select them straight into flags.
 */
function noRowMatches(subquery: SQLWrapper): SQL<boolean> {
  return notExists(subquery) as SQL<boolean>;
}

/** Conjunction of "this source has nothing" checks. */
function allEmpty(parts: SQL<boolean>[]): SQL<boolean> {
  return sql<boolean>`(${sql.join(parts, sql` AND `)})`;
}

export function buildAudiobookGapConditions(
  db: GapDatabase,
  priority: MetadataFieldPriority,
): Record<AudiobookGapKey, SQL<boolean>> {
  const { audiobooks } = audiobooksSchema;

  const uses = (
    field: keyof MetadataFieldPriority,
    source: MetadataSource,
  ): boolean => priority[field]?.includes(source) ?? false;

  /** TRUE when no linked row of `table` exists for this audiobook. */
  const lacksOwn = (table: AudiobookChildTable): SQL<boolean> =>
    noRowMatches(
      db
        .select({ one: sql`1` })
        .from(table)
        .where(eq(table.audiobookId, audiobooks.id)),
    );

  /** TRUE when the linked Hardcover book does not satisfy `present`. */
  const hardcoverLacks = (present: SQL<boolean>): SQL<boolean> =>
    noRowMatches(
      db
        .select({ one: sql`1` })
        .from(hardcoverSchema.hardcoverAudiobookLinks)
        .innerJoin(
          hardcoverSchema.hardcoverBooks,
          eq(
            hardcoverSchema.hardcoverAudiobookLinks.hardcoverBookId,
            hardcoverSchema.hardcoverBooks.id,
          ),
        )
        .where(
          and(
            eq(
              hardcoverSchema.hardcoverAudiobookLinks.audiobookId,
              audiobooks.id,
            ),
            present,
          ),
        ),
    );

  /** TRUE when the linked Goodreads book does not satisfy `present`. */
  const goodreadsLacks = (present: SQL<boolean>): SQL<boolean> =>
    noRowMatches(
      db
        .select({ one: sql`1` })
        .from(goodreadsSchema.goodreadsAudiobookLinks)
        .innerJoin(
          goodreadsSchema.goodreadsBooks,
          eq(
            goodreadsSchema.goodreadsAudiobookLinks.goodreadsBookId,
            goodreadsSchema.goodreadsBooks.id,
          ),
        )
        .where(
          and(
            eq(
              goodreadsSchema.goodreadsAudiobookLinks.audiobookId,
              audiobooks.id,
            ),
            present,
          ),
        ),
    );

  const description: SQL<boolean>[] = [textEmpty(audiobooks.description)];
  if (uses('description', 'hardcover')) {
    description.push(
      hardcoverLacks(textPresent(hardcoverSchema.hardcoverBooks.description)),
    );
  }
  if (uses('description', 'goodreads')) {
    description.push(
      goodreadsLacks(textPresent(goodreadsSchema.goodreadsBooks.description)),
    );
  }

  const authors: SQL<boolean>[] = [lacksOwn(audiobooksSchema.audiobookAuthors)];
  if (uses('author', 'hardcover')) {
    authors.push(
      hardcoverLacks(
        jsonArrayPresent(hardcoverSchema.hardcoverBooks.authorNames),
      ),
    );
  }
  if (uses('author', 'goodreads')) {
    authors.push(
      goodreadsLacks(textPresent(goodreadsSchema.goodreadsBooks.author)),
    );
  }

  // Goodreads carries no series information, so it is absent here even when
  // it sits in the priority list.
  const series: SQL<boolean>[] = [lacksOwn(audiobooksSchema.audiobookSeries)];
  if (uses('series', 'hardcover')) {
    series.push(
      hardcoverLacks(
        textPresent(hardcoverSchema.hardcoverBooks.featuredSeriesName),
      ),
    );
  }

  return {
    // Covers are downloaded and stored locally whenever a source supplies one,
    // so the local columns are the whole answer.
    cover: sql<boolean>`(${audiobooks.coverUrl} IS NULL AND ${audiobooks.coverSource} IS NULL)`,
    description: allEmpty(description),
    authors: allEmpty(authors),
    // No external source in the schema carries narrators.
    narrator: lacksOwn(audiobooksSchema.audiobookNarrators),
    // Local only — see AUDIOBOOK_GAP_FIX_METHODS. Hardcover/Goodreads genres
    // are shown under their own objects and never become the item's genres,
    // so an item with none is invisible to genre browsing however well linked.
    genres: lacksOwn(audiobooksSchema.audiobookGenres),
    series: allEmpty(series),
    chapters: lacksOwn(audiobooksSchema.chapters),
    publisher: textEmpty(audiobooks.publisher),
    publishedDate: sql<boolean>`${audiobooks.publishedDate} IS NULL`,
    language: textEmpty(audiobooks.language),
    hardcoverLink: noRowMatches(
      db
        .select({ one: sql`1` })
        .from(hardcoverSchema.hardcoverAudiobookLinks)
        .where(
          eq(
            hardcoverSchema.hardcoverAudiobookLinks.audiobookId,
            audiobooks.id,
          ),
        ),
    ),
    goodreadsLink: noRowMatches(
      db
        .select({ one: sql`1` })
        .from(goodreadsSchema.goodreadsAudiobookLinks)
        .where(
          eq(
            goodreadsSchema.goodreadsAudiobookLinks.audiobookId,
            audiobooks.id,
          ),
        ),
    ),
  };
}

export function buildEbookGapConditions(
  db: GapDatabase,
  priority: MetadataFieldPriority,
): Record<EbookGapKey, SQL<boolean>> {
  const { ebooks } = ebooksSchema;

  const uses = (
    field: keyof MetadataFieldPriority,
    source: MetadataSource,
  ): boolean => priority[field]?.includes(source) ?? false;

  const lacksOwn = (table: EbookChildTable): SQL<boolean> =>
    noRowMatches(
      db
        .select({ one: sql`1` })
        .from(table)
        .where(eq(table.ebookId, ebooks.id)),
    );

  const hardcoverLacks = (present: SQL<boolean>): SQL<boolean> =>
    noRowMatches(
      db
        .select({ one: sql`1` })
        .from(hardcoverSchema.hardcoverEbookLinks)
        .innerJoin(
          hardcoverSchema.hardcoverBooks,
          eq(
            hardcoverSchema.hardcoverEbookLinks.hardcoverBookId,
            hardcoverSchema.hardcoverBooks.id,
          ),
        )
        .where(
          and(
            eq(hardcoverSchema.hardcoverEbookLinks.ebookId, ebooks.id),
            present,
          ),
        ),
    );

  const goodreadsLacks = (present: SQL<boolean>): SQL<boolean> =>
    noRowMatches(
      db
        .select({ one: sql`1` })
        .from(goodreadsSchema.goodreadsEbookLinks)
        .innerJoin(
          goodreadsSchema.goodreadsBooks,
          eq(
            goodreadsSchema.goodreadsEbookLinks.goodreadsBookId,
            goodreadsSchema.goodreadsBooks.id,
          ),
        )
        .where(
          and(
            eq(goodreadsSchema.goodreadsEbookLinks.ebookId, ebooks.id),
            present,
          ),
        ),
    );

  const description: SQL<boolean>[] = [textEmpty(ebooks.description)];
  if (uses('description', 'hardcover')) {
    description.push(
      hardcoverLacks(textPresent(hardcoverSchema.hardcoverBooks.description)),
    );
  }
  if (uses('description', 'goodreads')) {
    description.push(
      goodreadsLacks(textPresent(goodreadsSchema.goodreadsBooks.description)),
    );
  }

  const authors: SQL<boolean>[] = [lacksOwn(ebooksSchema.ebookAuthors)];
  if (uses('author', 'hardcover')) {
    authors.push(
      hardcoverLacks(
        jsonArrayPresent(hardcoverSchema.hardcoverBooks.authorNames),
      ),
    );
  }
  if (uses('author', 'goodreads')) {
    authors.push(
      goodreadsLacks(textPresent(goodreadsSchema.goodreadsBooks.author)),
    );
  }

  const series: SQL<boolean>[] = [lacksOwn(ebooksSchema.ebookSeries)];
  if (uses('series', 'hardcover')) {
    series.push(
      hardcoverLacks(
        textPresent(hardcoverSchema.hardcoverBooks.featuredSeriesName),
      ),
    );
  }

  return {
    cover: sql<boolean>`(${ebooks.coverUrl} IS NULL AND ${ebooks.coverSource} IS NULL)`,
    description: allEmpty(description),
    authors: allEmpty(authors),
    // Local only — see EBOOK_GAP_FIX_METHODS.
    genres: lacksOwn(ebooksSchema.ebookGenres),
    series: allEmpty(series),
    publisher: textEmpty(ebooks.publisher),
    publishedDate: sql<boolean>`${ebooks.publishedDate} IS NULL`,
    language: textEmpty(ebooks.language),
    // Hardcover stores `isbns`, but no priority field routes it into the ebook
    // record, so the resolver never reads it — local column only.
    isbn: textEmpty(ebooks.isbn),
    pageCount: sql<boolean>`${ebooks.pageCount} IS NULL`,
    hardcoverLink: noRowMatches(
      db
        .select({ one: sql`1` })
        .from(hardcoverSchema.hardcoverEbookLinks)
        .where(eq(hardcoverSchema.hardcoverEbookLinks.ebookId, ebooks.id)),
    ),
    goodreadsLink: noRowMatches(
      db
        .select({ one: sql`1` })
        .from(goodreadsSchema.goodreadsEbookLinks)
        .where(eq(goodreadsSchema.goodreadsEbookLinks.ebookId, ebooks.id)),
    ),
  };
}

/**
 * `count(*) FILTER (WHERE …)` per gap, so one scan answers every chip in the
 * summary bar instead of one query per gap.
 *
 * Raw `count(*)` comes back from node-postgres as a string (bigint), hence the
 * explicit `mapWith(Number)`.
 */
export function countFilters<K extends string>(
  conditions: Record<K, SQL<boolean>>,
): Record<K, SQL<number>> {
  const entries = Object.entries(conditions) as [K, SQL<boolean>][];
  return Object.fromEntries(
    entries.map(([key, condition]) => [
      key,
      sql<number>`count(*) FILTER (WHERE ${condition})`.mapWith(Number),
    ]),
  ) as Record<K, SQL<number>>;
}

/** Number of gaps on a row, for the "most gaps first" sort. */
export function gapCountExpression<K extends string>(
  conditions: Record<K, SQL<boolean>>,
): SQL<number> {
  const parts = Object.values<SQL<boolean>>(conditions).map(
    (condition) => sql`(${condition})::int`,
  );
  return sql<number>`(${sql.join(parts, sql` + `)})`.mapWith(Number);
}
