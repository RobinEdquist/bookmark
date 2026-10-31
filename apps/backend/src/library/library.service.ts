import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { ne, sql, count, sum, eq, inArray } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import { CoverService } from '../common/cover.service';
import { MetadataEntityService } from '../common/metadata-entity.service';
import { MetadataResolverService } from '../common/metadata-resolver.service';
import * as audiobookSchema from '../audiobooks/schema';
import * as ebookSchema from '../ebooks/schema';
import * as comicsSchema from '../comics/schema';

type Schema = typeof audiobookSchema & typeof ebookSchema & typeof comicsSchema;

export interface LibrarySearchItem {
  id: string;
  title: string;
  subtitle: string | null;
  coverUrl: string | null;
  coverUpdatedAt: Date | null;
  authors: Array<{ id: string; name: string }>;
  similarity: number;
}

type SearchRow = {
  id: string;
  title: string;
  subtitle: string | null;
  cover_url: string | null;
  cover_source: string | null;
  updated_at: Date;
  similarity: number;
};

export interface LibraryStats {
  audiobookCount: number;
  totalDuration: number;
  seriesCount: number;
  authorCount: number;
  ebookCount: number;
  totalPages: number;
  comicSeriesCount: number;
  comicBookCount: number;
}

@Injectable()
export class LibraryService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: NodePgDatabase<Schema>,
    private readonly coverService: CoverService,
    private readonly metadataResolver: MetadataResolverService,
    private readonly metadataEntityService: MetadataEntityService,
  ) {}

  async getStats(): Promise<LibraryStats> {
    // Get audiobook count (excluding hidden)
    const [audiobookResult] = await this.db
      .select({ count: count() })
      .from(audiobookSchema.audiobooks)
      .where(ne(audiobookSchema.audiobooks.status, 'hidden'));

    // Get total duration (excluding hidden)
    const [durationResult] = await this.db
      .select({ total: sum(audiobookSchema.audiobooks.duration) })
      .from(audiobookSchema.audiobooks)
      .where(ne(audiobookSchema.audiobooks.status, 'hidden'));

    // Get series count
    const [seriesResult] = await this.db
      .select({ count: count() })
      .from(audiobookSchema.series);

    // Get unique author count (people who have authored at least one audiobook or ebook)
    const authorResult = await this.db.execute(sql`
      SELECT COUNT(DISTINCT person_id) as count FROM (
        SELECT person_id FROM audiobook_authors
        UNION
        SELECT person_id FROM ebook_authors
      ) combined_authors
    `);

    // Get ebook count (excluding hidden)
    const [ebookResult] = await this.db
      .select({ count: count() })
      .from(ebookSchema.ebooks)
      .where(ne(ebookSchema.ebooks.status, 'hidden'));

    // Get total pages (excluding hidden, only count books with page count)
    const [pagesResult] = await this.db
      .select({ total: sum(ebookSchema.ebooks.pageCount) })
      .from(ebookSchema.ebooks)
      .where(ne(ebookSchema.ebooks.status, 'hidden'));

    // Get comic series count (excluding hidden)
    const [comicSeriesResult] = await this.db
      .select({ count: count() })
      .from(comicsSchema.comicSeries)
      .where(ne(comicsSchema.comicSeries.status, 'hidden'));

    // Get comic book count (excluding hidden)
    const [comicBookResult] = await this.db
      .select({ count: count() })
      .from(comicsSchema.comicBooks)
      .where(ne(comicsSchema.comicBooks.status, 'hidden'));

    return {
      audiobookCount: audiobookResult?.count ?? 0,
      totalDuration: Number(durationResult?.total ?? 0),
      seriesCount: seriesResult?.count ?? 0,
      authorCount: Number(
        (authorResult.rows as { count: string | number }[])[0]?.count ?? 0,
      ),
      ebookCount: ebookResult?.count ?? 0,
      totalPages: Number(pagesResult?.total ?? 0),
      comicSeriesCount: comicSeriesResult?.count ?? 0,
      comicBookCount: comicBookResult?.count ?? 0,
    };
  }

  async searchLibrary(
    query: string,
    contentType: 'all' | 'audiobooks' | 'ebooks' = 'all',
    limit: number = 10,
  ): Promise<{
    audiobooks: LibrarySearchItem[];
    ebooks: LibrarySearchItem[];
  }> {
    const similarityThreshold = 0.3;
    let audiobooks: LibrarySearchItem[] = [];
    let ebooks: LibrarySearchItem[] = [];

    if (contentType === 'all' || contentType === 'audiobooks') {
      const audiobookResults = await this.db.execute(sql`
        SELECT DISTINCT ON (a.id)
          a.id,
          a.title,
          a.subtitle,
          a.cover_url,
          a.cover_source,
          a.updated_at,
          GREATEST(
            COALESCE(similarity(a.title, ${query}), 0),
            COALESCE(similarity(a.subtitle, ${query}), 0),
            COALESCE(MAX(similarity(p.name, ${query})) OVER (PARTITION BY a.id), 0)
          ) as similarity
        FROM audiobooks a
        LEFT JOIN audiobook_authors aa ON a.id = aa.audiobook_id
        LEFT JOIN people p ON aa.person_id = p.id
        WHERE a.status != 'hidden'
          AND (
            similarity(a.title, ${query}) > ${similarityThreshold}
            OR similarity(a.subtitle, ${query}) > ${similarityThreshold}
            OR similarity(p.name, ${query}) > ${similarityThreshold}
          )
        ORDER BY a.id, similarity DESC
        LIMIT ${limit}
      `);

      audiobooks = await this.toSearchItems(
        audiobookResults.rows as SearchRow[],
        'audiobooks',
      );

      // Sort by similarity descending
      audiobooks.sort((a, b) => b.similarity - a.similarity);
    }

    if (contentType === 'all' || contentType === 'ebooks') {
      const ebookResults = await this.db.execute(sql`
        SELECT DISTINCT ON (e.id)
          e.id,
          e.title,
          e.subtitle,
          e.cover_url,
          e.cover_source,
          e.updated_at,
          GREATEST(
            COALESCE(similarity(e.title, ${query}), 0),
            COALESCE(similarity(e.subtitle, ${query}), 0),
            COALESCE(MAX(similarity(p.name, ${query})) OVER (PARTITION BY e.id), 0)
          ) as similarity
        FROM ebooks e
        LEFT JOIN ebook_authors ea ON e.id = ea.ebook_id
        LEFT JOIN people p ON ea.person_id = p.id
        WHERE e.status != 'hidden'
          AND (
            similarity(e.title, ${query}) > ${similarityThreshold}
            OR similarity(e.subtitle, ${query}) > ${similarityThreshold}
            OR similarity(p.name, ${query}) > ${similarityThreshold}
          )
        ORDER BY e.id, similarity DESC
        LIMIT ${limit}
      `);

      ebooks = await this.toSearchItems(
        ebookResults.rows as SearchRow[],
        'ebooks',
      );

      // Sort by similarity descending
      ebooks.sort((a, b) => b.similarity - a.similarity);
    }

    return { audiobooks, ebooks };
  }

  /**
   * Show the title, subtitle and authors the detail pages show, so a match
   * isn't listed here under its raw file metadata.
   */
  private async toSearchItems(
    rows: SearchRow[],
    mediaType: 'audiobooks' | 'ebooks',
  ): Promise<LibrarySearchItem[]> {
    if (rows.length === 0) return [];

    const ids = rows.map((row) => row.id);
    const [metadata, ownAuthors] = await Promise.all([
      mediaType === 'audiobooks'
        ? this.metadataResolver.forAudiobooks(ids)
        : this.metadataResolver.forEbooks(ids),
      this.findOwnAuthors(ids, mediaType),
    ]);

    // Resolved names may come from Hardcover or Goodreads. Those authors are
    // imported into people, so look them up there to keep the ids routable.
    const ownAuthorByName = (bookId: string, name: string) =>
      ownAuthors
        .get(bookId)
        ?.find((a) => a.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    const externalPeople = await this.metadataEntityService.findPeopleByNames(
      rows.flatMap(
        (row) =>
          metadata
            .get(row.id)
            ?.authorNames.filter((name) => !ownAuthorByName(row.id, name)) ??
          [],
      ),
    );

    return rows.map((row) => {
      const resolved = metadata.get(row.id);
      const authors = resolved
        ? resolved.authorNames.flatMap((name) => {
            const person =
              ownAuthorByName(row.id, name) ??
              externalPeople.get(name.toLocaleLowerCase());
            return person ? [{ id: person.id, name: person.name }] : [];
          })
        : (ownAuthors.get(row.id) ?? []);
      const coverUrl = this.coverService.getCoverUrl(
        row.id,
        row.cover_url,
        row.cover_source,
        mediaType,
      );

      return {
        id: row.id,
        title: resolved?.title ?? row.title,
        subtitle: resolved?.subtitle ?? row.subtitle,
        coverUrl,
        coverUpdatedAt: coverUrl ? row.updated_at : null,
        authors,
        similarity: Number(row.similarity),
      };
    });
  }

  private async findOwnAuthors(
    ids: string[],
    mediaType: 'audiobooks' | 'ebooks',
  ): Promise<Map<string, { id: string; name: string }[]>> {
    const rows =
      mediaType === 'audiobooks'
        ? await this.db
            .select({
              bookId: audiobookSchema.audiobookAuthors.audiobookId,
              id: audiobookSchema.people.id,
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
        : await this.db
            .select({
              bookId: ebookSchema.ebookAuthors.ebookId,
              id: audiobookSchema.people.id,
              name: audiobookSchema.people.name,
            })
            .from(ebookSchema.ebookAuthors)
            .innerJoin(
              audiobookSchema.people,
              eq(ebookSchema.ebookAuthors.personId, audiobookSchema.people.id),
            )
            .where(inArray(ebookSchema.ebookAuthors.ebookId, ids));

    const byBook = new Map<string, { id: string; name: string }[]>();
    for (const { bookId, id, name } of rows) {
      byBook.set(bookId, [...(byBook.get(bookId) ?? []), { id, name }]);
    }
    return byBook;
  }
}
