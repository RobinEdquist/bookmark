import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, ne, sql, count, sum } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as schema from '../audiobooks/schema';

export interface LibraryStats {
  audiobookCount: number;
  totalDuration: number;
  seriesCount: number;
  authorCount: number;
}

@Injectable()
export class LibraryService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: NodePgDatabase<typeof schema>,
  ) {}

  async getStats(): Promise<LibraryStats> {
    // Get audiobook count (excluding hidden)
    const [audiobookResult] = await this.db
      .select({ count: count() })
      .from(schema.audiobooks)
      .where(ne(schema.audiobooks.status, 'hidden'));

    // Get total duration (excluding hidden)
    const [durationResult] = await this.db
      .select({ total: sum(schema.audiobooks.duration) })
      .from(schema.audiobooks)
      .where(ne(schema.audiobooks.status, 'hidden'));

    // Get series count
    const [seriesResult] = await this.db
      .select({ count: count() })
      .from(schema.series);

    // Get unique author count (people who have authored at least one audiobook)
    const [authorResult] = await this.db
      .select({ count: sql<number>`count(distinct ${schema.audiobookAuthors.personId})` })
      .from(schema.audiobookAuthors);

    return {
      audiobookCount: audiobookResult?.count ?? 0,
      totalDuration: Number(durationResult?.total ?? 0),
      seriesCount: seriesResult?.count ?? 0,
      authorCount: Number(authorResult?.count ?? 0),
    };
  }
}
