import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, desc, sql, asc, ilike } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as schema from '../audiobooks/schema';
import * as ebookSchema from '../ebooks/schema';

export interface SeriesAudiobook {
  id: string;
  coverUrl: string | null;
}

export interface SeriesEbook {
  id: string;
  coverUrl: string | null;
}

export interface SeriesWithBooks {
  id: string;
  name: string;
  bookCount: number;
  audiobooks: SeriesAudiobook[];
  ebooks: SeriesEbook[];
  lastUpdated: Date;
}

export interface SeriesDetailAudiobook {
  id: string;
  title: string;
  subtitle: string | null;
  coverUrl: string | null;
  duration: number | null;
  authors: { name: string }[];
  order: string;
  status: 'available' | 'missing' | 'importing' | 'hidden';
}

export interface SeriesDetailEbook {
  id: string;
  title: string;
  subtitle: string | null;
  coverUrl: string | null;
  pageCount: number | null;
  authors: { name: string }[];
  order: string;
  status: 'available' | 'missing' | 'importing' | 'hidden';
}

export interface SeriesDetail {
  id: string;
  name: string;
  description: string | null;
  audiobooks: SeriesDetailAudiobook[];
  ebooks: SeriesDetailEbook[];
  audiobookCount: number;
  ebookCount: number;
}

export interface UpdatedSeries {
  id: string;
  name: string;
  description: string | null;
}

export type SortBy = 'name' | 'lastUpdated' | 'bookCount';
export type SortOrder = 'asc' | 'desc';

@Injectable()
export class SeriesService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: NodePgDatabase<typeof schema>,
  ) {}

  async getRecentlyUpdated(
    limit?: number,
  ): Promise<{ series: SeriesWithBooks[] }> {
    // Get series with their most recent book addition date (from both audiobooks and ebooks)
    const baseQuery = this.db
      .select({
        seriesId: schema.series.id,
        seriesName: schema.series.name,
        audiobookLastUpdated: sql<Date>`(
          SELECT max(ab.created_at) FROM audiobooks ab
          INNER JOIN audiobook_series abs ON ab.id = abs.audiobook_id
          WHERE abs.series_id = series.id AND ab.status != 'hidden'
        )`.as('audiobook_last_updated'),
        ebookLastUpdated: sql<Date>`(
          SELECT max(eb.created_at) FROM ebooks eb
          INNER JOIN ebook_series es ON eb.id = es.ebook_id
          WHERE es.series_id = series.id AND eb.status != 'hidden'
        )`.as('ebook_last_updated'),
        audiobookCount: sql<number>`COALESCE((
          SELECT count(*)::integer FROM audiobook_series abs
          INNER JOIN audiobooks ab ON abs.audiobook_id = ab.id
          WHERE abs.series_id = series.id AND ab.status != 'hidden'
        ), 0)`.as('audiobook_count'),
        ebookCount: sql<number>`COALESCE((
          SELECT count(*)::integer FROM ebook_series es
          INNER JOIN ebooks eb ON es.ebook_id = eb.id
          WHERE es.series_id = series.id AND eb.status != 'hidden'
        ), 0)`.as('ebook_count'),
      })
      .from(schema.series)
      .orderBy(
        desc(
          sql`GREATEST(
            COALESCE((SELECT max(ab.created_at) FROM audiobooks ab INNER JOIN audiobook_series abs ON ab.id = abs.audiobook_id WHERE abs.series_id = series.id), '1970-01-01'),
            COALESCE((SELECT max(eb.created_at) FROM ebooks eb INNER JOIN ebook_series es ON eb.id = es.ebook_id WHERE es.series_id = series.id), '1970-01-01')
          )`,
        ),
      );

    // Filter to only series that have at least one book
    const seriesWithLatest = (
      limit !== undefined ? await baseQuery.limit(limit) : await baseQuery
    ).filter(
      (s) => Number(s.audiobookCount || 0) + Number(s.ebookCount || 0) > 0,
    );

    // For each series, get the first 3 books (audiobooks and ebooks) for stacked covers
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

        // Get up to 3 ebooks for this series
        const ebooks = await this.db
          .select({
            id: ebookSchema.ebooks.id,
            coverUrl: ebookSchema.ebooks.coverUrl,
            coverSource: ebookSchema.ebooks.coverSource,
          })
          .from(ebookSchema.ebooks)
          .innerJoin(
            ebookSchema.ebookSeries,
            eq(ebookSchema.ebooks.id, ebookSchema.ebookSeries.ebookId),
          )
          .where(eq(ebookSchema.ebookSeries.seriesId, s.seriesId))
          .orderBy(asc(ebookSchema.ebookSeries.order))
          .limit(3);

        // Convert string dates from SQL to Date objects
        const abDate = s.audiobookLastUpdated
          ? new Date(s.audiobookLastUpdated)
          : null;
        const ebDate = s.ebookLastUpdated ? new Date(s.ebookLastUpdated) : null;

        const lastUpdated =
          abDate && ebDate
            ? new Date(Math.max(abDate.getTime(), ebDate.getTime()))
            : (abDate ?? ebDate ?? new Date());

        return {
          id: s.seriesId,
          name: s.seriesName,
          bookCount: Number(s.audiobookCount || 0) + Number(s.ebookCount || 0),
          audiobooks: audiobooks.map((ab) => ({
            id: ab.id,
            coverUrl: this.getAudiobookCoverUrl(
              ab.id,
              ab.coverUrl,
              ab.coverSource,
            ),
          })),
          ebooks: ebooks.map((eb) => ({
            id: eb.id,
            coverUrl: this.getEbookCoverUrl(eb.id, eb.coverUrl, eb.coverSource),
          })),
          lastUpdated,
        };
      }),
    );

    return { series: result };
  }

  async getAll(
    limit?: number,
    offset: number = 0,
    search?: string,
    sortBy: SortBy = 'name',
    sortOrder: SortOrder = 'asc',
  ): Promise<{ series: SeriesWithBooks[]; total: number }> {
    // Build the base query with audiobook and ebook counts
    // We need to get counts from both audiobooks and ebooks
    const baseSelectFields = {
      seriesId: schema.series.id,
      seriesName: schema.series.name,
      audiobookLastUpdated: sql<Date>`(
        SELECT max(ab.created_at) FROM audiobooks ab
        INNER JOIN audiobook_series abs ON ab.id = abs.audiobook_id
        WHERE abs.series_id = series.id
      )`.as('audiobook_last_updated'),
      ebookLastUpdated: sql<Date>`(
        SELECT max(eb.created_at) FROM ebooks eb
        INNER JOIN ebook_series es ON eb.id = es.ebook_id
        WHERE es.series_id = series.id
      )`.as('ebook_last_updated'),
      audiobookCount: sql<number>`COALESCE((
        SELECT count(*)::integer FROM audiobook_series abs
        INNER JOIN audiobooks ab ON abs.audiobook_id = ab.id
        WHERE abs.series_id = series.id AND ab.status != 'hidden'
      ), 0)`.as('audiobook_count'),
      ebookCount: sql<number>`COALESCE((
        SELECT count(*)::integer FROM ebook_series es
        INNER JOIN ebooks eb ON es.ebook_id = eb.id
        WHERE es.series_id = series.id AND eb.status != 'hidden'
      ), 0)`.as('ebook_count'),
    };

    // Build filter conditions
    const conditions = search
      ? ilike(schema.series.name, `%${search}%`)
      : undefined;

    // Build order clause based on sortBy
    const getOrderClause = () => {
      const direction = sortOrder === 'desc' ? desc : asc;
      switch (sortBy) {
        case 'lastUpdated':
          return direction(
            sql`GREATEST(
              COALESCE((SELECT max(ab.created_at) FROM audiobooks ab INNER JOIN audiobook_series abs ON ab.id = abs.audiobook_id WHERE abs.series_id = series.id), '1970-01-01'),
              COALESCE((SELECT max(eb.created_at) FROM ebooks eb INNER JOIN ebook_series es ON eb.id = es.ebook_id WHERE es.series_id = series.id), '1970-01-01')
            )`,
          );
        case 'bookCount':
          return direction(
            sql`(
              COALESCE((SELECT count(*)::integer FROM audiobook_series abs INNER JOIN audiobooks ab ON abs.audiobook_id = ab.id WHERE abs.series_id = series.id AND ab.status != 'hidden'), 0) +
              COALESCE((SELECT count(*)::integer FROM ebook_series es INNER JOIN ebooks eb ON es.ebook_id = eb.id WHERE es.series_id = series.id AND eb.status != 'hidden'), 0)
            )`,
          );
        case 'name':
        default:
          return direction(schema.series.name);
      }
    };

    // Get total count (with search filter if provided)
    const countQuery = conditions
      ? this.db
          .select({ count: sql<number>`count(*)` })
          .from(schema.series)
          .where(conditions)
      : this.db.select({ count: sql<number>`count(*)` }).from(schema.series);
    const [countResult] = await countQuery;

    // Build the main query
    let query = this.db.select(baseSelectFields).from(schema.series).$dynamic();

    if (conditions) {
      query = query.where(conditions);
    }

    // Apply ordering
    query = query.orderBy(getOrderClause());

    // Apply pagination
    if (limit !== undefined) {
      query = query.limit(limit).offset(offset);
    }

    const seriesList = await query;

    // For each series, get the first 3 books (audiobooks and ebooks) for stacked covers
    const result: SeriesWithBooks[] = await Promise.all(
      seriesList.map(async (s) => {
        // Get up to 3 audiobooks
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

        // Get up to 3 ebooks (will only use if not enough audiobooks for covers)
        const ebooks = await this.db
          .select({
            id: ebookSchema.ebooks.id,
            coverUrl: ebookSchema.ebooks.coverUrl,
            coverSource: ebookSchema.ebooks.coverSource,
          })
          .from(ebookSchema.ebooks)
          .innerJoin(
            ebookSchema.ebookSeries,
            eq(ebookSchema.ebooks.id, ebookSchema.ebookSeries.ebookId),
          )
          .where(eq(ebookSchema.ebookSeries.seriesId, s.seriesId))
          .orderBy(asc(ebookSchema.ebookSeries.order))
          .limit(3);

        // Convert string dates from SQL to Date objects
        const abDate = s.audiobookLastUpdated
          ? new Date(s.audiobookLastUpdated)
          : null;
        const ebDate = s.ebookLastUpdated ? new Date(s.ebookLastUpdated) : null;

        const lastUpdated =
          abDate && ebDate
            ? new Date(Math.max(abDate.getTime(), ebDate.getTime()))
            : (abDate ?? ebDate ?? new Date());

        return {
          id: s.seriesId,
          name: s.seriesName,
          bookCount: Number(s.audiobookCount || 0) + Number(s.ebookCount || 0),
          audiobooks: audiobooks.map((ab) => ({
            id: ab.id,
            coverUrl: this.getAudiobookCoverUrl(
              ab.id,
              ab.coverUrl,
              ab.coverSource,
            ),
          })),
          ebooks: ebooks.map((eb) => ({
            id: eb.id,
            coverUrl: this.getEbookCoverUrl(eb.id, eb.coverUrl, eb.coverSource),
          })),
          lastUpdated,
        };
      }),
    );

    return {
      series: result,
      total: Number(countResult?.count ?? 0),
    };
  }

  async getById(id: string): Promise<SeriesDetail> {
    // Get series info
    const [seriesInfo] = await this.db
      .select({
        id: schema.series.id,
        name: schema.series.name,
        description: schema.series.description,
      })
      .from(schema.series)
      .where(eq(schema.series.id, id));

    if (!seriesInfo) {
      throw new NotFoundException('Series not found');
    }

    // Get all audiobooks in series with their authors
    const audiobookRows = await this.db
      .select({
        id: schema.audiobooks.id,
        title: schema.audiobooks.title,
        subtitle: schema.audiobooks.subtitle,
        coverUrl: schema.audiobooks.coverUrl,
        coverSource: schema.audiobooks.coverSource,
        duration: schema.audiobooks.duration,
        status: schema.audiobooks.status,
        order: schema.audiobookSeries.order,
      })
      .from(schema.audiobooks)
      .innerJoin(
        schema.audiobookSeries,
        eq(schema.audiobooks.id, schema.audiobookSeries.audiobookId),
      )
      .where(eq(schema.audiobookSeries.seriesId, id))
      .orderBy(asc(schema.audiobookSeries.order));

    // Get authors for each audiobook
    const audiobooks: SeriesDetailAudiobook[] = await Promise.all(
      audiobookRows.map(async (ab) => {
        const authors = await this.db
          .select({ name: schema.people.name })
          .from(schema.audiobookAuthors)
          .innerJoin(
            schema.people,
            eq(schema.audiobookAuthors.personId, schema.people.id),
          )
          .where(eq(schema.audiobookAuthors.audiobookId, ab.id))
          .orderBy(asc(schema.audiobookAuthors.order));

        return {
          id: ab.id,
          title: ab.title,
          subtitle: ab.subtitle,
          coverUrl: this.getAudiobookCoverUrl(
            ab.id,
            ab.coverUrl,
            ab.coverSource,
          ),
          duration: ab.duration,
          authors,
          order: ab.order,
          status: ab.status,
        };
      }),
    );

    // Get all ebooks in series with their authors
    const ebookRows = await this.db
      .select({
        id: ebookSchema.ebooks.id,
        title: ebookSchema.ebooks.title,
        subtitle: ebookSchema.ebooks.subtitle,
        coverUrl: ebookSchema.ebooks.coverUrl,
        coverSource: ebookSchema.ebooks.coverSource,
        pageCount: ebookSchema.ebooks.pageCount,
        status: ebookSchema.ebooks.status,
        order: ebookSchema.ebookSeries.order,
      })
      .from(ebookSchema.ebooks)
      .innerJoin(
        ebookSchema.ebookSeries,
        eq(ebookSchema.ebooks.id, ebookSchema.ebookSeries.ebookId),
      )
      .where(eq(ebookSchema.ebookSeries.seriesId, id))
      .orderBy(asc(ebookSchema.ebookSeries.order));

    // Get authors for each ebook
    const ebooks: SeriesDetailEbook[] = await Promise.all(
      ebookRows.map(async (eb) => {
        const authors = await this.db
          .select({ name: schema.people.name })
          .from(ebookSchema.ebookAuthors)
          .innerJoin(
            schema.people,
            eq(ebookSchema.ebookAuthors.personId, schema.people.id),
          )
          .where(eq(ebookSchema.ebookAuthors.ebookId, eb.id))
          .orderBy(asc(ebookSchema.ebookAuthors.order));

        return {
          id: eb.id,
          title: eb.title,
          subtitle: eb.subtitle,
          coverUrl: this.getEbookCoverUrl(eb.id, eb.coverUrl, eb.coverSource),
          pageCount: eb.pageCount,
          authors,
          order: eb.order,
          status: eb.status,
        };
      }),
    );

    return {
      id: seriesInfo.id,
      name: seriesInfo.name,
      description: seriesInfo.description,
      audiobooks,
      ebooks,
      audiobookCount: audiobooks.length,
      ebookCount: ebooks.length,
    };
  }

  async update(id: string, data: { name: string }): Promise<UpdatedSeries> {
    const trimmedName = data.name.trim();
    if (!trimmedName) {
      throw new BadRequestException('Series name cannot be empty');
    }

    const [updatedSeries] = await this.db
      .update(schema.series)
      .set({ name: trimmedName })
      .where(eq(schema.series.id, id))
      .returning({
        id: schema.series.id,
        name: schema.series.name,
        description: schema.series.description,
      });

    if (!updatedSeries) {
      throw new NotFoundException('Series not found');
    }

    return updatedSeries;
  }

  private getAudiobookCoverUrl(
    id: string,
    coverUrl: string | null,
    coverSource: 'embedded' | 'uploaded' | 'folder_image' | null,
  ): string | null {
    if (coverSource || coverUrl) {
      return `/api/audiobooks/${id}/cover`;
    }
    return null;
  }

  private getEbookCoverUrl(
    id: string,
    coverUrl: string | null,
    coverSource: 'embedded' | 'uploaded' | 'folder_image' | null,
  ): string | null {
    if (coverSource || coverUrl) {
      return `/api/ebooks/${id}/cover`;
    }
    return null;
  }
}
