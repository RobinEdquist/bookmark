import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, count, desc, eq, gte, inArray, sql, sum } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import { CoverService } from '../common/cover.service';
import { AppSettingsService } from '../app-settings/app-settings.service';
import type {
  MetadataSource,
  MetadataFieldPriority,
} from '../app-settings/schema';
import { splitPersonNames } from '../common/utils/name.utils';
import * as progressSchema from '../progress/schema';
import * as ebookProgressSchema from '../ebook-progress/schema';
import * as audiobookSchema from '../audiobooks/schema';
import * as ebooksSchema from '../ebooks/schema';
import * as authSchema from '../auth/schema';
import * as hardcoverSchema from '../hardcover/schema';
import * as goodreadsSchema from '../gr-finder/schema';
import type {
  UserProfileStatsDto,
  UserProfileActivityDto,
  LibraryProgressResponseDto,
  LibraryProgressItemDto,
  ListeningHistoryResponseDto,
} from './dto/user-profile-response.dto';

@Injectable()
export class UserProfileService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<
      typeof progressSchema &
        typeof ebookProgressSchema &
        typeof audiobookSchema &
        typeof ebooksSchema &
        typeof authSchema
    >,
    private readonly coverService: CoverService,
    private readonly appSettingsService: AppSettingsService,
  ) {}

  /**
   * Resolve a field value based on metadata priority settings.
   * Manual edits always take priority, then follows the configured order.
   */
  private resolveFieldByPriority<T>(
    fieldName: keyof MetadataFieldPriority,
    sources: {
      manual: T | null | undefined;
      embedded: T | null | undefined;
      hardcover: T | null | undefined;
      goodreads?: T | null | undefined;
    },
    priority: MetadataSource[],
    manualFields: string[],
  ): T | null {
    if (manualFields.includes(fieldName)) {
      const value = sources.manual;
      if (this.hasValue(value)) return value;
    }

    for (const source of priority) {
      if (source === 'manual') {
        continue;
      } else if (source === 'embedded') {
        const value = sources.embedded;
        if (this.hasValue(value)) return value;
      } else if (source === 'hardcover') {
        const value = sources.hardcover;
        if (this.hasValue(value)) return value;
      } else if (source === 'goodreads') {
        const value = sources.goodreads;
        if (this.hasValue(value)) return value;
      }
    }
    return sources.embedded ?? null;
  }

  private hasValue<T>(value: T | null | undefined): value is T {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string' && value.trim() === '') return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
  }

  /**
   * Get aggregated stats for a user profile.
   */
  async getStats(userId: string): Promise<UserProfileStatsDto> {
    const [
      userResult,
      totalListeningResult,
      audiobookProgressResult,
      ebookProgressResult,
      streaks,
    ] = await Promise.all([
      // User profile info
      this.db
        .select({
          id: authSchema.user.id,
          name: authSchema.user.name,
          email: authSchema.user.email,
          image: authSchema.user.image,
          role: authSchema.user.role,
          createdAt: authSchema.user.createdAt,
        })
        .from(authSchema.user)
        .where(eq(authSchema.user.id, userId)),

      // Total listening time
      this.db
        .select({
          total: sql<number>`COALESCE(SUM(${progressSchema.listeningSessions.durationSeconds}), 0)`,
        })
        .from(progressSchema.listeningSessions)
        .where(eq(progressSchema.listeningSessions.userId, userId)),

      // Audiobook progress counts (filter out barely-started: require >= 5 min listened)
      // Use COUNT(DISTINCT audiobook_id) to handle duplicate progress records
      this.db
        .select({
          completed: sql<number>`COUNT(DISTINCT CASE WHEN ${progressSchema.userAudiobookProgress.completed} THEN ${progressSchema.userAudiobookProgress.audiobookId} END)`,
          inProgress: sql<number>`COUNT(DISTINCT CASE WHEN NOT ${progressSchema.userAudiobookProgress.completed} AND ${progressSchema.userAudiobookProgress.currentPosition} > 300 THEN ${progressSchema.userAudiobookProgress.audiobookId} END)`,
        })
        .from(progressSchema.userAudiobookProgress)
        .innerJoin(
          audiobookSchema.audiobooks,
          eq(
            progressSchema.userAudiobookProgress.audiobookId,
            audiobookSchema.audiobooks.id,
          ),
        )
        .where(eq(progressSchema.userAudiobookProgress.userId, userId)),

      // Ebook progress counts (filter out barely-started: progress_percent rounds to 0%)
      this.db
        .select({
          completed: sql<number>`COALESCE(SUM(CASE WHEN ${ebookProgressSchema.userEbookProgress.completed} THEN 1 ELSE 0 END), 0)`,
          inProgress: sql<number>`COALESCE(SUM(CASE WHEN NOT ${ebookProgressSchema.userEbookProgress.completed} AND ${ebookProgressSchema.userEbookProgress.progressPercent} > 0 THEN 1 ELSE 0 END), 0)`,
        })
        .from(ebookProgressSchema.userEbookProgress)
        .where(eq(ebookProgressSchema.userEbookProgress.userId, userId)),

      // Streaks
      this.computeStreaks(userId),
    ]);

    const user = userResult[0];

    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image ?? null,
        role: user.role ?? null,
        createdAt: user.createdAt.toISOString(),
      },
      totalListeningTime: Number(totalListeningResult[0]?.total ?? 0),
      audiobooksCompleted: Number(audiobookProgressResult[0]?.completed ?? 0),
      audiobooksInProgress: Number(audiobookProgressResult[0]?.inProgress ?? 0),
      ebooksCompleted: Number(ebookProgressResult[0]?.completed ?? 0),
      ebooksInProgress: Number(ebookProgressResult[0]?.inProgress ?? 0),
      longestStreak: streaks.longestStreak,
      currentStreak: streaks.currentStreak,
    };
  }

  /**
   * Get daily listening data for a contribution graph.
   */
  async getActivity(
    userId: string,
    year: number,
  ): Promise<UserProfileActivityDto> {
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year + 1, 0, 1);

    const daysResult = await this.db
      .select({
        date: sql<string>`TO_CHAR(${progressSchema.listeningSessions.startedAt}, 'YYYY-MM-DD')`,
        total: sum(progressSchema.listeningSessions.durationSeconds),
      })
      .from(progressSchema.listeningSessions)
      .where(
        and(
          eq(progressSchema.listeningSessions.userId, userId),
          gte(progressSchema.listeningSessions.startedAt, yearStart),
          sql`${progressSchema.listeningSessions.startedAt} < ${yearEnd}`,
        ),
      )
      .groupBy(
        sql`TO_CHAR(${progressSchema.listeningSessions.startedAt}, 'YYYY-MM-DD')`,
      );

    const days: Record<string, number> = {};
    for (const row of daysResult) {
      days[row.date] = Number(row.total ?? 0);
    }

    return { days };
  }

  /**
   * Get combined audiobook + ebook progress list with filters/sorting.
   */
  async getLibraryProgress(
    userId: string,
    limit: number,
    offset: number,
    type: 'all' | 'audiobook' | 'ebook',
    status: 'all' | 'in_progress' | 'completed',
    sort: 'recent' | 'title' | 'progress',
  ): Promise<LibraryProgressResponseDto> {
    const items: LibraryProgressItemDto[] = [];

    // Raw results collected before metadata resolution
    interface RawAudiobookRow {
      id: string;
      title: string;
      manualFields: string[] | null;
      coverUrl: string | null;
      coverSource: string | null;
      duration: number | null;
      authorName: string | null;
      currentPosition: number;
      completed: boolean;
      completedAt: Date | null;
      startedAt: Date;
      updatedAt: Date;
    }
    interface RawEbookRow {
      id: string;
      title: string;
      manualFields: string[] | null;
      coverUrl: string | null;
      coverSource: string | null;
      authorName: string | null;
      progressPercent: number;
      completed: boolean;
      completedAt: Date | null;
      startedAt: Date;
      updatedAt: Date;
    }

    let audiobookRows: RawAudiobookRow[] = [];
    let ebookRows: RawEbookRow[] = [];

    // Fetch audiobook progress if requested
    if (type === 'all' || type === 'audiobook') {
      const audiobookConditions = [
        eq(progressSchema.userAudiobookProgress.userId, userId),
      ];
      if (status === 'in_progress') {
        audiobookConditions.push(
          eq(progressSchema.userAudiobookProgress.completed, false),
        );
      } else if (status === 'completed') {
        audiobookConditions.push(
          eq(progressSchema.userAudiobookProgress.completed, true),
        );
      }

      audiobookRows = (
        await this.db
          .select({
            id: audiobookSchema.audiobooks.id,
            title: audiobookSchema.audiobooks.title,
            manualFields: audiobookSchema.audiobooks.manualFields,
            coverUrl: audiobookSchema.audiobooks.coverUrl,
            coverSource: audiobookSchema.audiobooks.coverSource,
            duration: audiobookSchema.audiobooks.duration,
            authorName: audiobookSchema.people.name,
            currentPosition:
              progressSchema.userAudiobookProgress.currentPosition,
            completed: progressSchema.userAudiobookProgress.completed,
            completedAt: progressSchema.userAudiobookProgress.completedAt,
            startedAt: progressSchema.userAudiobookProgress.startedAt,
            updatedAt: progressSchema.userAudiobookProgress.updatedAt,
          })
          .from(progressSchema.userAudiobookProgress)
          .innerJoin(
            audiobookSchema.audiobooks,
            eq(
              progressSchema.userAudiobookProgress.audiobookId,
              audiobookSchema.audiobooks.id,
            ),
          )
          .leftJoin(
            audiobookSchema.audiobookAuthors,
            and(
              eq(
                audiobookSchema.audiobooks.id,
                audiobookSchema.audiobookAuthors.audiobookId,
              ),
              eq(audiobookSchema.audiobookAuthors.order, 0),
            ),
          )
          .leftJoin(
            audiobookSchema.people,
            eq(
              audiobookSchema.audiobookAuthors.personId,
              audiobookSchema.people.id,
            ),
          )
          .where(and(...audiobookConditions))
      ).filter(
        (row) => row.completed || row.currentPosition > 300,
      ) as RawAudiobookRow[];
    }

    // Fetch ebook progress if requested
    if (type === 'all' || type === 'ebook') {
      const ebookConditions = [
        eq(ebookProgressSchema.userEbookProgress.userId, userId),
      ];
      if (status === 'in_progress') {
        ebookConditions.push(
          eq(ebookProgressSchema.userEbookProgress.completed, false),
        );
      } else if (status === 'completed') {
        ebookConditions.push(
          eq(ebookProgressSchema.userEbookProgress.completed, true),
        );
      }

      ebookRows = (
        await this.db
          .select({
            id: ebooksSchema.ebooks.id,
            title: ebooksSchema.ebooks.title,
            manualFields: ebooksSchema.ebooks.manualFields,
            coverUrl: ebooksSchema.ebooks.coverUrl,
            coverSource: ebooksSchema.ebooks.coverSource,
            authorName: audiobookSchema.people.name,
            progressPercent:
              ebookProgressSchema.userEbookProgress.progressPercent,
            completed: ebookProgressSchema.userEbookProgress.completed,
            completedAt: ebookProgressSchema.userEbookProgress.completedAt,
            startedAt: ebookProgressSchema.userEbookProgress.startedAt,
            updatedAt: ebookProgressSchema.userEbookProgress.updatedAt,
          })
          .from(ebookProgressSchema.userEbookProgress)
          .innerJoin(
            ebooksSchema.ebooks,
            eq(
              ebookProgressSchema.userEbookProgress.ebookId,
              ebooksSchema.ebooks.id,
            ),
          )
          .leftJoin(
            ebooksSchema.ebookAuthors,
            and(
              eq(ebooksSchema.ebooks.id, ebooksSchema.ebookAuthors.ebookId),
              eq(ebooksSchema.ebookAuthors.order, 0),
            ),
          )
          .leftJoin(
            audiobookSchema.people,
            eq(ebooksSchema.ebookAuthors.personId, audiobookSchema.people.id),
          )
          .where(and(...ebookConditions))
      ).filter(
        (row) => row.completed || Math.round(row.progressPercent) > 0,
      ) as RawEbookRow[];
    }

    // Batch-fetch metadata sources for priority resolution
    const audiobookIds = audiobookRows.map((r) => r.id);
    const ebookIds = ebookRows.map((r) => r.id);

    const [
      hardcoverAbLinks,
      goodreadsAbLinks,
      hardcoverEbLinks,
      goodreadsEbLinks,
      metadataPriority,
    ] = await Promise.all([
      audiobookIds.length > 0
        ? this.db
            .select({
              audiobookId: hardcoverSchema.hardcoverAudiobookLinks.audiobookId,
              hardcoverBook: hardcoverSchema.hardcoverBooks,
            })
            .from(hardcoverSchema.hardcoverAudiobookLinks)
            .innerJoin(
              hardcoverSchema.hardcoverBooks,
              eq(
                hardcoverSchema.hardcoverAudiobookLinks.hardcoverBookId,
                hardcoverSchema.hardcoverBooks.id,
              ),
            )
            .where(
              inArray(
                hardcoverSchema.hardcoverAudiobookLinks.audiobookId,
                audiobookIds,
              ),
            )
        : [],
      audiobookIds.length > 0
        ? this.db
            .select({
              audiobookId: goodreadsSchema.goodreadsAudiobookLinks.audiobookId,
              goodreadsBook: goodreadsSchema.goodreadsBooks,
            })
            .from(goodreadsSchema.goodreadsAudiobookLinks)
            .innerJoin(
              goodreadsSchema.goodreadsBooks,
              eq(
                goodreadsSchema.goodreadsAudiobookLinks.goodreadsBookId,
                goodreadsSchema.goodreadsBooks.id,
              ),
            )
            .where(
              inArray(
                goodreadsSchema.goodreadsAudiobookLinks.audiobookId,
                audiobookIds,
              ),
            )
        : [],
      ebookIds.length > 0
        ? this.db
            .select({
              ebookId: hardcoverSchema.hardcoverEbookLinks.ebookId,
              hardcoverBook: hardcoverSchema.hardcoverBooks,
            })
            .from(hardcoverSchema.hardcoverEbookLinks)
            .innerJoin(
              hardcoverSchema.hardcoverBooks,
              eq(
                hardcoverSchema.hardcoverEbookLinks.hardcoverBookId,
                hardcoverSchema.hardcoverBooks.id,
              ),
            )
            .where(
              inArray(hardcoverSchema.hardcoverEbookLinks.ebookId, ebookIds),
            )
        : [],
      ebookIds.length > 0
        ? this.db
            .select({
              ebookId: goodreadsSchema.goodreadsEbookLinks.ebookId,
              goodreadsBook: goodreadsSchema.goodreadsBooks,
            })
            .from(goodreadsSchema.goodreadsEbookLinks)
            .innerJoin(
              goodreadsSchema.goodreadsBooks,
              eq(
                goodreadsSchema.goodreadsEbookLinks.goodreadsBookId,
                goodreadsSchema.goodreadsBooks.id,
              ),
            )
            .where(
              inArray(goodreadsSchema.goodreadsEbookLinks.ebookId, ebookIds),
            )
        : [],
      this.appSettingsService.getMetadataPriority(),
    ]);

    // Build lookup maps
    type HardcoverBook = typeof hardcoverSchema.hardcoverBooks.$inferSelect;
    type GoodreadsBook = typeof goodreadsSchema.goodreadsBooks.$inferSelect;

    const hcAbMap = new Map<string, HardcoverBook>(
      hardcoverAbLinks.map(
        (l) => [l.audiobookId, l.hardcoverBook] as [string, HardcoverBook],
      ),
    );
    const grAbMap = new Map<string, GoodreadsBook>(
      goodreadsAbLinks.map(
        (l) => [l.audiobookId, l.goodreadsBook] as [string, GoodreadsBook],
      ),
    );
    const hcEbMap = new Map<string, HardcoverBook>(
      hardcoverEbLinks.map(
        (l) => [l.ebookId, l.hardcoverBook] as [string, HardcoverBook],
      ),
    );
    const grEbMap = new Map<string, GoodreadsBook>(
      goodreadsEbLinks.map(
        (l) => [l.ebookId, l.goodreadsBook] as [string, GoodreadsBook],
      ),
    );

    // Build audiobook items with metadata priority resolution
    for (const row of audiobookRows) {
      const manualFields = (row.manualFields as string[]) || [];
      const hc = hcAbMap.get(row.id) || null;
      const gr = grAbMap.get(row.id) || null;

      const resolvedTitle =
        this.resolveFieldByPriority(
          'title',
          {
            manual: row.title,
            embedded: row.title,
            hardcover: hc?.title,
            goodreads: gr?.title,
          },
          metadataPriority.title,
          manualFields,
        ) || row.title;

      const hardcoverAuthorNames = hc?.authorNames || [];
      const goodreadsAuthorName = gr?.author
        ? splitPersonNames(gr.author)[0]
        : null;
      const resolvedAuthorName =
        this.resolveFieldByPriority(
          'author',
          {
            manual: row.authorName,
            embedded: row.authorName,
            hardcover: hardcoverAuthorNames[0] ?? null,
            goodreads: goodreadsAuthorName,
          },
          metadataPriority.author,
          manualFields,
        ) ?? null;

      const progressPercent = row.duration
        ? Math.round((row.currentPosition / row.duration) * 100)
        : 0;

      items.push({
        id: row.id,
        type: 'audiobook',
        title: resolvedTitle,
        authorName: resolvedAuthorName,
        coverUrl: this.coverService.getCoverUrl(
          row.id,
          row.coverUrl,
          row.coverSource,
          'audiobooks',
        ),
        progressPercent,
        completed: row.completed,
        completedAt: row.completedAt?.toISOString() ?? null,
        startedAt: row.startedAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        duration: row.duration ?? null,
      });
    }

    // Build ebook items with metadata priority resolution
    for (const row of ebookRows) {
      const manualFields = (row.manualFields as string[]) || [];
      const hc = hcEbMap.get(row.id) || null;
      const gr = grEbMap.get(row.id) || null;

      const resolvedTitle =
        this.resolveFieldByPriority(
          'title',
          {
            manual: row.title,
            embedded: row.title,
            hardcover: hc?.title,
            goodreads: gr?.title,
          },
          metadataPriority.title,
          manualFields,
        ) || row.title;

      const hardcoverAuthorNames = hc?.authorNames || [];
      const goodreadsAuthorName = gr?.author
        ? splitPersonNames(gr.author)[0]
        : null;
      const resolvedAuthorName =
        this.resolveFieldByPriority(
          'author',
          {
            manual: row.authorName,
            embedded: row.authorName,
            hardcover: hardcoverAuthorNames[0] ?? null,
            goodreads: goodreadsAuthorName,
          },
          metadataPriority.author,
          manualFields,
        ) ?? null;

      items.push({
        id: row.id,
        type: 'ebook',
        title: resolvedTitle,
        authorName: resolvedAuthorName,
        coverUrl: this.coverService.getCoverUrl(
          row.id,
          row.coverUrl,
          row.coverSource,
          'ebooks',
        ),
        progressPercent: row.progressPercent,
        completed: row.completed,
        completedAt: row.completedAt?.toISOString() ?? null,
        startedAt: row.startedAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        duration: null,
      });
    }

    // Deduplicate by id+type, keeping the most recently updated entry
    const seen = new Map<string, LibraryProgressItemDto>();
    for (const item of items) {
      const key = `${item.type}:${item.id}`;
      const existing = seen.get(key);
      if (
        !existing ||
        new Date(item.updatedAt) > new Date(existing.updatedAt)
      ) {
        seen.set(key, item);
      }
    }
    const dedupedItems = Array.from(seen.values());

    // Sort combined results
    if (sort === 'recent') {
      dedupedItems.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    } else if (sort === 'title') {
      dedupedItems.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sort === 'progress') {
      dedupedItems.sort((a, b) => b.progressPercent - a.progressPercent);
    }

    const total = dedupedItems.length;

    // Apply pagination after sorting
    const paginatedItems = dedupedItems.slice(offset, offset + limit);

    return { items: paginatedItems, total };
  }

  /**
   * Get paginated listening history (reverse-chronological listening sessions).
   */
  async getListeningHistory(
    userId: string,
    limit: number,
    offset: number,
  ): Promise<ListeningHistoryResponseDto> {
    const [results, totalResult] = await Promise.all([
      this.db
        .select({
          id: progressSchema.listeningSessions.id,
          audiobookId: progressSchema.listeningSessions.audiobookId,
          audiobookTitle: audiobookSchema.audiobooks.title,
          manualFields: audiobookSchema.audiobooks.manualFields,
          coverUrl: audiobookSchema.audiobooks.coverUrl,
          coverSource: audiobookSchema.audiobooks.coverSource,
          authorName: audiobookSchema.people.name,
          durationSeconds: progressSchema.listeningSessions.durationSeconds,
          startPosition: progressSchema.listeningSessions.startPosition,
          endPosition: progressSchema.listeningSessions.endPosition,
          startedAt: progressSchema.listeningSessions.startedAt,
          endedAt: progressSchema.listeningSessions.endedAt,
        })
        .from(progressSchema.listeningSessions)
        .leftJoin(
          audiobookSchema.audiobooks,
          eq(
            progressSchema.listeningSessions.audiobookId,
            audiobookSchema.audiobooks.id,
          ),
        )
        .leftJoin(
          audiobookSchema.audiobookAuthors,
          and(
            eq(
              audiobookSchema.audiobooks.id,
              audiobookSchema.audiobookAuthors.audiobookId,
            ),
            eq(audiobookSchema.audiobookAuthors.order, 0),
          ),
        )
        .leftJoin(
          audiobookSchema.people,
          eq(
            audiobookSchema.audiobookAuthors.personId,
            audiobookSchema.people.id,
          ),
        )
        .where(eq(progressSchema.listeningSessions.userId, userId))
        .orderBy(desc(progressSchema.listeningSessions.startedAt))
        .limit(limit)
        .offset(offset),

      this.db
        .select({ count: count() })
        .from(progressSchema.listeningSessions)
        .where(eq(progressSchema.listeningSessions.userId, userId)),
    ]);

    // Batch-fetch metadata sources for priority resolution
    const audiobookIds = [...new Set(results.map((r) => r.audiobookId))];

    const [hardcoverLinks, goodreadsLinks, metadataPriority] =
      await Promise.all([
        audiobookIds.length > 0
          ? this.db
              .select({
                audiobookId:
                  hardcoverSchema.hardcoverAudiobookLinks.audiobookId,
                hardcoverBook: hardcoverSchema.hardcoverBooks,
              })
              .from(hardcoverSchema.hardcoverAudiobookLinks)
              .innerJoin(
                hardcoverSchema.hardcoverBooks,
                eq(
                  hardcoverSchema.hardcoverAudiobookLinks.hardcoverBookId,
                  hardcoverSchema.hardcoverBooks.id,
                ),
              )
              .where(
                inArray(
                  hardcoverSchema.hardcoverAudiobookLinks.audiobookId,
                  audiobookIds,
                ),
              )
          : [],
        audiobookIds.length > 0
          ? this.db
              .select({
                audiobookId:
                  goodreadsSchema.goodreadsAudiobookLinks.audiobookId,
                goodreadsBook: goodreadsSchema.goodreadsBooks,
              })
              .from(goodreadsSchema.goodreadsAudiobookLinks)
              .innerJoin(
                goodreadsSchema.goodreadsBooks,
                eq(
                  goodreadsSchema.goodreadsAudiobookLinks.goodreadsBookId,
                  goodreadsSchema.goodreadsBooks.id,
                ),
              )
              .where(
                inArray(
                  goodreadsSchema.goodreadsAudiobookLinks.audiobookId,
                  audiobookIds,
                ),
              )
          : [],
        this.appSettingsService.getMetadataPriority(),
      ]);

    type HardcoverBook = typeof hardcoverSchema.hardcoverBooks.$inferSelect;
    type GoodreadsBook = typeof goodreadsSchema.goodreadsBooks.$inferSelect;

    const hcMap = new Map<string, HardcoverBook>(
      hardcoverLinks.map(
        (l) => [l.audiobookId, l.hardcoverBook] as [string, HardcoverBook],
      ),
    );
    const grMap = new Map<string, GoodreadsBook>(
      goodreadsLinks.map(
        (l) => [l.audiobookId, l.goodreadsBook] as [string, GoodreadsBook],
      ),
    );

    const items = results.map((row) => {
      const manualFields = (row.manualFields as string[]) || [];
      const hc = hcMap.get(row.audiobookId) || null;
      const gr = grMap.get(row.audiobookId) || null;

      const resolvedTitle =
        this.resolveFieldByPriority(
          'title',
          {
            manual: row.audiobookTitle,
            embedded: row.audiobookTitle,
            hardcover: hc?.title,
            goodreads: gr?.title,
          },
          metadataPriority.title,
          manualFields,
        ) ||
        row.audiobookTitle ||
        'Unknown audiobook';

      const hardcoverAuthorNames = hc?.authorNames || [];
      const goodreadsAuthorName = gr?.author
        ? splitPersonNames(gr.author)[0]
        : null;
      const resolvedAuthorName =
        this.resolveFieldByPriority(
          'author',
          {
            manual: row.authorName,
            embedded: row.authorName,
            hardcover: hardcoverAuthorNames[0] ?? null,
            goodreads: goodreadsAuthorName,
          },
          metadataPriority.author,
          manualFields,
        ) ?? null;

      return {
        id: row.id,
        audiobookId: row.audiobookId,
        audiobookTitle: resolvedTitle,
        authorName: resolvedAuthorName,
        coverUrl: this.coverService.getCoverUrl(
          row.audiobookId,
          row.coverUrl,
          row.coverSource,
          'audiobooks',
        ),
        durationSeconds: row.durationSeconds,
        startPosition: row.startPosition,
        endPosition: row.endPosition,
        startedAt: row.startedAt.toISOString(),
        endedAt: row.endedAt.toISOString(),
      };
    });

    return { items, total: totalResult[0]?.count ?? 0 };
  }

  /**
   * Compute current and longest streaks from listening session days.
   */
  private async computeStreaks(
    userId: string,
  ): Promise<{ currentStreak: number; longestStreak: number }> {
    const daysResult = await this.db
      .select({
        date: sql<string>`DISTINCT TO_CHAR(${progressSchema.listeningSessions.startedAt}, 'YYYY-MM-DD')`,
      })
      .from(progressSchema.listeningSessions)
      .where(eq(progressSchema.listeningSessions.userId, userId))
      .orderBy(
        sql`TO_CHAR(${progressSchema.listeningSessions.startedAt}, 'YYYY-MM-DD')`,
      );

    if (daysResult.length === 0) {
      return { currentStreak: 0, longestStreak: 0 };
    }

    const dates = daysResult.map((r) => r.date);

    let longestStreak = 1;
    let currentRun = 1;

    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(dates[i - 1] + 'T00:00:00Z');
      const curr = new Date(dates[i] + 'T00:00:00Z');
      const diffDays =
        (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);

      if (diffDays === 1) {
        currentRun++;
      } else {
        currentRun = 1;
      }

      if (currentRun > longestStreak) {
        longestStreak = currentRun;
      }
    }

    // Compute current streak: check if the last listening day is today or yesterday
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const lastDate = dates[dates.length - 1];

    if (lastDate !== todayStr && lastDate !== yesterdayStr) {
      // Streak is broken
      return { currentStreak: 0, longestStreak };
    }

    // Walk backwards from the end to find current streak
    let currentStreak = 1;
    for (let i = dates.length - 2; i >= 0; i--) {
      const prev = new Date(dates[i] + 'T00:00:00Z');
      const curr = new Date(dates[i + 1] + 'T00:00:00Z');
      const diffDays =
        (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);

      if (diffDays === 1) {
        currentStreak++;
      } else {
        break;
      }
    }

    return { currentStreak, longestStreak };
  }
}
