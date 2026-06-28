import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { count, eq, gte, ne, sql, SQL } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import { getStartOfTodayUTC } from '../common/utils/date.utils';
import * as audiobooksSchema from '../audiobooks/schema';
import * as ebooksSchema from '../ebooks/schema';
import * as comicsSchema from '../comics/schema';
import * as requestsSchema from '../requests/schema';
import * as progressSchema from '../progress/schema';
import { StatsResponseDto } from './dto/stats-response.dto';

type StatsSchema = typeof audiobooksSchema &
  typeof ebooksSchema &
  typeof comicsSchema &
  typeof requestsSchema &
  typeof progressSchema;

@Injectable()
export class StatsService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<StatsSchema>,
  ) {}

  /**
   * Returns aggregate, server-wide library and request statistics suitable
   * for dashboards. All queries run concurrently.
   */
  async getStats(): Promise<StatsResponseDto> {
    const startOfToday = getStartOfTodayUTC();

    const [
      audiobooks,
      ebooks,
      comics,
      pendingRequests,
      requestsToday,
      finishedRequests,
      totalListeningTimeSeconds,
    ] = await Promise.all([
      this.countWhere(
        audiobooksSchema.audiobooks,
        ne(audiobooksSchema.audiobooks.status, 'hidden'),
      ),
      this.countWhere(
        ebooksSchema.ebooks,
        ne(ebooksSchema.ebooks.status, 'hidden'),
      ),
      this.countWhere(
        comicsSchema.comicBooks,
        ne(comicsSchema.comicBooks.status, 'hidden'),
      ),
      this.countWhere(
        requestsSchema.requests,
        eq(requestsSchema.requests.status, 'pending'),
      ),
      this.countWhere(
        requestsSchema.requests,
        gte(requestsSchema.requests.createdAt, startOfToday),
      ),
      this.countWhere(
        requestsSchema.requests,
        eq(requestsSchema.requests.status, 'complete'),
      ),
      this.sumListeningSeconds(),
    ]);

    return {
      audiobooks,
      ebooks,
      comics,
      pendingRequests,
      requestsToday,
      finishedRequests,
      totalListeningTimeSeconds,
    };
  }

  /**
   * Counts rows of a table matching the given condition.
   */
  private async countWhere(
    // Tables differ in type across content modules; the query shape is uniform.
    table: any,
    condition: SQL,
  ): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(table)
      .where(condition);
    return Number(row?.value ?? 0);
  }

  /**
   * Sums actual listening time (excludes pauses) across all users.
   */
  private async sumListeningSeconds(): Promise<number> {
    const [row] = await this.db
      .select({
        value: sql<number>`COALESCE(SUM(${progressSchema.listeningSessions.durationSeconds}), 0)`,
      })
      .from(progressSchema.listeningSessions);
    return Number(row?.value ?? 0);
  }
}
