import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, ilike, or, desc, asc, SQL, and } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as schema from './schema';

export interface AudiobookListItem {
  id: string;
  title: string;
  subtitle: string | null;
  duration: number | null;
  coverUrl: string | null;
  createdAt: Date;
  authors: { id: string; name: string }[];
  series: { id: string; name: string; order: string }[];
}

export interface AudiobookFilters {
  search?: string;
  genreId?: string;
  seriesId?: string;
  authorId?: string;
  language?: string;
  sortBy?: 'title' | 'createdAt' | 'author';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

@Injectable()
export class AudiobooksService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: NodePgDatabase<typeof schema>,
  ) {}

  async findAll(
    filters: AudiobookFilters = {},
  ): Promise<{ audiobooks: AudiobookListItem[]; total: number }> {
    const {
      search,
      language,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      limit = 24,
      offset = 0,
    } = filters;

    // Build where conditions
    const conditions: SQL[] = [];

    if (search) {
      conditions.push(
        or(
          ilike(schema.audiobooks.title, `%${search}%`),
          ilike(schema.audiobooks.subtitle, `%${search}%`),
        )!,
      );
    }

    if (language) {
      conditions.push(eq(schema.audiobooks.language, language));
    }

    // Base query for audiobooks
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const countResult = await this.db
      .select({ count: schema.audiobooks.id })
      .from(schema.audiobooks)
      .where(whereClause);
    const total = countResult.length;

    // Get audiobooks with sorting
    const orderBy =
      sortOrder === 'asc'
        ? asc(schema.audiobooks[sortBy === 'author' ? 'title' : sortBy])
        : desc(schema.audiobooks[sortBy === 'author' ? 'title' : sortBy]);

    const audiobooks = await this.db
      .select()
      .from(schema.audiobooks)
      .where(whereClause)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    // Fetch authors and series for each audiobook
    const result: AudiobookListItem[] = await Promise.all(
      audiobooks.map(async (ab) => {
        const authors = await this.db
          .select({
            id: schema.people.id,
            name: schema.people.name,
          })
          .from(schema.audiobookAuthors)
          .innerJoin(
            schema.people,
            eq(schema.audiobookAuthors.personId, schema.people.id),
          )
          .where(eq(schema.audiobookAuthors.audiobookId, ab.id))
          .orderBy(asc(schema.audiobookAuthors.order));

        const seriesData = await this.db
          .select({
            id: schema.series.id,
            name: schema.series.name,
            order: schema.audiobookSeries.order,
          })
          .from(schema.audiobookSeries)
          .innerJoin(
            schema.series,
            eq(schema.audiobookSeries.seriesId, schema.series.id),
          )
          .where(eq(schema.audiobookSeries.audiobookId, ab.id));

        return {
          id: ab.id,
          title: ab.title,
          subtitle: ab.subtitle,
          duration: ab.duration,
          coverUrl: ab.coverUrl,
          createdAt: ab.createdAt,
          authors,
          series: seriesData,
        };
      }),
    );

    return { audiobooks: result, total };
  }

  async findById(id: string) {
    const audiobook = await this.db
      .select()
      .from(schema.audiobooks)
      .where(eq(schema.audiobooks.id, id))
      .limit(1);

    if (audiobook.length === 0) {
      throw new NotFoundException('Audiobook not found');
    }

    const ab = audiobook[0];

    // Fetch all related data
    const [files, chapters, authors, narrators, seriesData, genres, tags] =
      await Promise.all([
        this.db
          .select()
          .from(schema.audiobookFiles)
          .where(eq(schema.audiobookFiles.audiobookId, id))
          .orderBy(asc(schema.audiobookFiles.order)),
        this.db
          .select()
          .from(schema.chapters)
          .where(eq(schema.chapters.audiobookId, id))
          .orderBy(asc(schema.chapters.order)),
        this.db
          .select({
            id: schema.people.id,
            name: schema.people.name,
            imageUrl: schema.people.imageUrl,
          })
          .from(schema.audiobookAuthors)
          .innerJoin(
            schema.people,
            eq(schema.audiobookAuthors.personId, schema.people.id),
          )
          .where(eq(schema.audiobookAuthors.audiobookId, id))
          .orderBy(asc(schema.audiobookAuthors.order)),
        this.db
          .select({
            id: schema.people.id,
            name: schema.people.name,
            imageUrl: schema.people.imageUrl,
          })
          .from(schema.audiobookNarrators)
          .innerJoin(
            schema.people,
            eq(schema.audiobookNarrators.personId, schema.people.id),
          )
          .where(eq(schema.audiobookNarrators.audiobookId, id))
          .orderBy(asc(schema.audiobookNarrators.order)),
        this.db
          .select({
            id: schema.series.id,
            name: schema.series.name,
            order: schema.audiobookSeries.order,
          })
          .from(schema.audiobookSeries)
          .innerJoin(
            schema.series,
            eq(schema.audiobookSeries.seriesId, schema.series.id),
          )
          .where(eq(schema.audiobookSeries.audiobookId, id)),
        this.db
          .select({ id: schema.genres.id, name: schema.genres.name })
          .from(schema.audiobookGenres)
          .innerJoin(
            schema.genres,
            eq(schema.audiobookGenres.genreId, schema.genres.id),
          )
          .where(eq(schema.audiobookGenres.audiobookId, id)),
        this.db
          .select({ id: schema.tags.id, name: schema.tags.name })
          .from(schema.audiobookTags)
          .innerJoin(schema.tags, eq(schema.audiobookTags.tagId, schema.tags.id))
          .where(eq(schema.audiobookTags.audiobookId, id)),
      ]);

    return {
      ...ab,
      files,
      chapters,
      authors,
      narrators,
      series: seriesData,
      genres,
      tags,
    };
  }
}
