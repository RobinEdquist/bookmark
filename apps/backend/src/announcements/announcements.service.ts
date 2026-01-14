import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, notInArray, desc } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as schema from './schema';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';

@Injectable()
export class AnnouncementsService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /**
   * Get all active announcements that the user hasn't dismissed
   */
  async getActiveForUser(userId: string) {
    // Get IDs of announcements the user has dismissed
    const dismissedIds = await this.db
      .select({ announcementId: schema.announcementDismissals.announcementId })
      .from(schema.announcementDismissals)
      .where(eq(schema.announcementDismissals.userId, userId));

    const dismissedIdList = dismissedIds.map((d) => d.announcementId);

    // Get active announcements not in the dismissed list
    const announcements = await this.db
      .select({
        id: schema.announcements.id,
        title: schema.announcements.title,
        message: schema.announcements.message,
        createdAt: schema.announcements.createdAt,
      })
      .from(schema.announcements)
      .where(
        dismissedIdList.length > 0
          ? and(
              eq(schema.announcements.isActive, true),
              notInArray(schema.announcements.id, dismissedIdList),
            )
          : eq(schema.announcements.isActive, true),
      )
      .orderBy(desc(schema.announcements.createdAt));

    return announcements;
  }

  /**
   * Dismiss an announcement for a user
   */
  async dismiss(announcementId: string, userId: string) {
    // Check if announcement exists
    const [announcement] = await this.db
      .select({ id: schema.announcements.id })
      .from(schema.announcements)
      .where(eq(schema.announcements.id, announcementId))
      .limit(1);

    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }

    // Check if already dismissed
    const [existing] = await this.db
      .select({ id: schema.announcementDismissals.id })
      .from(schema.announcementDismissals)
      .where(
        and(
          eq(schema.announcementDismissals.announcementId, announcementId),
          eq(schema.announcementDismissals.userId, userId),
        ),
      )
      .limit(1);

    if (existing) {
      // Already dismissed, return success
      return { success: true };
    }

    // Create dismissal record
    await this.db.insert(schema.announcementDismissals).values({
      announcementId,
      userId,
    });

    return { success: true };
  }

  /**
   * Get all announcements (admin)
   */
  async findAll() {
    const announcements = await this.db
      .select({
        id: schema.announcements.id,
        title: schema.announcements.title,
        message: schema.announcements.message,
        isActive: schema.announcements.isActive,
        createdBy: schema.announcements.createdBy,
        createdAt: schema.announcements.createdAt,
        updatedAt: schema.announcements.updatedAt,
      })
      .from(schema.announcements)
      .orderBy(desc(schema.announcements.createdAt));

    return announcements;
  }

  /**
   * Create a new announcement (admin)
   */
  async create(dto: CreateAnnouncementDto, createdBy: string) {
    const [announcement] = await this.db
      .insert(schema.announcements)
      .values({
        title: dto.title,
        message: dto.message,
        isActive: dto.isActive ?? true,
        createdBy,
      })
      .returning();

    return announcement;
  }

  /**
   * Update an announcement (admin)
   */
  async update(id: string, dto: UpdateAnnouncementDto) {
    const [existing] = await this.db
      .select({ id: schema.announcements.id })
      .from(schema.announcements)
      .where(eq(schema.announcements.id, id))
      .limit(1);

    if (!existing) {
      throw new NotFoundException('Announcement not found');
    }

    const updateData: Partial<typeof schema.announcements.$inferInsert> = {};

    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.message !== undefined) updateData.message = dto.message;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;

    const [updated] = await this.db
      .update(schema.announcements)
      .set(updateData)
      .where(eq(schema.announcements.id, id))
      .returning();

    return updated;
  }

  /**
   * Delete an announcement (admin)
   */
  async delete(id: string) {
    const [existing] = await this.db
      .select({ id: schema.announcements.id })
      .from(schema.announcements)
      .where(eq(schema.announcements.id, id))
      .limit(1);

    if (!existing) {
      throw new NotFoundException('Announcement not found');
    }

    // Dismissals will be cascade deleted
    await this.db
      .delete(schema.announcements)
      .where(eq(schema.announcements.id, id));

    return { success: true };
  }
}
