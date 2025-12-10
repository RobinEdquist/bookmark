import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { ne, sql, count, sum } from 'drizzle-orm';
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
}
