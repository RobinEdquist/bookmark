import { and, eq, exists, ilike, or, sql, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
import * as audiobookSchema from '../audiobooks/schema';
import * as goodreadsSchema from '../gr-finder/schema';
import * as hardcoverSchema from '../hardcover/schema';

/**
 * Shared keyword matching for the ebook API and OPDS. Correlated EXISTS
 * predicates keep one row per ebook when multiple metadata sources match.
 * Visibility and availability remain the caller's responsibility.
 */
export function buildEbookSearchFilter(
  db: NodePgDatabase<typeof schema>,
  search: string,
): SQL {
  const searchPattern = `%${search}%`;

  // Search in title and subtitle
  const titleMatch = ilike(schema.ebooks.title, searchPattern);
  const subtitleMatch = ilike(schema.ebooks.subtitle, searchPattern);

  // Search in authors (via ebookAuthors -> people)
  const authorMatch = exists(
    db
      .select({ one: sql`1` })
      .from(schema.ebookAuthors)
      .innerJoin(
        audiobookSchema.people,
        eq(schema.ebookAuthors.personId, audiobookSchema.people.id),
      )
      .where(
        and(
          eq(schema.ebookAuthors.ebookId, schema.ebooks.id),
          ilike(audiobookSchema.people.name, searchPattern),
        ),
      ),
  );

  // Search in series (via ebookSeries -> series)
  const seriesMatch = exists(
    db
      .select({ one: sql`1` })
      .from(schema.ebookSeries)
      .innerJoin(
        audiobookSchema.series,
        eq(schema.ebookSeries.seriesId, audiobookSchema.series.id),
      )
      .where(
        and(
          eq(schema.ebookSeries.ebookId, schema.ebooks.id),
          ilike(audiobookSchema.series.name, searchPattern),
        ),
      ),
  );

  // Search in linked Goodreads book (title and author)
  const goodreadsMatch = exists(
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
          eq(goodreadsSchema.goodreadsEbookLinks.ebookId, schema.ebooks.id),
          or(
            ilike(goodreadsSchema.goodreadsBooks.title, searchPattern),
            ilike(goodreadsSchema.goodreadsBooks.author, searchPattern),
          ),
        ),
      ),
  );

  // Search in linked Hardcover book (title and author names)
  const hardcoverMatch = exists(
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
          eq(hardcoverSchema.hardcoverEbookLinks.ebookId, schema.ebooks.id),
          or(
            ilike(hardcoverSchema.hardcoverBooks.title, searchPattern),
            sql`EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(${hardcoverSchema.hardcoverBooks.authorNames}) AS author_name
              WHERE author_name ILIKE ${searchPattern}
            )`,
          ),
        ),
      ),
  );

  return or(
    titleMatch,
    subtitleMatch,
    authorMatch,
    seriesMatch,
    goodreadsMatch,
    hardcoverMatch,
  )!;
}
