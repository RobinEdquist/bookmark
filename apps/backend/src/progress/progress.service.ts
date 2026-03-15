import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  and,
  desc,
  eq,
  gt,
  gte,
  lte,
  sql,
  count,
  notExists,
  sum,
} from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as progressSchema from './schema';
import * as audiobookSchema from '../audiobooks/schema';
import * as usersSchema from '../users/schema';
import type { UpdateProgressDto } from './dto/update-progress.dto';
import type { CreateSessionDto } from './dto/create-session.dto';

export interface ProgressResponse {
  audiobookId: string;
  position: number;
  completed: boolean;
  completedAt: string | null;
  startedAt: string;
  updatedAt: string;
}

export interface ProgressWithAudiobook extends ProgressResponse {
  audiobook: {
    id: string;
    title: string;
    coverUrl: string | null;
    duration: number | null;
  };
  progressPercent: number;
}

export interface ListeningStats {
  today: {
    durationSeconds: number;
    sessionsCount: number;
  };
  thisWeek: {
    durationSeconds: number;
    sessionsCount: number;
  };
  thisMonth: {
    durationSeconds: number;
    sessionsCount: number;
  };
  allTime: {
    durationSeconds: number;
    audiobooksStarted: number;
    audiobooksCompleted: number;
  };
  recentlyPlayed: ProgressWithAudiobook[];
}

export interface ListeningStatsItem {
  id: string;
  title: string;
  authorName: string | null;
  coverUrl: string | null;
  timeListening: number;
}

export interface RecentSession {
  id: string;
  audiobookId: string;
  audiobookTitle: string;
  authorName: string | null;
  coverUrl: string | null;
  date: string;
  timeListening: number;
  startPosition: number;
  endPosition: number;
  startedAt: string;
  endedAt: string;
}

export interface MobileListeningStats {
  totalTime: number;
  today: number;
  items: Record<string, ListeningStatsItem>;
  days: Record<string, number>;
  dayOfWeek: Record<string, number>;
  recentSessions: RecentSession[];
}

@Injectable()
export class ProgressService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: NodePgDatabase<typeof progressSchema & typeof audiobookSchema>,
  ) {}

  /**
   * Get progress for a specific audiobook
   */
  async getProgress(
    userId: string,
    audiobookId: string,
  ): Promise<ProgressResponse | null> {
    const [progress] = await this.db
      .select()
      .from(progressSchema.userAudiobookProgress)
      .where(
        and(
          eq(progressSchema.userAudiobookProgress.userId, userId),
          eq(progressSchema.userAudiobookProgress.audiobookId, audiobookId),
        ),
      );

    if (!progress) return null;

    return {
      audiobookId: progress.audiobookId,
      position: progress.currentPosition,
      completed: progress.completed,
      completedAt: progress.completedAt?.toISOString() ?? null,
      startedAt: progress.startedAt.toISOString(),
      updatedAt: progress.updatedAt.toISOString(),
    };
  }

  /**
   * Update progress for an audiobook (upsert)
   */
  async updateProgress(
    userId: string,
    audiobookId: string,
    dto: UpdateProgressDto,
  ): Promise<ProgressResponse> {
    // Get audiobook duration to check if completed
    const [audiobook] = await this.db
      .select({ duration: audiobookSchema.audiobooks.duration })
      .from(audiobookSchema.audiobooks)
      .where(eq(audiobookSchema.audiobooks.id, audiobookId));

    if (!audiobook) {
      throw new NotFoundException('Audiobook not found');
    }

    // Check if this position means completed (within 30 seconds of end)
    const isCompleted = audiobook.duration
      ? dto.position >= audiobook.duration - 30
      : false;

    // Upsert the progress record
    const [progress] = await this.db
      .insert(progressSchema.userAudiobookProgress)
      .values({
        userId,
        audiobookId,
        currentPosition: dto.position,
        completed: isCompleted,
        completedAt: isCompleted ? new Date() : null,
      })
      .onConflictDoUpdate({
        target: [
          progressSchema.userAudiobookProgress.userId,
          progressSchema.userAudiobookProgress.audiobookId,
        ],
        set: {
          currentPosition: dto.position,
          completed: isCompleted,
          completedAt: isCompleted
            ? new Date()
            : sql`${progressSchema.userAudiobookProgress.completedAt}`,
          isHidden: false, // Reset hidden when user plays again
          updatedAt: new Date(),
        },
      })
      .returning();

    return {
      audiobookId: progress.audiobookId,
      position: progress.currentPosition,
      completed: progress.completed,
      completedAt: progress.completedAt?.toISOString() ?? null,
      startedAt: progress.startedAt.toISOString(),
      updatedAt: progress.updatedAt.toISOString(),
    };
  }

  /**
   * Record a listening session.
   * If a recent session exists for the same user+audiobook (ended within the
   * last 10 minutes), the existing session is extended instead of creating a
   * new row. As a fallback, sessions whose positions overlap on the same
   * calendar day are also merged. This prevents duplicate overlapping sessions
   * from clients that report progress periodically (e.g. mobile apps).
   */
  private static readonly SESSION_MERGE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

  async createSession(
    userId: string,
    audiobookId: string,
    dto: CreateSessionDto,
  ): Promise<{ id: string; durationSeconds: number }> {
    // Strategy 1: Time-window merge (session ended within last 10 minutes)
    const mergeThreshold = new Date(
      Date.now() - ProgressService.SESSION_MERGE_WINDOW_MS,
    );

    const [timeWindowMatch] = await this.db
      .select({
        id: progressSchema.listeningSessions.id,
        durationSeconds: progressSchema.listeningSessions.durationSeconds,
      })
      .from(progressSchema.listeningSessions)
      .where(
        and(
          eq(progressSchema.listeningSessions.userId, userId),
          eq(progressSchema.listeningSessions.audiobookId, audiobookId),
          gte(progressSchema.listeningSessions.endedAt, mergeThreshold),
        ),
      )
      .orderBy(desc(progressSchema.listeningSessions.endedAt))
      .limit(1);

    if (timeWindowMatch) {
      return this.extendSession(timeWindowMatch, dto);
    }

    // Strategy 2: Position-overlap merge on the same calendar day
    const positionOverlapMatch = await this.findPositionOverlapSession(
      userId,
      audiobookId,
      dto,
    );

    if (positionOverlapMatch) {
      return this.extendSession(positionOverlapMatch, dto);
    }

    // No merge candidate found — create a new session
    const [session] = await this.db
      .insert(progressSchema.listeningSessions)
      .values({
        userId,
        audiobookId,
        startedAt: new Date(dto.startedAt),
        endedAt: new Date(dto.endedAt),
        startPosition: dto.startPosition,
        endPosition: dto.endPosition,
        durationSeconds: dto.durationSeconds,
      })
      .returning({
        id: progressSchema.listeningSessions.id,
        durationSeconds: progressSchema.listeningSessions.durationSeconds,
      });

    return session;
  }

  /**
   * Extend an existing session with values from a new session DTO.
   * Uses MAX semantics for endedAt, endPosition, and durationSeconds.
   */
  private async extendSession(
    existing: { id: string; durationSeconds: number },
    dto: CreateSessionDto,
  ): Promise<{ id: string; durationSeconds: number }> {
    const [updated] = await this.db
      .update(progressSchema.listeningSessions)
      .set({
        endedAt: new Date(dto.endedAt),
        endPosition: dto.endPosition,
        durationSeconds: Math.max(
          existing.durationSeconds,
          dto.durationSeconds,
        ),
      })
      .where(eq(progressSchema.listeningSessions.id, existing.id))
      .returning({
        id: progressSchema.listeningSessions.id,
        durationSeconds: progressSchema.listeningSessions.durationSeconds,
      });

    return updated;
  }

  /**
   * Find an existing session for the same user+audiobook on the same calendar
   * day where the new session's startPosition falls within the existing
   * session's [startPosition, endPosition] range.
   */
  private async findPositionOverlapSession(
    userId: string,
    audiobookId: string,
    dto: CreateSessionDto,
  ): Promise<{ id: string; durationSeconds: number } | undefined> {
    const [match] = await this.db
      .select({
        id: progressSchema.listeningSessions.id,
        durationSeconds: progressSchema.listeningSessions.durationSeconds,
      })
      .from(progressSchema.listeningSessions)
      .where(
        and(
          eq(progressSchema.listeningSessions.userId, userId),
          eq(progressSchema.listeningSessions.audiobookId, audiobookId),
          lte(
            progressSchema.listeningSessions.startPosition,
            dto.startPosition,
          ),
          gte(progressSchema.listeningSessions.endPosition, dto.startPosition),
          sql`DATE(${progressSchema.listeningSessions.startedAt}) = DATE(${new Date(dto.startedAt)})`,
        ),
      )
      .orderBy(desc(progressSchema.listeningSessions.endedAt))
      .limit(1);

    return match;
  }

  /**
   * Get all in-progress audiobooks for a user.
   * Excludes audiobooks with tags that the user has blacklisted.
   */
  async getAllProgress(userId: string): Promise<ProgressWithAudiobook[]> {
    // Build blacklist filter - exclude audiobooks with blacklisted tags
    const blacklistedTagsFilter = notExists(
      this.db
        .select({ one: sql`1` })
        .from(audiobookSchema.audiobookTags)
        .innerJoin(
          usersSchema.userBlacklistedTags,
          and(
            eq(
              audiobookSchema.audiobookTags.tagId,
              usersSchema.userBlacklistedTags.tagId,
            ),
            eq(usersSchema.userBlacklistedTags.userId, userId),
          ),
        )
        .where(
          eq(
            audiobookSchema.audiobookTags.audiobookId,
            audiobookSchema.audiobooks.id,
          ),
        ),
    );

    const results = await this.db
      .select({
        progress: progressSchema.userAudiobookProgress,
        audiobook: {
          id: audiobookSchema.audiobooks.id,
          title: audiobookSchema.audiobooks.title,
          coverUrl: audiobookSchema.audiobooks.coverUrl,
          duration: audiobookSchema.audiobooks.duration,
        },
      })
      .from(progressSchema.userAudiobookProgress)
      .innerJoin(
        audiobookSchema.audiobooks,
        eq(
          progressSchema.userAudiobookProgress.audiobookId,
          audiobookSchema.audiobooks.id,
        ),
      )
      .where(
        and(
          eq(progressSchema.userAudiobookProgress.userId, userId),
          eq(progressSchema.userAudiobookProgress.isHidden, false),
          gt(progressSchema.userAudiobookProgress.currentPosition, 0),
          blacklistedTagsFilter,
        ),
      )
      .orderBy(desc(progressSchema.userAudiobookProgress.updatedAt));

    const mapped = results
      .map(({ progress, audiobook }) => ({
        audiobookId: progress.audiobookId,
        position: progress.currentPosition,
        completed: progress.completed,
        completedAt: progress.completedAt?.toISOString() ?? null,
        startedAt: progress.startedAt.toISOString(),
        updatedAt: progress.updatedAt.toISOString(),
        audiobook: {
          id: audiobook.id,
          title: audiobook.title,
          coverUrl: audiobook.coverUrl,
          duration: audiobook.duration,
        },
        progressPercent: audiobook.duration
          ? Math.round((progress.currentPosition / audiobook.duration) * 100)
          : 0,
      }))
      .filter((item) => item.completed || item.progressPercent > 0);

    // Deduplicate by audiobookId, keeping the most recently updated entry
    const deduped = new Map<string, ProgressWithAudiobook>();
    for (const item of mapped) {
      const existing = deduped.get(item.audiobookId);
      if (
        !existing ||
        new Date(item.updatedAt) > new Date(existing.updatedAt)
      ) {
        deduped.set(item.audiobookId, item);
      }
    }
    return Array.from(deduped.values());
  }

  /**
   * Get listening statistics for a user
   */
  async getListeningStats(userId: string): Promise<ListeningStats> {
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

    // Get week start (Sunday)
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    // Get month start
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Run all queries in parallel
    const [
      todayStats,
      weekStats,
      monthStats,
      allTimeStats,
      progressStats,
      recentlyPlayed,
    ] = await Promise.all([
      // Today's stats
      this.db
        .select({
          duration: sql<number>`COALESCE(SUM(${progressSchema.listeningSessions.durationSeconds}), 0)`,
          sessions: count(),
        })
        .from(progressSchema.listeningSessions)
        .where(
          and(
            eq(progressSchema.listeningSessions.userId, userId),
            gte(progressSchema.listeningSessions.startedAt, todayStart),
          ),
        ),

      // This week's stats
      this.db
        .select({
          duration: sql<number>`COALESCE(SUM(${progressSchema.listeningSessions.durationSeconds}), 0)`,
          sessions: count(),
        })
        .from(progressSchema.listeningSessions)
        .where(
          and(
            eq(progressSchema.listeningSessions.userId, userId),
            gte(progressSchema.listeningSessions.startedAt, weekStart),
          ),
        ),

      // This month's stats
      this.db
        .select({
          duration: sql<number>`COALESCE(SUM(${progressSchema.listeningSessions.durationSeconds}), 0)`,
          sessions: count(),
        })
        .from(progressSchema.listeningSessions)
        .where(
          and(
            eq(progressSchema.listeningSessions.userId, userId),
            gte(progressSchema.listeningSessions.startedAt, monthStart),
          ),
        ),

      // All-time listening duration
      this.db
        .select({
          duration: sql<number>`COALESCE(SUM(${progressSchema.listeningSessions.durationSeconds}), 0)`,
        })
        .from(progressSchema.listeningSessions)
        .where(eq(progressSchema.listeningSessions.userId, userId)),

      // Audiobooks started/completed
      this.db
        .select({
          started: count(),
          completed: sql<number>`COALESCE(SUM(CASE WHEN ${progressSchema.userAudiobookProgress.completed} THEN 1 ELSE 0 END), 0)`,
        })
        .from(progressSchema.userAudiobookProgress)
        .where(eq(progressSchema.userAudiobookProgress.userId, userId)),

      // Recently played (limit 5, not completed)
      this.getAllProgress(userId).then((all) =>
        all.filter((p) => !p.completed).slice(0, 5),
      ),
    ]);

    return {
      today: {
        durationSeconds: Number(todayStats[0]?.duration ?? 0),
        sessionsCount: todayStats[0]?.sessions ?? 0,
      },
      thisWeek: {
        durationSeconds: Number(weekStats[0]?.duration ?? 0),
        sessionsCount: weekStats[0]?.sessions ?? 0,
      },
      thisMonth: {
        durationSeconds: Number(monthStats[0]?.duration ?? 0),
        sessionsCount: monthStats[0]?.sessions ?? 0,
      },
      allTime: {
        durationSeconds: Number(allTimeStats[0]?.duration ?? 0),
        audiobooksStarted: progressStats[0]?.started ?? 0,
        audiobooksCompleted: Number(progressStats[0]?.completed ?? 0),
      },
      recentlyPlayed,
    };
  }

  /**
   * Reset (delete) progress for an audiobook. Listening sessions are preserved.
   */
  async resetProgress(userId: string, audiobookId: string): Promise<void> {
    const result = await this.db
      .delete(progressSchema.userAudiobookProgress)
      .where(
        and(
          eq(progressSchema.userAudiobookProgress.userId, userId),
          eq(progressSchema.userAudiobookProgress.audiobookId, audiobookId),
        ),
      );

    if (result.rowCount === 0) {
      throw new NotFoundException('Progress record not found');
    }
  }

  /**
   * Hide an audiobook from "continue listening"
   */
  async hideProgress(userId: string, audiobookId: string): Promise<void> {
    const result = await this.db
      .update(progressSchema.userAudiobookProgress)
      .set({ isHidden: true })
      .where(
        and(
          eq(progressSchema.userAudiobookProgress.userId, userId),
          eq(progressSchema.userAudiobookProgress.audiobookId, audiobookId),
        ),
      );

    if (result.rowCount === 0) {
      throw new NotFoundException('Progress record not found');
    }
  }

  /**
   * Get mobile-friendly listening statistics.
   * Includes daily breakdowns for contribution graphs and per-audiobook stats.
   */
  async getMobileListeningStats(userId: string): Promise<MobileListeningStats> {
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

    // Limit contribution graph to last year for performance
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const dayNames = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];

    // Run all queries in parallel
    const [
      totalTimeResult,
      todayResult,
      itemsResult,
      daysResult,
      dowResult,
      recentSessionsResult,
    ] = await Promise.all([
      // Total listening time (all time)
      this.db
        .select({
          total: sql<number>`COALESCE(SUM(${progressSchema.listeningSessions.durationSeconds}), 0)`,
        })
        .from(progressSchema.listeningSessions)
        .where(eq(progressSchema.listeningSessions.userId, userId)),

      // Today's listening time
      this.db
        .select({
          total: sql<number>`COALESCE(SUM(${progressSchema.listeningSessions.durationSeconds}), 0)`,
        })
        .from(progressSchema.listeningSessions)
        .where(
          and(
            eq(progressSchema.listeningSessions.userId, userId),
            gte(progressSchema.listeningSessions.startedAt, todayStart),
          ),
        ),

      // Per-audiobook stats with author
      this.db
        .select({
          audiobookId: progressSchema.listeningSessions.audiobookId,
          title: audiobookSchema.audiobooks.title,
          coverUrl: audiobookSchema.audiobooks.coverUrl,
          authorName: audiobookSchema.people.name,
          timeListening: sum(progressSchema.listeningSessions.durationSeconds),
        })
        .from(progressSchema.listeningSessions)
        .innerJoin(
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
        .groupBy(
          progressSchema.listeningSessions.audiobookId,
          audiobookSchema.audiobooks.id,
          audiobookSchema.audiobooks.title,
          audiobookSchema.audiobooks.coverUrl,
          audiobookSchema.people.name,
        ),

      // Daily totals for contribution graph (limited to last year)
      this.db
        .select({
          date: sql<string>`TO_CHAR(${progressSchema.listeningSessions.startedAt}, 'YYYY-MM-DD')`,
          total: sum(progressSchema.listeningSessions.durationSeconds),
        })
        .from(progressSchema.listeningSessions)
        .where(
          and(
            eq(progressSchema.listeningSessions.userId, userId),
            gte(progressSchema.listeningSessions.startedAt, oneYearAgo),
          ),
        )
        .groupBy(
          sql`TO_CHAR(${progressSchema.listeningSessions.startedAt}, 'YYYY-MM-DD')`,
        ),

      // Day of week aggregation
      this.db
        .select({
          dow: sql<number>`EXTRACT(DOW FROM ${progressSchema.listeningSessions.startedAt})`,
          total: sum(progressSchema.listeningSessions.durationSeconds),
        })
        .from(progressSchema.listeningSessions)
        .where(eq(progressSchema.listeningSessions.userId, userId))
        .groupBy(
          sql`EXTRACT(DOW FROM ${progressSchema.listeningSessions.startedAt})`,
        ),

      // Recent sessions with audiobook metadata
      this.db
        .select({
          id: progressSchema.listeningSessions.id,
          audiobookId: progressSchema.listeningSessions.audiobookId,
          audiobookTitle: audiobookSchema.audiobooks.title,
          coverUrl: audiobookSchema.audiobooks.coverUrl,
          authorName: audiobookSchema.people.name,
          durationSeconds: progressSchema.listeningSessions.durationSeconds,
          startPosition: progressSchema.listeningSessions.startPosition,
          endPosition: progressSchema.listeningSessions.endPosition,
          startedAt: progressSchema.listeningSessions.startedAt,
          endedAt: progressSchema.listeningSessions.endedAt,
        })
        .from(progressSchema.listeningSessions)
        .innerJoin(
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
        .limit(20),
    ]);

    // Build items map
    const items: Record<string, ListeningStatsItem> = {};
    for (const row of itemsResult) {
      items[row.audiobookId] = {
        id: row.audiobookId,
        title: row.title,
        authorName: row.authorName,
        coverUrl: row.coverUrl,
        timeListening: Number(row.timeListening ?? 0),
      };
    }

    // Build days map
    const days: Record<string, number> = {};
    for (const row of daysResult) {
      days[row.date] = Number(row.total ?? 0);
    }

    // Build day of week map (initialize all days to 0)
    const dayOfWeek: Record<string, number> = {};
    for (const name of dayNames) {
      dayOfWeek[name] = 0;
    }
    for (const row of dowResult) {
      const dayIndex = Number(row.dow);
      dayOfWeek[dayNames[dayIndex]] = Number(row.total ?? 0);
    }

    // Build recent sessions
    const recentSessions: RecentSession[] = recentSessionsResult.map((row) => ({
      id: row.id,
      audiobookId: row.audiobookId,
      audiobookTitle: row.audiobookTitle,
      authorName: row.authorName,
      coverUrl: row.coverUrl,
      date: row.startedAt.toISOString().split('T')[0],
      timeListening: row.durationSeconds,
      startPosition: row.startPosition,
      endPosition: row.endPosition,
      startedAt: row.startedAt.toISOString(),
      endedAt: row.endedAt.toISOString(),
    }));

    return {
      totalTime: Number(totalTimeResult[0]?.total ?? 0),
      today: Number(todayResult[0]?.total ?? 0),
      items,
      days,
      dayOfWeek,
      recentSessions,
    };
  }
}
