import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, ne, desc, sql, asc } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as schema from '../audiobooks/schema';

export interface SeriesAudiobook {
  id: string;
  coverUrl: string | null;
}

export interface SeriesWithBooks {
  id: string;
  name: string;
  bookCount: number;
  audiobooks: SeriesAudiobook[];
  lastUpdated: Date;
}

@Injectable()
export class SeriesService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: NodePgDatabase<typeof schema>,
  ) {}

  async getRecentlyUpdated(
    limit?: number,
  ): Promise<{ series: SeriesWithBooks[] }> {
    // Get series with their most recent audiobook addition date
    // We need to find series where an audiobook was recently added
    const baseQuery = this.db
      .select({
        seriesId: schema.series.id,
        seriesName: schema.series.name,
        lastUpdated: sql<Date>`max(${schema.audiobooks.createdAt})`.as(
          'last_updated',
        ),
        bookCount: sql<number>`count(distinct ${schema.audiobooks.id})`.as(
          'book_count',
        ),
      })
      .from(schema.series)
      .innerJoin(
        schema.audiobookSeries,
        eq(schema.series.id, schema.audiobookSeries.seriesId),
      )
      .innerJoin(
        schema.audiobooks,
        eq(schema.audiobookSeries.audiobookId, schema.audiobooks.id),
      )
      .where(ne(schema.audiobooks.status, 'hidden'))
      .groupBy(schema.series.id, schema.series.name)
      .orderBy(desc(sql`max(${schema.audiobooks.createdAt})`));

    const seriesWithLatest =
      limit !== undefined ? await baseQuery.limit(limit) : await baseQuery;

    // For each series, get the first 3 audiobooks (for stacked covers)
    const result: SeriesWithBooks[] = await Promise.all(
      seriesWithLatest.map(async (s) => {
        // Get up to 3 audiobooks for this series (ordered by series order)
        const audiobooks = await this.db
          .select({
            id: schema.audiobooks.id,
            coverUrl: schema.audiobooks.coverUrl,
            coverSource: schema.audiobooks.coverSource,
          })
          .from(schema.audiobooks)
          .innerJoin(
            schema.audiobookSeries,
            eq(schema.audiobooks.id, schema.audiobookSeries.audiobookId),
          )
          .where(eq(schema.audiobookSeries.seriesId, s.seriesId))
          .orderBy(asc(schema.audiobookSeries.order))
          .limit(3);

        return {
          id: s.seriesId,
          name: s.seriesName,
          bookCount: Number(s.bookCount),
          audiobooks: audiobooks.map((ab) => ({
            id: ab.id,
            coverUrl: this.getCoverUrl(ab.id, ab.coverUrl, ab.coverSource),
          })),
          lastUpdated: s.lastUpdated,
        };
      }),
    );

    return { series: result };
  }

  async getAll(
    limit?: number,
    offset: number = 0,
  ): Promise<{ series: SeriesWithBooks[]; total: number }> {
    // Get total count
    const [countResult] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.series);

    // Get series with book count
    const baseQuery = this.db
      .select({
        seriesId: schema.series.id,
        seriesName: schema.series.name,
        lastUpdated: sql<Date>`max(${schema.audiobooks.createdAt})`.as(
          'last_updated',
        ),
        bookCount: sql<number>`count(distinct ${schema.audiobooks.id})`.as(
          'book_count',
        ),
      })
      .from(schema.series)
      .leftJoin(
        schema.audiobookSeries,
        eq(schema.series.id, schema.audiobookSeries.seriesId),
      )
      .leftJoin(
        schema.audiobooks,
        eq(schema.audiobookSeries.audiobookId, schema.audiobooks.id),
      )
      .groupBy(schema.series.id, schema.series.name)
      .orderBy(asc(schema.series.name));

    const seriesList =
      limit !== undefined
        ? await baseQuery.limit(limit).offset(offset)
        : await baseQuery;

    // For each series, get the first 3 audiobooks (for stacked covers)
    const result: SeriesWithBooks[] = await Promise.all(
      seriesList.map(async (s) => {
        const audiobooks = await this.db
          .select({
            id: schema.audiobooks.id,
            coverUrl: schema.audiobooks.coverUrl,
            coverSource: schema.audiobooks.coverSource,
          })
          .from(schema.audiobooks)
          .innerJoin(
            schema.audiobookSeries,
            eq(schema.audiobooks.id, schema.audiobookSeries.audiobookId),
          )
          .where(eq(schema.audiobookSeries.seriesId, s.seriesId))
          .orderBy(asc(schema.audiobookSeries.order))
          .limit(3);

        return {
          id: s.seriesId,
          name: s.seriesName,
          bookCount: Number(s.bookCount) || 0,
          audiobooks: audiobooks.map((ab) => ({
            id: ab.id,
            coverUrl: this.getCoverUrl(ab.id, ab.coverUrl, ab.coverSource),
          })),
          lastUpdated: s.lastUpdated ?? new Date(),
        };
      }),
    );

    return {
      series: result,
      total: Number(countResult?.count ?? 0),
    };
  }

  private getCoverUrl(
    id: string,
    coverUrl: string | null,
    coverSource: 'embedded' | 'uploaded' | 'filesystem' | null,
  ): string | null {
    if (coverSource || coverUrl) {
      return `/api/audiobooks/${id}/cover`;
    }
    return null;
  }
}
