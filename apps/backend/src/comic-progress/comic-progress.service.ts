import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, desc, eq, notExists, sql } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as schema from './schema';
import * as comicsSchema from '../comics/schema';
import * as usersSchema from '../users/schema';
import type { UpdateComicProgressDto } from './dto/update-comic-progress.dto';

export interface ComicProgressResponse {
  comicBookId: string;
  currentPage: number;
  pageCount: number;
  status: 'unread' | 'in_progress' | 'finished';
  startedAt: string;
  updatedAt: string;
}

export interface ComicProgressWithBook extends ComicProgressResponse {
  book: {
    id: string;
    seriesId: string;
    title: string | null;
    number: string | null;
  };
}

@Injectable()
export class ComicProgressService {
  private readonly logger = new Logger(ComicProgressService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<
      typeof schema & typeof comicsSchema & typeof usersSchema
    >,
  ) {}

  private toResponse(
    row: typeof schema.comicBookProgress.$inferSelect,
  ): ComicProgressResponse {
    return {
      comicBookId: row.comicBookId,
      currentPage: row.currentPage,
      pageCount: row.pageCount,
      status: row.status,
      startedAt: row.startedAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async getProgress(
    userId: string,
    bookId: string,
  ): Promise<ComicProgressResponse | null> {
    const [row] = await this.db
      .select()
      .from(schema.comicBookProgress)
      .where(
        and(
          eq(schema.comicBookProgress.userId, userId),
          eq(schema.comicBookProgress.comicBookId, bookId),
        ),
      );
    if (row) {
      this.logger.log(
        `[comic-progress] getProgress found userId=${userId} bookId=${bookId} currentPage=${row.currentPage} status=${row.status}`,
      );
    } else {
      this.logger.log(
        `[comic-progress] getProgress notFound userId=${userId} bookId=${bookId}`,
      );
    }
    return row ? this.toResponse(row) : null;
  }

  /**
   * Record that the user fetched `page` (zero-based) of `bookId`.
   * Monotonic: currentPage only moves forward. Flips to `finished` at the
   * last page. Idempotent and safe to call on every page request.
   */
  async recordPageView(
    userId: string,
    bookId: string,
    page: number,
    pageCount: number,
  ): Promise<ComicProgressResponse> {
    const isFinished = pageCount > 0 && page >= pageCount - 1;
    const status = isFinished ? 'finished' : ('in_progress' as const);
    this.logger.log(
      `[comic-progress] recordPageView userId=${userId} bookId=${bookId} page=${page} pageCount=${pageCount} isFinished=${isFinished} status=${status}`,
    );

    const [row] = await this.db
      .insert(schema.comicBookProgress)
      .values({
        userId,
        comicBookId: bookId,
        currentPage: page,
        pageCount,
        status,
      })
      .onConflictDoUpdate({
        target: [
          schema.comicBookProgress.userId,
          schema.comicBookProgress.comicBookId,
        ],
        set: {
          currentPage: sql`GREATEST(${schema.comicBookProgress.currentPage}, ${page})`,
          pageCount,
          status: sql`CASE
            WHEN ${isFinished} THEN 'finished'::comic_read_status
            WHEN ${schema.comicBookProgress.status} = 'finished' THEN 'finished'::comic_read_status
            ELSE 'in_progress'::comic_read_status
          END`,
          updatedAt: new Date(),
        },
      })
      .returning();

    this.logger.log(
      `[comic-progress] recordPageView upserted userId=${userId} bookId=${bookId} currentPage=${row.currentPage} status=${row.status}`,
    );
    return this.toResponse(row);
  }

  /**
   * Explicit user update (web app). Unlike recordPageView this can move the
   * position backward (e.g. "mark unread" -> page 0, status unread).
   */
  async updateProgress(
    userId: string,
    bookId: string,
    dto: UpdateComicProgressDto,
  ): Promise<ComicProgressResponse> {
    const [book] = await this.db
      .select({ id: comicsSchema.comicBooks.id })
      .from(comicsSchema.comicBooks)
      .where(eq(comicsSchema.comicBooks.id, bookId));

    if (!book) throw new NotFoundException('Comic book not found');

    const [row] = await this.db
      .insert(schema.comicBookProgress)
      .values({
        userId,
        comicBookId: bookId,
        currentPage: dto.currentPage,
        pageCount: dto.pageCount,
        status: dto.status,
        isHidden: false,
      })
      .onConflictDoUpdate({
        target: [
          schema.comicBookProgress.userId,
          schema.comicBookProgress.comicBookId,
        ],
        set: {
          currentPage: dto.currentPage,
          pageCount: dto.pageCount,
          status: dto.status,
          isHidden: false,
          updatedAt: new Date(),
        },
      })
      .returning();

    return this.toResponse(row);
  }

  /**
   * In-progress issues for the user, newest activity first, blacklist-filtered.
   * Finished books are intentionally excluded — this is the "continue reading" list.
   */
  async getOnDeck(userId: string): Promise<ComicProgressWithBook[]> {
    this.logger.log(`[comic-progress] getOnDeck userId=${userId}`);
    // Exclude books whose series has a tag the user has blacklisted
    const blacklistFilter = notExists(
      this.db
        .select({ one: sql`1` })
        .from(comicsSchema.comicSeriesTags)
        .innerJoin(
          usersSchema.userBlacklistedTags,
          and(
            eq(
              comicsSchema.comicSeriesTags.tagId,
              usersSchema.userBlacklistedTags.tagId,
            ),
            eq(usersSchema.userBlacklistedTags.userId, userId),
          ),
        )
        .where(
          eq(
            comicsSchema.comicSeriesTags.seriesId,
            comicsSchema.comicBooks.seriesId,
          ),
        ),
    );

    const rows = await this.db
      .select({
        progress: schema.comicBookProgress,
        book: {
          id: comicsSchema.comicBooks.id,
          seriesId: comicsSchema.comicBooks.seriesId,
          title: comicsSchema.comicBooks.title,
          number: comicsSchema.comicBooks.number,
        },
      })
      .from(schema.comicBookProgress)
      .innerJoin(
        comicsSchema.comicBooks,
        eq(schema.comicBookProgress.comicBookId, comicsSchema.comicBooks.id),
      )
      .where(
        and(
          eq(schema.comicBookProgress.userId, userId),
          eq(schema.comicBookProgress.status, 'in_progress'),
          eq(schema.comicBookProgress.isHidden, false),
          blacklistFilter,
        ),
      )
      .orderBy(desc(schema.comicBookProgress.updatedAt));

    this.logger.log(
      `[comic-progress] getOnDeck userId=${userId} resultCount=${rows.length}`,
    );
    return rows.map(({ progress, book }) => ({
      ...this.toResponse(progress),
      book,
    }));
  }

  async resetProgress(userId: string, bookId: string): Promise<void> {
    const result = await this.db
      .delete(schema.comicBookProgress)
      .where(
        and(
          eq(schema.comicBookProgress.userId, userId),
          eq(schema.comicBookProgress.comicBookId, bookId),
        ),
      );

    if (result.rowCount === 0) {
      throw new NotFoundException('Progress record not found');
    }
  }

  async hideProgress(userId: string, bookId: string): Promise<void> {
    const result = await this.db
      .update(schema.comicBookProgress)
      .set({ isHidden: true })
      .where(
        and(
          eq(schema.comicBookProgress.userId, userId),
          eq(schema.comicBookProgress.comicBookId, bookId),
        ),
      );

    if (result.rowCount === 0) {
      throw new NotFoundException('Progress record not found');
    }
  }
}
