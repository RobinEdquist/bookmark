import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { asc, eq, inArray } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import { AppSettingsService } from '../app-settings/app-settings.service';
import type { MetadataFieldPriority } from '../app-settings/schema';
import * as audiobookSchema from '../audiobooks/schema';
import * as ebookSchema from '../ebooks/schema';
import * as comicSchema from '../comics/schema';
import * as comicvineSchema from '../comicvine/schema';
import * as hardcoverSchema from '../hardcover/schema';
import * as goodreadsSchema from '../gr-finder/schema';
import {
  resolveFieldByPriority,
  resolveRelationByPriority,
} from './utils/metadata-priority.utils';
import { splitPersonNames } from './utils/name.utils';
import { resolveExternalTitle } from './utils/title.utils';

/** The display values for a book after metadata-priority resolution. */
export interface ResolvedBookMetadata {
  title: string;
  subtitle: string | null;
  authorNames: string[];
}

/** The display values for a comic series after resolution. */
export interface ResolvedComicSeriesMetadata {
  title: string;
}

/** The display values for a comic book after resolution. */
export interface ResolvedComicBookMetadata {
  title: string | null;
  number: string | null;
}

type HardcoverBook = typeof hardcoverSchema.hardcoverBooks.$inferSelect;
type GoodreadsBook = typeof goodreadsSchema.goodreadsBooks.$inferSelect;

interface EmbeddedBook {
  id: string;
  title: string;
  subtitle: string | null;
  manualFields: string[] | null;
}

/**
 * Resolves the title/subtitle/authors a user should actually see for a book.
 *
 * The audiobook and ebook detail endpoints resolve these fields through the
 * configured metadata priority (manual → embedded → hardcover → goodreads),
 * but every other endpoint that mentions a book — continue listening, listening
 * stats, series detail, lists — used to return the raw DB columns instead. That
 * made the same book render under two different names depending on where you
 * looked at it (e.g. `"Title (Unabridged)"` in a list vs `"Title"` on its own
 * page).
 *
 * Those endpoints have their own queries and cannot reuse the detail services
 * without pulling in far more data than they need, so this service owns the
 * batch lookup: give it ids, get back display metadata.
 *
 * Only the shared display triple is resolved here. Endpoints that surface the
 * full record (description, publisher, genres, series, …) resolve those fields
 * themselves via `resolveFieldByPriority`.
 */
@Injectable()
export class MetadataResolverService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<
      typeof audiobookSchema &
        typeof ebookSchema &
        typeof comicSchema &
        typeof comicvineSchema
    >,
    private readonly appSettingsService: AppSettingsService,
  ) {}

  /**
   * Resolve display metadata for the given audiobooks.
   * Ids with no matching row are simply absent from the returned map.
   */
  async forAudiobooks(
    audiobookIds: string[],
  ): Promise<Map<string, ResolvedBookMetadata>> {
    const ids = [...new Set(audiobookIds)];
    if (ids.length === 0) return new Map();

    const [books, authorRows, hardcoverLinks, goodreadsLinks, priority] =
      await Promise.all([
        this.db
          .select({
            id: audiobookSchema.audiobooks.id,
            title: audiobookSchema.audiobooks.title,
            subtitle: audiobookSchema.audiobooks.subtitle,
            manualFields: audiobookSchema.audiobooks.manualFields,
          })
          .from(audiobookSchema.audiobooks)
          .where(inArray(audiobookSchema.audiobooks.id, ids)),

        this.db
          .select({
            bookId: audiobookSchema.audiobookAuthors.audiobookId,
            name: audiobookSchema.people.name,
          })
          .from(audiobookSchema.audiobookAuthors)
          .innerJoin(
            audiobookSchema.people,
            eq(
              audiobookSchema.audiobookAuthors.personId,
              audiobookSchema.people.id,
            ),
          )
          .where(inArray(audiobookSchema.audiobookAuthors.audiobookId, ids))
          .orderBy(
            asc(audiobookSchema.audiobookAuthors.audiobookId),
            asc(audiobookSchema.audiobookAuthors.order),
          ),

        this.db
          .select({
            bookId: hardcoverSchema.hardcoverAudiobookLinks.audiobookId,
            book: hardcoverSchema.hardcoverBooks,
          })
          .from(hardcoverSchema.hardcoverAudiobookLinks)
          .innerJoin(
            hardcoverSchema.hardcoverBooks,
            eq(
              hardcoverSchema.hardcoverAudiobookLinks.hardcoverBookId,
              hardcoverSchema.hardcoverBooks.id,
            ),
          )
          .where(
            inArray(hardcoverSchema.hardcoverAudiobookLinks.audiobookId, ids),
          ),

        this.db
          .select({
            bookId: goodreadsSchema.goodreadsAudiobookLinks.audiobookId,
            book: goodreadsSchema.goodreadsBooks,
          })
          .from(goodreadsSchema.goodreadsAudiobookLinks)
          .innerJoin(
            goodreadsSchema.goodreadsBooks,
            eq(
              goodreadsSchema.goodreadsAudiobookLinks.goodreadsBookId,
              goodreadsSchema.goodreadsBooks.id,
            ),
          )
          .where(
            inArray(goodreadsSchema.goodreadsAudiobookLinks.audiobookId, ids),
          ),

        this.appSettingsService.getMetadataPriority(),
      ]);

    return this.buildLookup(
      books,
      authorRows,
      hardcoverLinks,
      goodreadsLinks,
      priority,
    );
  }

  /**
   * Resolve display metadata for the given ebooks.
   * Ids with no matching row are simply absent from the returned map.
   */
  async forEbooks(
    ebookIds: string[],
  ): Promise<Map<string, ResolvedBookMetadata>> {
    const ids = [...new Set(ebookIds)];
    if (ids.length === 0) return new Map();

    const [books, authorRows, hardcoverLinks, goodreadsLinks, priority] =
      await Promise.all([
        this.db
          .select({
            id: ebookSchema.ebooks.id,
            title: ebookSchema.ebooks.title,
            subtitle: ebookSchema.ebooks.subtitle,
            manualFields: ebookSchema.ebooks.manualFields,
          })
          .from(ebookSchema.ebooks)
          .where(inArray(ebookSchema.ebooks.id, ids)),

        this.db
          .select({
            bookId: ebookSchema.ebookAuthors.ebookId,
            name: audiobookSchema.people.name,
          })
          .from(ebookSchema.ebookAuthors)
          .innerJoin(
            audiobookSchema.people,
            eq(ebookSchema.ebookAuthors.personId, audiobookSchema.people.id),
          )
          .where(inArray(ebookSchema.ebookAuthors.ebookId, ids))
          .orderBy(
            asc(ebookSchema.ebookAuthors.ebookId),
            asc(ebookSchema.ebookAuthors.order),
          ),

        this.db
          .select({
            bookId: hardcoverSchema.hardcoverEbookLinks.ebookId,
            book: hardcoverSchema.hardcoverBooks,
          })
          .from(hardcoverSchema.hardcoverEbookLinks)
          .innerJoin(
            hardcoverSchema.hardcoverBooks,
            eq(
              hardcoverSchema.hardcoverEbookLinks.hardcoverBookId,
              hardcoverSchema.hardcoverBooks.id,
            ),
          )
          .where(inArray(hardcoverSchema.hardcoverEbookLinks.ebookId, ids)),

        this.db
          .select({
            bookId: goodreadsSchema.goodreadsEbookLinks.ebookId,
            book: goodreadsSchema.goodreadsBooks,
          })
          .from(goodreadsSchema.goodreadsEbookLinks)
          .innerJoin(
            goodreadsSchema.goodreadsBooks,
            eq(
              goodreadsSchema.goodreadsEbookLinks.goodreadsBookId,
              goodreadsSchema.goodreadsBooks.id,
            ),
          )
          .where(inArray(goodreadsSchema.goodreadsEbookLinks.ebookId, ids)),

        this.appSettingsService.getMetadataPriority(),
      ]);

    return this.buildLookup(
      books,
      authorRows,
      hardcoverLinks,
      goodreadsLinks,
      priority,
    );
  }

  /**
   * Resolve display titles for the given comic series.
   *
   * Comics run on their own priority chain (manual → embedded → comicvine),
   * configured separately from books.
   */
  async forComicSeries(
    seriesIds: string[],
  ): Promise<Map<string, ResolvedComicSeriesMetadata>> {
    const ids = [...new Set(seriesIds)];
    if (ids.length === 0) return new Map();

    const [rows, priority] = await Promise.all([
      this.db
        .select({
          id: comicSchema.comicSeries.id,
          title: comicSchema.comicSeries.title,
          manualFields: comicSchema.comicSeries.manualFields,
          volumeName: comicvineSchema.comicvineVolumes.name,
        })
        .from(comicSchema.comicSeries)
        .leftJoin(
          comicvineSchema.comicvineVolumeLinks,
          eq(
            comicvineSchema.comicvineVolumeLinks.seriesId,
            comicSchema.comicSeries.id,
          ),
        )
        .leftJoin(
          comicvineSchema.comicvineVolumes,
          eq(
            comicvineSchema.comicvineVolumeLinks.comicvineVolumeRowId,
            comicvineSchema.comicvineVolumes.id,
          ),
        )
        .where(inArray(comicSchema.comicSeries.id, ids)),

      this.appSettingsService.getComicMetadataPriority(),
    ]);

    return new Map(
      rows.map((row) => [
        row.id,
        {
          title:
            resolveFieldByPriority(
              'title',
              {
                manual: row.title,
                embedded: row.title,
                comicvine: row.volumeName,
              },
              priority.title,
              row.manualFields ?? [],
            ) ?? row.title,
        },
      ]),
    );
  }

  /**
   * Resolve display title/number for the given comic books.
   *
   * `title` stays nullable: plenty of issues have no title of their own and
   * are identified by number alone.
   */
  async forComicBooks(
    bookIds: string[],
  ): Promise<Map<string, ResolvedComicBookMetadata>> {
    const ids = [...new Set(bookIds)];
    if (ids.length === 0) return new Map();

    const [rows, priority] = await Promise.all([
      this.db
        .select({
          id: comicSchema.comicBooks.id,
          title: comicSchema.comicBooks.title,
          number: comicSchema.comicBooks.number,
          manualFields: comicSchema.comicBooks.manualFields,
          issueName: comicvineSchema.comicvineIssues.name,
          issueNumber: comicvineSchema.comicvineIssues.issueNumber,
        })
        .from(comicSchema.comicBooks)
        .leftJoin(
          comicvineSchema.comicvineIssueLinks,
          eq(
            comicvineSchema.comicvineIssueLinks.bookId,
            comicSchema.comicBooks.id,
          ),
        )
        .leftJoin(
          comicvineSchema.comicvineIssues,
          eq(
            comicvineSchema.comicvineIssueLinks.comicvineIssueRowId,
            comicvineSchema.comicvineIssues.id,
          ),
        )
        .where(inArray(comicSchema.comicBooks.id, ids)),

      this.appSettingsService.getComicMetadataPriority(),
    ]);

    return new Map(
      rows.map((row) => {
        const manualFields = row.manualFields ?? [];
        return [
          row.id,
          {
            title: resolveFieldByPriority(
              'title',
              {
                manual: row.title,
                embedded: row.title,
                comicvine: row.issueName,
              },
              priority.bookTitle,
              manualFields,
            ),
            number: resolveFieldByPriority(
              'number',
              {
                manual: row.number,
                embedded: row.number,
                comicvine: row.issueNumber,
              },
              priority.bookNumber,
              manualFields,
            ),
          },
        ];
      }),
    );
  }

  private buildLookup(
    books: EmbeddedBook[],
    authorRows: { bookId: string; name: string }[],
    hardcoverLinks: { bookId: string; book: HardcoverBook }[],
    goodreadsLinks: { bookId: string; book: GoodreadsBook }[],
    priority: MetadataFieldPriority,
  ): Map<string, ResolvedBookMetadata> {
    const authorsByBook = new Map<string, string[]>();
    for (const row of authorRows) {
      const current = authorsByBook.get(row.bookId) ?? [];
      current.push(row.name);
      authorsByBook.set(row.bookId, current);
    }

    const hcByBook = new Map(hardcoverLinks.map((l) => [l.bookId, l.book]));
    const grByBook = new Map(goodreadsLinks.map((l) => [l.bookId, l.book]));

    const result = new Map<string, ResolvedBookMetadata>();
    for (const book of books) {
      result.set(
        book.id,
        this.resolve(
          book,
          authorsByBook.get(book.id) ?? [],
          hcByBook.get(book.id) ?? null,
          grByBook.get(book.id) ?? null,
          priority,
        ),
      );
    }
    return result;
  }

  private resolve(
    book: EmbeddedBook,
    embeddedAuthorNames: string[],
    hardcover: HardcoverBook | null,
    goodreads: GoodreadsBook | null,
    priority: MetadataFieldPriority,
  ): ResolvedBookMetadata {
    const manualFields = book.manualFields ?? [];

    // resolveExternalTitle normalizes legacy combined "Title: Subtitle" values
    // from external sources against our separate title/subtitle columns.
    const title =
      resolveFieldByPriority(
        'title',
        {
          manual: book.title,
          embedded: book.title,
          hardcover: resolveExternalTitle(
            hardcover?.title,
            hardcover?.subtitle,
            book.title,
            book.subtitle,
          ),
          goodreads: resolveExternalTitle(
            goodreads?.title,
            goodreads?.subtitle,
            book.title,
            book.subtitle,
          ),
        },
        priority.title,
        manualFields,
      ) || book.title;

    const subtitle = resolveFieldByPriority(
      'subtitle',
      {
        manual: book.subtitle,
        embedded: book.subtitle,
        hardcover: hardcover?.subtitle,
        goodreads: goodreads?.subtitle,
      },
      priority.subtitle,
      manualFields,
    );

    const authorNames = resolveRelationByPriority(
      'author',
      {
        manual: embeddedAuthorNames,
        embedded: embeddedAuthorNames,
        hardcover: hardcover?.authorNames ?? [],
        goodreads: splitPersonNames(goodreads?.author),
      },
      priority.author,
      manualFields,
    );

    return { title, subtitle: subtitle ?? null, authorNames };
  }
}
