// apps/backend/src/comics/comics.service.ts
import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  and,
  asc,
  desc,
  eq,
  exists,
  ilike,
  isNotNull,
  ne,
  notExists,
  sql,
  SQL,
} from 'drizzle-orm';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as schema from './schema';
import * as audiobooksSchema from '../audiobooks/schema';
import * as usersSchema from '../users/schema';
import * as comicvineSchema from '../comicvine/schema';
import { AppSettingsService } from '../app-settings/app-settings.service';
import type { MetadataSource } from '../app-settings/schema';
import { CoverService } from '../common/cover.service';
import { AppDataService } from '../app-data/app-data.service';
import { ComicMetadataProvider } from '../library-watcher/metadata/comic-metadata.provider';
import { ImageProcessingService } from '../common/image-processing.service';
import { computeSortNumber } from '../library-watcher/utils/comic-filename.utils';
import { AppEventsService } from '../events/app-events.service';
import { WsEventsService } from '../events/ws-events.service';

export interface ComicSeriesFilters {
  search?: string;
  publisher?: string;
  genreId?: string;
  sortBy?: 'title' | 'recentlyAdded' | 'startYear';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

const CONTAINER_MIME: Record<string, string> = {
  cbz: 'application/vnd.comicbook+zip',
  cbr: 'application/vnd.comicbook-rar',
  pdf: 'application/pdf',
};

type Db = NodePgDatabase<
  typeof schema &
    typeof audiobooksSchema &
    typeof usersSchema &
    typeof comicvineSchema
>;

@Injectable()
export class ComicsService {
  private readonly logger = new Logger(ComicsService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: Db,
    private appSettingsService: AppSettingsService,
    private coverService: CoverService,
    private imageProcessing: ImageProcessingService,
    private appData: AppDataService,
    private comicMetadataProvider: ComicMetadataProvider,
    private appEvents: AppEventsService,
    private wsEvents: WsEventsService,
  ) {}

  private async resolveFilePath(relativePath: string): Promise<string> {
    const libraryPath = await this.appSettingsService.getComicLibraryPath();
    if (!libraryPath) {
      throw new Error('Comic library path not configured');
    }
    return path.join(libraryPath, relativePath);
  }

  // ===== METADATA PRIORITY HELPERS =====

  /**
   * Check if a value is non-empty (not null, undefined, empty string, or empty array)
   */
  private hasValue<T>(value: T | null | undefined): value is T {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string' && value.trim() === '') return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
  }

  /**
   * Resolve a field value according to the configured priority order.
   * `manualFieldName` is the COLUMN name (used to check manualFields[]).
   * `priority` is the MetadataSource[] from ComicMetadataFieldPriority.
   */
  private resolveFieldByPriority<T>(
    manualFieldName: string,
    sources: {
      manual: T | null | undefined;
      embedded: T | null | undefined;
      comicvine: T | null | undefined;
    },
    priority: MetadataSource[],
    manualFields: string[],
  ): T | null {
    if (manualFields.includes(manualFieldName)) {
      if (this.hasValue(sources.manual)) return sources.manual;
    }
    for (const source of priority) {
      if (source === 'manual') continue;
      else if (source === 'embedded') {
        if (this.hasValue(sources.embedded)) return sources.embedded;
      } else if (source === 'comicvine') {
        if (this.hasValue(sources.comicvine)) return sources.comicvine;
      }
      // 'filename' / 'folder_image' / others are import-only
    }
    return sources.embedded ?? null; // fallback = original stored column
  }

  // ===== BLACKLIST =====

  async hasBlacklistedTags(seriesId: string, userId: string): Promise<boolean> {
    const result = await this.db
      .select({ one: sql`1` })
      .from(schema.comicSeriesTags)
      .innerJoin(
        usersSchema.userBlacklistedTags,
        and(
          eq(
            schema.comicSeriesTags.tagId,
            usersSchema.userBlacklistedTags.tagId,
          ),
          eq(usersSchema.userBlacklistedTags.userId, userId),
        ),
      )
      .where(eq(schema.comicSeriesTags.seriesId, seriesId))
      .limit(1);
    return result.length > 0;
  }

  async verifySeriesNotBlacklisted(
    seriesId: string,
    userId: string,
  ): Promise<void> {
    if (await this.hasBlacklistedTags(seriesId, userId)) {
      throw new ForbiddenException('Access denied');
    }
  }

  async verifyBookNotBlacklisted(
    bookId: string,
    userId: string,
  ): Promise<void> {
    const [book] = await this.db
      .select({ seriesId: schema.comicBooks.seriesId })
      .from(schema.comicBooks)
      .where(eq(schema.comicBooks.id, bookId))
      .limit(1);
    if (!book) throw new NotFoundException('Comic book not found');
    await this.verifySeriesNotBlacklisted(book.seriesId, userId);
  }

  // ===== SERIES QUERIES =====

  async findAllSeries(filters: ComicSeriesFilters = {}, userId?: string) {
    const {
      search,
      publisher,
      genreId,
      sortBy = 'title',
      sortOrder = 'asc',
      limit = 50,
      offset = 0,
    } = filters;

    const conditions = [ne(schema.comicSeries.status, 'hidden')];

    if (search) {
      conditions.push(ilike(schema.comicSeries.title, `%${search}%`));
    }
    if (publisher) {
      conditions.push(eq(schema.comicSeries.publisher, publisher));
    }
    if (genreId) {
      conditions.push(
        exists(
          this.db
            .select({ one: sql`1` })
            .from(schema.comicSeriesGenres)
            .where(
              and(
                eq(schema.comicSeriesGenres.seriesId, schema.comicSeries.id),
                eq(schema.comicSeriesGenres.genreId, genreId),
              ),
            ),
        ),
      );
    }
    if (userId) {
      conditions.push(
        notExists(
          this.db
            .select({ one: sql`1` })
            .from(schema.comicSeriesTags)
            .innerJoin(
              usersSchema.userBlacklistedTags,
              and(
                eq(
                  schema.comicSeriesTags.tagId,
                  usersSchema.userBlacklistedTags.tagId,
                ),
                eq(usersSchema.userBlacklistedTags.userId, userId),
              ),
            )
            .where(eq(schema.comicSeriesTags.seriesId, schema.comicSeries.id)),
        ),
      );
    }

    const orderBy =
      sortBy === 'recentlyAdded'
        ? sortOrder === 'asc'
          ? asc(schema.comicSeries.createdAt)
          : desc(schema.comicSeries.createdAt)
        : sortBy === 'startYear'
          ? sortOrder === 'asc'
            ? asc(schema.comicSeries.startYear)
            : desc(schema.comicSeries.startYear)
          : sortOrder === 'desc'
            ? desc(
                sql`coalesce(${schema.comicSeries.sortTitle}, ${schema.comicSeries.title})`,
              )
            : asc(
                sql`coalesce(${schema.comicSeries.sortTitle}, ${schema.comicSeries.title})`,
              );

    const bookCount = this.db
      .select({ value: sql<number>`count(*)` })
      .from(schema.comicBooks)
      .where(
        and(
          eq(schema.comicBooks.seriesId, schema.comicSeries.id),
          ne(schema.comicBooks.status, 'hidden'),
        ),
      );

    const [items, [{ total }]] = await Promise.all([
      this.db
        .select({
          series: schema.comicSeries,
          bookCount: sql<number>`(${bookCount})`,
          comicvineLinked: sql<boolean>`exists(select 1 from ${comicvineSchema.comicvineVolumeLinks} where ${comicvineSchema.comicvineVolumeLinks.seriesId} = ${schema.comicSeries.id})`,
        })
        .from(schema.comicSeries)
        .where(and(...conditions))
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset),
      this.db
        .select({ total: sql<number>`count(*)` })
        .from(schema.comicSeries)
        .where(and(...conditions)),
    ]);

    // Resolve fallback covers (first book with a cover) in one batch
    const seriesIds = items.map((i) => i.series.id);
    const fallbackCovers = new Map<string, string>();
    if (seriesIds.length > 0) {
      // Correction: use sql.join to properly expand array into IN (...)
      const rows = await this.db.execute(sql`
        SELECT DISTINCT ON (series_id) series_id, id
        FROM comic_books
        WHERE series_id IN (${sql.join(
          seriesIds.map((id) => sql`${id}`),
          sql`, `,
        )})
          AND cover_source IS NOT NULL
          AND status <> 'hidden'
        ORDER BY series_id, sort_number ASC NULLS LAST, created_at ASC
      `);
      for (const row of rows.rows as Array<{
        series_id: string;
        id: string;
      }>) {
        fallbackCovers.set(row.series_id, row.id);
      }
    }

    return {
      series: items.map(({ series, bookCount: count, comicvineLinked }) => ({
        id: series.id,
        title: series.title,
        publisher: series.publisher,
        startYear: series.startYear,
        status: series.status,
        bookCount: Number(count),
        totalIssueCount: series.totalIssueCount,
        coverUrl: this.resolveSeriesCoverUrl(series, fallbackCovers),
        createdAt: series.createdAt,
        comicvineLinked: Boolean(comicvineLinked),
      })),
      total: Number(total),
    };
  }

  private resolveSeriesCoverUrl(
    series: typeof schema.comicSeries.$inferSelect,
    fallbackCovers: Map<string, string>,
  ): string | null {
    const own = this.coverService.getCoverUrl(
      series.id,
      series.coverUrl,
      series.coverSource,
      'comics/series',
    );
    if (own) return own;
    const fallbackBookId = fallbackCovers.get(series.id);
    return fallbackBookId ? `/api/comics/books/${fallbackBookId}/cover` : null;
  }

  async getSeriesById(id: string, userId: string) {
    await this.verifySeriesNotBlacklisted(id, userId);

    const [series] = await this.db
      .select()
      .from(schema.comicSeries)
      .where(eq(schema.comicSeries.id, id))
      .limit(1);
    if (!series) throw new NotFoundException('Comic series not found');

    const [books, genres, tags, creators, volumeRows] = await Promise.all([
      this.db
        .select()
        .from(schema.comicBooks)
        .where(
          and(
            eq(schema.comicBooks.seriesId, id),
            ne(schema.comicBooks.status, 'hidden'),
          ),
        )
        .orderBy(
          sql`${schema.comicBooks.sortNumber} ASC NULLS LAST`,
          asc(schema.comicBooks.coverDate),
          asc(schema.comicBooks.fileName),
        ),
      this.db
        .select({
          id: audiobooksSchema.genres.id,
          name: audiobooksSchema.genres.name,
        })
        .from(schema.comicSeriesGenres)
        .innerJoin(
          audiobooksSchema.genres,
          eq(schema.comicSeriesGenres.genreId, audiobooksSchema.genres.id),
        )
        .where(eq(schema.comicSeriesGenres.seriesId, id)),
      this.db
        .select({
          id: audiobooksSchema.tags.id,
          name: audiobooksSchema.tags.name,
        })
        .from(schema.comicSeriesTags)
        .innerJoin(
          audiobooksSchema.tags,
          eq(schema.comicSeriesTags.tagId, audiobooksSchema.tags.id),
        )
        .where(eq(schema.comicSeriesTags.seriesId, id)),
      this.db
        .selectDistinct({
          personId: audiobooksSchema.people.id,
          name: audiobooksSchema.people.name,
          role: schema.comicBookCreators.role,
        })
        .from(schema.comicBookCreators)
        .innerJoin(
          schema.comicBooks,
          eq(schema.comicBookCreators.bookId, schema.comicBooks.id),
        )
        .innerJoin(
          audiobooksSchema.people,
          eq(schema.comicBookCreators.personId, audiobooksSchema.people.id),
        )
        .where(eq(schema.comicBooks.seriesId, id)),
      this.db
        .select({ volume: comicvineSchema.comicvineVolumes })
        .from(comicvineSchema.comicvineVolumeLinks)
        .innerJoin(
          comicvineSchema.comicvineVolumes,
          eq(
            comicvineSchema.comicvineVolumeLinks.comicvineVolumeRowId,
            comicvineSchema.comicvineVolumes.id,
          ),
        )
        .where(eq(comicvineSchema.comicvineVolumeLinks.seriesId, id))
        .limit(1),
    ]);

    const fallbackCovers = new Map<string, string>();
    const firstWithCover = books.find((b) => b.coverSource);
    if (firstWithCover) fallbackCovers.set(series.id, firstWithCover.id);

    const volume = volumeRows[0]?.volume ?? null;
    const comicPriority =
      await this.appSettingsService.getComicMetadataPriority();
    const mf = series.manualFields ?? [];

    // Missing-issue detection: gaps in the integer issue numbering up to the expected count.
    const presentInts = new Set<number>();
    for (const b of books) {
      // Only count plain single issues (skip annuals/TPBs/one-shots and non-integer numbers like "1.5").
      if (b.format !== 'single_issue' || b.number == null) continue;
      const n = Number(b.number);
      if (Number.isInteger(n) && n > 0) presentInts.add(n);
    }
    const maxPresent = presentInts.size ? Math.max(...presentInts) : 0;
    // Expected ceiling: the linked ComicVine volume's issue count, else the highest issue we have.
    const ceiling = volume?.countOfIssues ?? maxPresent;
    const missingIssues: string[] = [];
    for (let i = 1; i <= ceiling; i++) {
      if (!presentInts.has(i)) missingIssues.push(String(i));
    }

    return {
      id: series.id,
      title:
        this.resolveFieldByPriority(
          'title',
          {
            manual: series.title,
            embedded: series.title,
            comicvine: volume?.name,
          },
          comicPriority.title,
          mf,
        ) ?? series.title,
      sortTitle: series.sortTitle,
      description: this.resolveFieldByPriority(
        'description',
        {
          manual: series.description,
          embedded: series.description,
          comicvine: volume?.description,
        },
        comicPriority.description,
        mf,
      ),
      publisher: this.resolveFieldByPriority(
        'publisher',
        {
          manual: series.publisher,
          embedded: series.publisher,
          comicvine: volume?.publisherName,
        },
        comicPriority.publisher,
        mf,
      ),
      imprint: series.imprint,
      startYear: this.resolveFieldByPriority(
        'startYear',
        {
          manual: series.startYear,
          embedded: series.startYear,
          comicvine: volume?.startYear,
        },
        comicPriority.startYear,
        mf,
      ),
      totalIssueCount: series.totalIssueCount,
      language: series.language,
      ageRating: series.ageRating,
      status: series.status,
      folderPath: series.folderPath,
      manualFields: mf,
      coverUrl: this.resolveSeriesCoverUrl(series, fallbackCovers),
      genres,
      tags,
      creators,
      books: books.map((book) => this.toBookListItem(book)),
      comicvine: {
        linked: !!volume,
        volumeId: volume?.comicvineVolumeId ?? null,
        name: volume?.name ?? null,
        siteDetailUrl: volume?.siteDetailUrl ?? null,
        imageUrl: volume?.imageUrl ?? null,
      },
      missingIssues,
      createdAt: series.createdAt,
      updatedAt: series.updatedAt,
    };
  }

  private toBookListItem(book: typeof schema.comicBooks.$inferSelect) {
    return {
      id: book.id,
      seriesId: book.seriesId,
      title: book.title,
      number: book.number,
      sortNumber: book.sortNumber ? Number(book.sortNumber) : null,
      format: book.format,
      coverDate: book.coverDate,
      pageCount: book.pageCount,
      fileName: book.fileName,
      sizeBytes: book.sizeBytes,
      container: book.container,
      status: book.status,
      coverUrl: this.coverService.getCoverUrl(
        book.id,
        book.coverUrl,
        book.coverSource,
        'comics/books',
      ),
    };
  }

  async getBookById(id: string, userId: string) {
    await this.verifyBookNotBlacklisted(id, userId);

    const [book] = await this.db
      .select()
      .from(schema.comicBooks)
      .where(eq(schema.comicBooks.id, id))
      .limit(1);
    if (!book) throw new NotFoundException('Comic book not found');

    const [[series], creators, issueRows] = await Promise.all([
      this.db
        .select({
          id: schema.comicSeries.id,
          title: schema.comicSeries.title,
        })
        .from(schema.comicSeries)
        .where(eq(schema.comicSeries.id, book.seriesId))
        .limit(1),
      this.db
        .select({
          personId: audiobooksSchema.people.id,
          name: audiobooksSchema.people.name,
          role: schema.comicBookCreators.role,
          order: schema.comicBookCreators.order,
        })
        .from(schema.comicBookCreators)
        .innerJoin(
          audiobooksSchema.people,
          eq(schema.comicBookCreators.personId, audiobooksSchema.people.id),
        )
        .where(eq(schema.comicBookCreators.bookId, id))
        .orderBy(
          asc(schema.comicBookCreators.role),
          asc(schema.comicBookCreators.order),
        ),
      this.db
        .select({ issue: comicvineSchema.comicvineIssues })
        .from(comicvineSchema.comicvineIssueLinks)
        .innerJoin(
          comicvineSchema.comicvineIssues,
          eq(
            comicvineSchema.comicvineIssueLinks.comicvineIssueRowId,
            comicvineSchema.comicvineIssues.id,
          ),
        )
        .where(eq(comicvineSchema.comicvineIssueLinks.bookId, id))
        .limit(1),
    ]);

    const issue = issueRows[0]?.issue ?? null;
    const comicPriority =
      await this.appSettingsService.getComicMetadataPriority();
    const mf = book.manualFields ?? [];

    return {
      ...this.toBookListItem(book),
      // Override merged fields after the spread (toBookListItem carries raw title/number/coverDate)
      title: this.resolveFieldByPriority(
        'title',
        { manual: book.title, embedded: book.title, comicvine: issue?.name },
        comicPriority.bookTitle,
        mf,
      ),
      number: this.resolveFieldByPriority(
        'number',
        {
          manual: book.number,
          embedded: book.number,
          comicvine: issue?.issueNumber,
        },
        comicPriority.bookNumber,
        mf,
      ),
      coverDate: this.resolveFieldByPriority(
        'coverDate',
        {
          manual: book.coverDate,
          embedded: book.coverDate,
          comicvine: issue?.coverDate,
        },
        comicPriority.coverDate,
        mf,
      ),
      summary: this.resolveFieldByPriority(
        'summary',
        {
          manual: book.summary,
          embedded: book.summary,
          comicvine: issue?.description,
        },
        comicPriority.bookSummary,
        mf,
      ),
      storeDate: book.storeDate,
      filePath: book.filePath,
      manualFields: mf,
      series,
      creators,
      comicvine: {
        linked: !!issue,
        issueId: issue?.comicvineIssueId ?? null,
        name: issue?.name ?? null,
        issueNumber: issue?.issueNumber ?? null,
        siteDetailUrl: issue?.siteDetailUrl ?? null,
        imageUrl: issue?.imageUrl ?? null,
        suggestedCreators: issue?.personCredits ?? [],
      },
      createdAt: book.createdAt,
      updatedAt: book.updatedAt,
    };
  }

  // ===== UPDATES =====

  async updateSeries(
    id: string,
    dto: {
      title?: string;
      sortTitle?: string | null;
      description?: string | null;
      publisher?: string | null;
      imprint?: string | null;
      startYear?: number | null;
      totalIssueCount?: number | null;
      language?: string | null;
      ageRating?: string | null;
      genres?: string[];
      tags?: string[];
    },
  ) {
    const [series] = await this.db
      .select()
      .from(schema.comicSeries)
      .where(eq(schema.comicSeries.id, id))
      .limit(1);
    if (!series) throw new NotFoundException('Comic series not found');

    const { genres, tags, ...fields } = dto;

    const touchedFields = Object.keys(fields);
    if (genres !== undefined) touchedFields.push('genres');
    if (tags !== undefined) touchedFields.push('tags');
    const manualFields = Array.from(
      new Set([...(series.manualFields ?? []), ...touchedFields]),
    );

    if (Object.keys(fields).length > 0 || touchedFields.length > 0) {
      await this.db
        .update(schema.comicSeries)
        .set({ ...fields, manualFields })
        .where(eq(schema.comicSeries.id, id));
    }

    if (genres !== undefined) {
      await this.db
        .delete(schema.comicSeriesGenres)
        .where(eq(schema.comicSeriesGenres.seriesId, id));
      for (const name of genres) {
        const genreId = await this.findOrCreateNamed(
          audiobooksSchema.genres,
          name,
        );
        await this.db
          .insert(schema.comicSeriesGenres)
          .values({ seriesId: id, genreId })
          .onConflictDoNothing();
      }
    }

    if (tags !== undefined) {
      await this.db
        .delete(schema.comicSeriesTags)
        .where(eq(schema.comicSeriesTags.seriesId, id));
      for (const name of tags) {
        const tagId = await this.findOrCreateNamed(audiobooksSchema.tags, name);
        await this.db
          .insert(schema.comicSeriesTags)
          .values({ seriesId: id, tagId })
          .onConflictDoNothing();
      }
    }

    this.appEvents.comicSeriesUpdated(id);
    this.wsEvents.comicSeriesUpdated(id);
    return { success: true };
  }

  private async findOrCreateNamed(
    table: typeof audiobooksSchema.genres | typeof audiobooksSchema.tags,
    name: string,
  ): Promise<string> {
    const [existing] = await this.db
      .select({ id: table.id })
      .from(table)
      .where(sql`lower(${table.name}) = lower(${name})`)
      .limit(1);
    if (existing) return existing.id;
    const [created] = await this.db
      .insert(table)
      .values({ name: name.trim() })
      .returning({ id: table.id });
    return created.id;
  }

  async updateBook(
    id: string,
    dto: {
      title?: string | null;
      number?: string | null;
      format?: (typeof schema.comicBooks.$inferSelect)['format'];
      coverDate?: string | null;
      summary?: string | null;
      creators?: Array<{
        name: string;
        role:
          | 'writer'
          | 'penciller'
          | 'inker'
          | 'colorist'
          | 'letterer'
          | 'cover_artist'
          | 'editor'
          | 'other';
      }>;
    },
  ) {
    const [book] = await this.db
      .select()
      .from(schema.comicBooks)
      .where(eq(schema.comicBooks.id, id))
      .limit(1);
    if (!book) throw new NotFoundException('Comic book not found');

    // Pull creators out so it isn't spread into the DB .set() column update
    const { creators, ...scalarUpdates } = dto;

    const updates: Record<string, unknown> = { ...scalarUpdates };
    if (scalarUpdates.number !== undefined) {
      const sortNumber = computeSortNumber(scalarUpdates.number);
      updates.sortNumber = sortNumber !== null ? String(sortNumber) : null;
    }

    const manualFields = Array.from(
      new Set([
        ...(book.manualFields ?? []),
        ...Object.keys(scalarUpdates),
        ...(creators !== undefined ? ['creators'] : []),
      ]),
    );
    updates.manualFields = manualFields;

    await this.db
      .update(schema.comicBooks)
      .set(updates)
      .where(eq(schema.comicBooks.id, id));

    // Replace creators when provided
    if (creators !== undefined) {
      await this.db
        .delete(schema.comicBookCreators)
        .where(eq(schema.comicBookCreators.bookId, id));

      const orderByRole = new Map<string, number>();
      for (const creator of creators) {
        const order = orderByRole.get(creator.role) ?? 0;
        orderByRole.set(creator.role, order + 1);

        // Find or create person using upsert to handle race conditions
        const [person] = await this.db
          .insert(audiobooksSchema.people)
          .values({ name: creator.name })
          .onConflictDoUpdate({
            target: audiobooksSchema.people.name,
            set: { name: creator.name },
          })
          .returning();

        await this.db
          .insert(schema.comicBookCreators)
          .values({
            bookId: id,
            personId: person.id,
            role: creator.role,
            order,
          })
          .onConflictDoNothing();
      }
    }

    this.wsEvents.comicBookUpdated(id);
    return { success: true };
  }

  // ===== DELETES =====

  async deleteSeries(id: string, deleteFiles: boolean): Promise<void> {
    const [series] = await this.db
      .select()
      .from(schema.comicSeries)
      .where(eq(schema.comicSeries.id, id))
      .limit(1);
    if (!series) throw new NotFoundException('Comic series not found');

    if (deleteFiles) {
      const books = await this.db
        .select({ filePath: schema.comicBooks.filePath })
        .from(schema.comicBooks)
        .where(eq(schema.comicBooks.seriesId, id));
      for (const book of books) {
        try {
          await fsPromises.unlink(await this.resolveFilePath(book.filePath));
        } catch (error) {
          this.logger.warn(`Failed to delete file ${book.filePath}: ${error}`);
        }
      }
    }

    await this.db
      .delete(schema.comicSeries)
      .where(eq(schema.comicSeries.id, id));
    this.appEvents.comicSeriesDeleted(id);
    this.wsEvents.comicSeriesDeleted(id);
  }

  async deleteBook(id: string, deleteFiles: boolean): Promise<void> {
    const [book] = await this.db
      .select()
      .from(schema.comicBooks)
      .where(eq(schema.comicBooks.id, id))
      .limit(1);
    if (!book) throw new NotFoundException('Comic book not found');

    if (deleteFiles) {
      try {
        await fsPromises.unlink(await this.resolveFilePath(book.filePath));
      } catch (error) {
        this.logger.warn(`Failed to delete file ${book.filePath}: ${error}`);
      }
    }

    await this.db.delete(schema.comicBooks).where(eq(schema.comicBooks.id, id));
    this.appEvents.comicSeriesUpdated(book.seriesId);
    this.wsEvents.comicSeriesUpdated(book.seriesId);
  }

  // ===== FILTER SOURCES =====

  async listPublishers(search?: string) {
    const conditions: SQL[] = [isNotNull(schema.comicSeries.publisher)];
    if (search) {
      conditions.push(ilike(schema.comicSeries.publisher, `%${search}%`));
    }
    const rows = await this.db
      .selectDistinct({ publisher: schema.comicSeries.publisher })
      .from(schema.comicSeries)
      .where(and(...conditions))
      .orderBy(asc(schema.comicSeries.publisher));
    return rows.map((r) => r.publisher).filter(Boolean);
  }

  async listGenres(search?: string) {
    const conditions: SQL[] = [];
    if (search) {
      conditions.push(ilike(audiobooksSchema.genres.name, `%${search}%`));
    }
    return this.db
      .selectDistinct({
        id: audiobooksSchema.genres.id,
        name: audiobooksSchema.genres.name,
      })
      .from(audiobooksSchema.genres)
      .innerJoin(
        schema.comicSeriesGenres,
        eq(schema.comicSeriesGenres.genreId, audiobooksSchema.genres.id),
      )
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(audiobooksSchema.genres.name));
  }

  // ===== COVERS =====

  private seriesCoverConfig(seriesId: string) {
    return {
      entityId: seriesId,
      apiPath: 'comics/series',
      getCoverPath: (id: string) => this.appData.getComicSeriesCoverPath(id),
      verifyExists: async (id: string) => {
        const [row] = await this.db
          .select({ id: schema.comicSeries.id })
          .from(schema.comicSeries)
          .where(eq(schema.comicSeries.id, id))
          .limit(1);
        if (!row) throw new NotFoundException('Comic series not found');
      },
      updateCoverMetadata: async (id: string, coverUrl: string) => {
        await this.db
          .update(schema.comicSeries)
          .set({ coverUrl, coverSource: 'uploaded' })
          .where(eq(schema.comicSeries.id, id));
      },
      emitUpdateEvent: (id: string) => {
        this.wsEvents.comicSeriesUpdated(id);
      },
    };
  }

  private bookCoverConfig(bookId: string) {
    return {
      entityId: bookId,
      apiPath: 'comics/books',
      getCoverPath: (id: string) => this.appData.getComicBookCoverPath(id),
      verifyExists: async (id: string) => {
        const [row] = await this.db
          .select({ id: schema.comicBooks.id })
          .from(schema.comicBooks)
          .where(eq(schema.comicBooks.id, id))
          .limit(1);
        if (!row) throw new NotFoundException('Comic book not found');
      },
      updateCoverMetadata: async (id: string, coverUrl: string) => {
        await this.db
          .update(schema.comicBooks)
          .set({ coverUrl, coverSource: 'uploaded' })
          .where(eq(schema.comicBooks.id, id));
      },
      emitUpdateEvent: (id: string) => {
        this.wsEvents.comicBookUpdated(id);
      },
    };
  }

  async updateSeriesCoverFromFile(
    seriesId: string,
    buffer: Buffer,
  ): Promise<{ coverUrl: string }> {
    return this.coverService.updateCoverFromFile(
      buffer,
      this.seriesCoverConfig(seriesId),
    );
  }

  async updateSeriesCoverFromUrl(
    seriesId: string,
    url: string,
  ): Promise<{ coverUrl: string }> {
    return this.coverService.updateCoverFromUrl(
      url,
      this.seriesCoverConfig(seriesId),
    );
  }

  async updateBookCoverFromFile(
    bookId: string,
    buffer: Buffer,
  ): Promise<{ coverUrl: string }> {
    return this.coverService.updateCoverFromFile(
      buffer,
      this.bookCoverConfig(bookId),
    );
  }

  async updateBookCoverFromUrl(
    bookId: string,
    url: string,
  ): Promise<{ coverUrl: string }> {
    return this.coverService.updateCoverFromUrl(
      url,
      this.bookCoverConfig(bookId),
    );
  }

  /** Absolute path to the series cover JPEG, or null if none exists. */
  async getSeriesCoverFilePath(seriesId: string): Promise<string | null> {
    const coverPath = this.appData.getComicSeriesCoverPath(seriesId);
    try {
      await fsPromises.access(coverPath);
      return coverPath;
    } catch {
      // not cached
    }
    return null;
  }

  /**
   * Absolute path to the book cover JPEG. Lazily re-extracts from the
   * comic file if the cached cover is missing but the book has an
   * embedded cover (mirrors the ebook cover behavior).
   */
  async getBookCoverFilePath(bookId: string): Promise<string | null> {
    const coverPath = this.appData.getComicBookCoverPath(bookId);
    try {
      await fsPromises.access(coverPath);
      return coverPath;
    } catch {
      // not cached
    }

    const [book] = await this.db
      .select()
      .from(schema.comicBooks)
      .where(eq(schema.comicBooks.id, bookId))
      .limit(1);
    if (!book || !book.coverSource) return null;

    try {
      const absolute = await this.resolveFilePath(book.filePath);
      const cover =
        await this.comicMetadataProvider.extractCoverFromFile(absolute);
      if (!cover) return null;
      const processed = await this.imageProcessing.processCover(cover.data);
      await fsPromises.writeFile(coverPath, processed);
      return coverPath;
    } catch (error) {
      this.logger.warn(
        `Lazy cover extraction failed for book ${bookId}: ${error}`,
      );
      return null;
    }
  }

  // ===== DOWNLOADS =====

  async getBookDownloadInfo(bookId: string): Promise<{
    filePath: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
  }> {
    const [book] = await this.db
      .select()
      .from(schema.comicBooks)
      .where(eq(schema.comicBooks.id, bookId))
      .limit(1);
    if (!book) throw new NotFoundException('Comic book not found');

    const filePath = await this.resolveFilePath(book.filePath);
    return {
      filePath,
      fileName: book.fileName,
      mimeType: CONTAINER_MIME[book.container] ?? 'application/octet-stream',
      fileSize: book.sizeBytes,
    };
  }

  async getSeriesDownloadInfo(seriesId: string): Promise<{
    seriesTitle: string;
    files: Array<{ absolutePath: string; fileName: string }>;
  }> {
    const [series] = await this.db
      .select({ title: schema.comicSeries.title })
      .from(schema.comicSeries)
      .where(eq(schema.comicSeries.id, seriesId))
      .limit(1);
    if (!series) throw new NotFoundException('Comic series not found');

    const books = await this.db
      .select({
        filePath: schema.comicBooks.filePath,
        fileName: schema.comicBooks.fileName,
      })
      .from(schema.comicBooks)
      .where(
        and(
          eq(schema.comicBooks.seriesId, seriesId),
          ne(schema.comicBooks.status, 'hidden'),
        ),
      )
      .orderBy(sql`${schema.comicBooks.sortNumber} ASC NULLS LAST`);

    if (books.length === 0) {
      throw new NotFoundException('Series has no downloadable books');
    }

    const files: Array<{ absolutePath: string; fileName: string }> = [];
    for (const book of books) {
      files.push({
        absolutePath: await this.resolveFilePath(book.filePath),
        fileName: book.fileName,
      });
    }
    return { seriesTitle: series.title, files };
  }
}
