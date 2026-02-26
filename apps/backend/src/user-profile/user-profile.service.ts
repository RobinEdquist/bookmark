import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, count, desc, eq, gte, sql, sum } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import { CoverService } from '../common/cover.service';
import * as progressSchema from '../progress/schema';
import * as ebookProgressSchema from '../ebook-progress/schema';
import * as audiobookSchema from '../audiobooks/schema';
import * as ebooksSchema from '../ebooks/schema';
import * as authSchema from '../auth/schema';
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
  ) {}

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

      // Audiobook progress counts (filter out barely-started: progress rounds to 0%)
      this.db
        .select({
          completed: sql<number>`COALESCE(SUM(CASE WHEN ${progressSchema.userAudiobookProgress.completed} THEN 1 ELSE 0 END), 0)`,
          inProgress: sql<number>`COALESCE(SUM(CASE WHEN NOT ${progressSchema.userAudiobookProgress.completed} AND ROUND(${progressSchema.userAudiobookProgress.currentPosition}::numeric / NULLIF(${audiobookSchema.audiobooks.duration}, 0) * 100) > 0 THEN 1 ELSE 0 END), 0)`,
        })
        .from(progressSchema.userAudiobookProgress)
        .leftJoin(
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

      const audiobookResults = await this.db
        .select({
          id: audiobookSchema.audiobooks.id,
          title: audiobookSchema.audiobooks.title,
          coverUrl: audiobookSchema.audiobooks.coverUrl,
          coverSource: audiobookSchema.audiobooks.coverSource,
          duration: audiobookSchema.audiobooks.duration,
          authorName: audiobookSchema.people.name,
          currentPosition: progressSchema.userAudiobookProgress.currentPosition,
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
        .where(and(...audiobookConditions));

      for (const row of audiobookResults) {
        const progressPercent = row.duration
          ? Math.round((row.currentPosition / row.duration) * 100)
          : 0;

        // Skip items with negligible progress (rounds to 0%) unless completed
        if (!row.completed && progressPercent <= 0) continue;

        items.push({
          id: row.id,
          type: 'audiobook',
          title: row.title,
          authorName: row.authorName ?? null,
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

      const ebookResults = await this.db
        .select({
          id: ebooksSchema.ebooks.id,
          title: ebooksSchema.ebooks.title,
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
        .where(and(...ebookConditions));

      for (const row of ebookResults) {
        // Skip items with negligible progress (rounds to 0%) unless completed
        if (!row.completed && Math.round(row.progressPercent) <= 0) continue;

        items.push({
          id: row.id,
          type: 'ebook',
          title: row.title,
          authorName: row.authorName ?? null,
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
    }

    // Sort combined results
    if (sort === 'recent') {
      items.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    } else if (sort === 'title') {
      items.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sort === 'progress') {
      items.sort((a, b) => b.progressPercent - a.progressPercent);
    }

    const total = items.length;

    // Apply pagination after sorting
    const paginatedItems = items.slice(offset, offset + limit);

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

    const items = results.map((row) => ({
      id: row.id,
      audiobookId: row.audiobookId,
      audiobookTitle: row.audiobookTitle ?? 'Unknown audiobook',
      authorName: row.authorName ?? null,
      coverUrl: row.coverUrl
        ? this.coverService.getCoverUrl(
            row.audiobookId,
            row.coverUrl,
            row.coverSource,
            'audiobooks',
          )
        : null,
      durationSeconds: row.durationSeconds,
      startPosition: row.startPosition,
      endPosition: row.endPosition,
      startedAt: row.startedAt.toISOString(),
      endedAt: row.endedAt.toISOString(),
    }));

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
