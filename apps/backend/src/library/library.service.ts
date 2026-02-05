import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { ne, sql, count, sum, eq } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as audiobookSchema from '../audiobooks/schema';
import * as ebookSchema from '../ebooks/schema';

type Schema = typeof audiobookSchema & typeof ebookSchema;

export interface LibraryStats {
  audiobookCount: number;
  totalDuration: number;
  seriesCount: number;
  authorCount: number;
  ebookCount: number;
  totalPages: number;
}

@Injectable()
export class LibraryService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: NodePgDatabase<Schema>,
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

    return {
      audiobookCount: audiobookResult?.count ?? 0,
      totalDuration: Number(durationResult?.total ?? 0),
      seriesCount: seriesResult?.count ?? 0,
      authorCount: Number(
        (authorResult.rows as { count: string | number }[])[0]?.count ?? 0,
      ),
      ebookCount: ebookResult?.count ?? 0,
      totalPages: Number(pagesResult?.total ?? 0),
    };
  }

  async searchLibrary(
    query: string,
    contentType: 'all' | 'audiobooks' | 'ebooks' = 'all',
    limit: number = 10,
  ): Promise<{
    audiobooks: Array<{
      id: string;
      title: string;
      subtitle: string | null;
      coverUrl: string | null;
      authors: Array<{ id: string; name: string }>;
      similarity: number;
    }>;
    ebooks: Array<{
      id: string;
      title: string;
      subtitle: string | null;
      coverUrl: string | null;
      authors: Array<{ id: string; name: string }>;
      similarity: number;
    }>;
  }> {
    const similarityThreshold = 0.3;
    const audiobooks: Array<{
      id: string;
      title: string;
      subtitle: string | null;
      coverUrl: string | null;
      authors: Array<{ id: string; name: string }>;
      similarity: number;
    }> = [];
    const ebooks: Array<{
      id: string;
      title: string;
      subtitle: string | null;
      coverUrl: string | null;
      authors: Array<{ id: string; name: string }>;
      similarity: number;
    }> = [];

    if (contentType === 'all' || contentType === 'audiobooks') {
      const audiobookResults = await this.db.execute(sql`
        SELECT DISTINCT ON (a.id)
          a.id,
          a.title,
          a.subtitle,
          a.cover_url,
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

      // Get authors for each audiobook
      for (const row of audiobookResults.rows as Array<{
        id: string;
        title: string;
        subtitle: string | null;
        cover_url: string | null;
        similarity: number;
      }>) {
        const authorsResult = await this.db
          .select({
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
          .where(eq(audiobookSchema.audiobookAuthors.audiobookId, row.id));

        audiobooks.push({
          id: row.id,
          title: row.title,
          subtitle: row.subtitle,
          coverUrl: row.cover_url,
          authors: authorsResult,
          similarity: Number(row.similarity),
        });
      }

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

      // Get authors for each ebook
      for (const row of ebookResults.rows as Array<{
        id: string;
        title: string;
        subtitle: string | null;
        cover_url: string | null;
        similarity: number;
      }>) {
        const authorsResult = await this.db
          .select({
            id: audiobookSchema.people.id,
            name: audiobookSchema.people.name,
          })
          .from(ebookSchema.ebookAuthors)
          .innerJoin(
            audiobookSchema.people,
            eq(ebookSchema.ebookAuthors.personId, audiobookSchema.people.id),
          )
          .where(eq(ebookSchema.ebookAuthors.ebookId, row.id));

        ebooks.push({
          id: row.id,
          title: row.title,
          subtitle: row.subtitle,
          coverUrl: row.cover_url,
          authors: authorsResult,
          similarity: Number(row.similarity),
        });
      }

      // Sort by similarity descending
      ebooks.sort((a, b) => b.similarity - a.similarity);
    }

    return { audiobooks, ebooks };
  }
}
