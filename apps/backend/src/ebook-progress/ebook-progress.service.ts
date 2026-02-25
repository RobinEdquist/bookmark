import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, desc, eq, gt, notExists, sql } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as ebookProgressSchema from './schema';
import * as ebooksSchema from '../ebooks/schema';
import * as usersSchema from '../users/schema';
import type { UpdateEbookProgressDto } from './dto/update-ebook-progress.dto';

export interface EbookProgressResponse {
  ebookId: string;
  cfi: string | null;
  progressPercent: number;
  completed: boolean;
  completedAt: string | null;
  startedAt: string;
  updatedAt: string;
}

export interface EbookProgressWithEbook extends EbookProgressResponse {
  ebook: {
    id: string;
    title: string;
    coverUrl: string | null;
    format: string;
  };
}

@Injectable()
export class EbookProgressService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: NodePgDatabase<
      typeof ebookProgressSchema & typeof ebooksSchema
    >,
  ) {}

  /**
   * Get progress for a specific ebook
   */
  async getProgress(
    userId: string,
    ebookId: string,
  ): Promise<EbookProgressResponse | null> {
    const [progress] = await this.db
      .select()
      .from(ebookProgressSchema.userEbookProgress)
      .where(
        and(
          eq(ebookProgressSchema.userEbookProgress.userId, userId),
          eq(ebookProgressSchema.userEbookProgress.ebookId, ebookId),
        ),
      );

    if (!progress) return null;

    return {
      ebookId: progress.ebookId,
      cfi: progress.cfi,
      progressPercent: progress.progressPercent,
      completed: progress.completed,
      completedAt: progress.completedAt?.toISOString() ?? null,
      startedAt: progress.startedAt.toISOString(),
      updatedAt: progress.updatedAt.toISOString(),
    };
  }

  /**
   * Update progress for an ebook (upsert)
   */
  async updateProgress(
    userId: string,
    ebookId: string,
    dto: UpdateEbookProgressDto,
  ): Promise<EbookProgressResponse> {
    // Verify ebook exists
    const [ebook] = await this.db
      .select({ id: ebooksSchema.ebooks.id })
      .from(ebooksSchema.ebooks)
      .where(eq(ebooksSchema.ebooks.id, ebookId));

    if (!ebook) {
      throw new NotFoundException('Ebook not found');
    }

    // Check if this means completed (>= 95%)
    const isCompleted = dto.progressPercent >= 95;

    // Upsert the progress record
    const [progress] = await this.db
      .insert(ebookProgressSchema.userEbookProgress)
      .values({
        userId,
        ebookId,
        cfi: dto.cfi ?? null,
        progressPercent: dto.progressPercent,
        completed: isCompleted,
        completedAt: isCompleted ? new Date() : null,
      })
      .onConflictDoUpdate({
        target: [
          ebookProgressSchema.userEbookProgress.userId,
          ebookProgressSchema.userEbookProgress.ebookId,
        ],
        set: {
          cfi: dto.cfi ?? sql`${ebookProgressSchema.userEbookProgress.cfi}`,
          progressPercent: dto.progressPercent,
          completed: isCompleted,
          completedAt: isCompleted
            ? new Date()
            : sql`${ebookProgressSchema.userEbookProgress.completedAt}`,
          isHidden: false, // Reset hidden when user reads again
          updatedAt: new Date(),
        },
      })
      .returning();

    return {
      ebookId: progress.ebookId,
      cfi: progress.cfi,
      progressPercent: progress.progressPercent,
      completed: progress.completed,
      completedAt: progress.completedAt?.toISOString() ?? null,
      startedAt: progress.startedAt.toISOString(),
      updatedAt: progress.updatedAt.toISOString(),
    };
  }

  /**
   * Get all in-progress ebooks for a user.
   * Excludes ebooks with tags that the user has blacklisted.
   */
  async getAllProgress(userId: string): Promise<EbookProgressWithEbook[]> {
    // Build blacklist filter - exclude ebooks with blacklisted tags
    const blacklistedTagsFilter = notExists(
      this.db
        .select({ one: sql`1` })
        .from(ebooksSchema.ebookTags)
        .innerJoin(
          usersSchema.userBlacklistedTags,
          and(
            eq(
              ebooksSchema.ebookTags.tagId,
              usersSchema.userBlacklistedTags.tagId,
            ),
            eq(usersSchema.userBlacklistedTags.userId, userId),
          ),
        )
        .where(eq(ebooksSchema.ebookTags.ebookId, ebooksSchema.ebooks.id)),
    );

    const results = await this.db
      .select({
        progress: ebookProgressSchema.userEbookProgress,
        ebook: {
          id: ebooksSchema.ebooks.id,
          title: ebooksSchema.ebooks.title,
          coverUrl: ebooksSchema.ebooks.coverUrl,
          format: ebooksSchema.ebooks.format,
        },
      })
      .from(ebookProgressSchema.userEbookProgress)
      .innerJoin(
        ebooksSchema.ebooks,
        eq(
          ebookProgressSchema.userEbookProgress.ebookId,
          ebooksSchema.ebooks.id,
        ),
      )
      .where(
        and(
          eq(ebookProgressSchema.userEbookProgress.userId, userId),
          eq(ebookProgressSchema.userEbookProgress.isHidden, false),
          gt(ebookProgressSchema.userEbookProgress.progressPercent, 0),
          blacklistedTagsFilter,
        ),
      )
      .orderBy(desc(ebookProgressSchema.userEbookProgress.updatedAt));

    return results.map(({ progress, ebook }) => ({
      ebookId: progress.ebookId,
      cfi: progress.cfi,
      progressPercent: progress.progressPercent,
      completed: progress.completed,
      completedAt: progress.completedAt?.toISOString() ?? null,
      startedAt: progress.startedAt.toISOString(),
      updatedAt: progress.updatedAt.toISOString(),
      ebook: {
        id: ebook.id,
        title: ebook.title,
        coverUrl: ebook.coverUrl,
        format: ebook.format,
      },
    }));
  }

  /**
   * Hide an ebook from "continue reading"
   */
  async hideProgress(userId: string, ebookId: string): Promise<void> {
    const result = await this.db
      .update(ebookProgressSchema.userEbookProgress)
      .set({ isHidden: true })
      .where(
        and(
          eq(ebookProgressSchema.userEbookProgress.userId, userId),
          eq(ebookProgressSchema.userEbookProgress.ebookId, ebookId),
        ),
      );

    if (result.rowCount === 0) {
      throw new NotFoundException('Progress record not found');
    }
  }
}
