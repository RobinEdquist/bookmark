import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, desc, eq, gte, sql, sum, count } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as progressSchema from './schema';
import * as audiobookSchema from '../audiobooks/schema';
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

@Injectable()
export class ProgressService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: NodePgDatabase<typeof progressSchema & typeof audiobookSchema>,
  ) {}

  /**
   * Get progress for a specific audiobook
   */
  async getProgress(userId: string, audiobookId: string): Promise<ProgressResponse | null> {
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
          completedAt: isCompleted ? new Date() : sql`${progressSchema.userAudiobookProgress.completedAt}`,
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
   * Record a listening session
   */
  async createSession(
    userId: string,
    audiobookId: string,
    dto: CreateSessionDto,
  ): Promise<{ id: string; durationSeconds: number }> {
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
      .returning({ id: progressSchema.listeningSessions.id, durationSeconds: progressSchema.listeningSessions.durationSeconds });

    return session;
  }

  /**
   * Get all in-progress audiobooks for a user
   */
  async getAllProgress(userId: string): Promise<ProgressWithAudiobook[]> {
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
        eq(progressSchema.userAudiobookProgress.audiobookId, audiobookSchema.audiobooks.id),
      )
      .where(eq(progressSchema.userAudiobookProgress.userId, userId))
      .orderBy(desc(progressSchema.userAudiobookProgress.updatedAt));

    return results.map(({ progress, audiobook }) => ({
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
    }));
  }

  /**
   * Get listening statistics for a user
   */
  async getListeningStats(userId: string): Promise<ListeningStats> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Get week start (Sunday)
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    // Get month start
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Run all queries in parallel
    const [todayStats, weekStats, monthStats, allTimeStats, progressStats, recentlyPlayed] = await Promise.all([
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
      this.getAllProgress(userId).then(all =>
        all.filter(p => !p.completed).slice(0, 5)
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
}
