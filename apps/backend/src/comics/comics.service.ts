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
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as schema from './schema';
import * as audiobooksSchema from '../audiobooks/schema';
import * as usersSchema from '../users/schema';
import { AppSettingsService } from '../app-settings/app-settings.service';
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
  typeof schema & typeof audiobooksSchema & typeof usersSchema
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
      series: items.map(({ series, bookCount: count }) => ({
        id: series.id,
        title: series.title,
        publisher: series.publisher,
        startYear: series.startYear,
        status: series.status,
        bookCount: Number(count),
        totalIssueCount: series.totalIssueCount,
        coverUrl: this.resolveSeriesCoverUrl(series, fallbackCovers),
        createdAt: series.createdAt,
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

    const [books, genres, tags, creators] = await Promise.all([
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
    ]);

    const fallbackCovers = new Map<string, string>();
    const firstWithCover = books.find((b) => b.coverSource);
    if (firstWithCover) fallbackCovers.set(series.id, firstWithCover.id);

    return {
      id: series.id,
      title: series.title,
      sortTitle: series.sortTitle,
      description: series.description,
      publisher: series.publisher,
      imprint: series.imprint,
      startYear: series.startYear,
      totalIssueCount: series.totalIssueCount,
      language: series.language,
      ageRating: series.ageRating,
      status: series.status,
      folderPath: series.folderPath,
      manualFields: series.manualFields ?? [],
      coverUrl: this.resolveSeriesCoverUrl(series, fallbackCovers),
      genres,
      tags,
      creators,
      books: books.map((book) => this.toBookListItem(book)),
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

    const [[series], creators] = await Promise.all([
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
    ]);

    return {
      ...this.toBookListItem(book),
      summary: book.summary,
      storeDate: book.storeDate,
      filePath: book.filePath,
      manualFields: book.manualFields ?? [],
      series,
      creators,
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
    },
  ) {
    const [book] = await this.db
      .select()
      .from(schema.comicBooks)
      .where(eq(schema.comicBooks.id, id))
      .limit(1);
    if (!book) throw new NotFoundException('Comic book not found');

    const updates: Record<string, unknown> = { ...dto };
    if (dto.number !== undefined) {
      const sortNumber = computeSortNumber(dto.number);
      updates.sortNumber = sortNumber !== null ? String(sortNumber) : null;
    }

    const manualFields = Array.from(
      new Set([...(book.manualFields ?? []), ...Object.keys(dto)]),
    );
    updates.manualFields = manualFields;

    await this.db
      .update(schema.comicBooks)
      .set(updates)
      .where(eq(schema.comicBooks.id, id));

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
    if (fs.existsSync(coverPath)) return coverPath;
    return null;
  }

  /**
   * Absolute path to the book cover JPEG. Lazily re-extracts from the
   * comic file if the cached cover is missing but the book has an
   * embedded cover (mirrors the ebook cover behavior).
   */
  async getBookCoverFilePath(bookId: string): Promise<string | null> {
    const coverPath = this.appData.getComicBookCoverPath(bookId);
    if (fs.existsSync(coverPath)) return coverPath;

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
