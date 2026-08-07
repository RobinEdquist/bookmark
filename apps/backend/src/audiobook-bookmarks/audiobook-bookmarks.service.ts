import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, asc, eq } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as bookmarksSchema from './schema';
import * as audiobookSchema from '../audiobooks/schema';
import { CreateAudiobookBookmarkDto } from './dto/create-audiobook-bookmark.dto';
import { UpdateAudiobookBookmarkDto } from './dto/update-audiobook-bookmark.dto';
import { AudiobookBookmarkDto } from './dto/audiobook-bookmark-response.dto';

type BookmarkRow = typeof bookmarksSchema.audiobookBookmarks.$inferSelect;

@Injectable()
export class AudiobookBookmarksService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<
      typeof bookmarksSchema & typeof audiobookSchema
    >,
  ) {}

  async list(
    userId: string,
    audiobookId: string,
  ): Promise<AudiobookBookmarkDto[]> {
    const rows = await this.db
      .select()
      .from(bookmarksSchema.audiobookBookmarks)
      .where(
        and(
          eq(bookmarksSchema.audiobookBookmarks.userId, userId),
          eq(bookmarksSchema.audiobookBookmarks.audiobookId, audiobookId),
        ),
      )
      .orderBy(
        asc(bookmarksSchema.audiobookBookmarks.position),
        asc(bookmarksSchema.audiobookBookmarks.createdAt),
      );

    return rows.map((row) => this.toDto(row));
  }

  async create(
    userId: string,
    audiobookId: string,
    dto: CreateAudiobookBookmarkDto,
  ): Promise<AudiobookBookmarkDto> {
    await this.assertValidPosition(audiobookId, dto.position);

    const inserted = await this.db
      .insert(bookmarksSchema.audiobookBookmarks)
      .values({
        ...(dto.id !== undefined && { id: dto.id }),
        userId,
        audiobookId,
        note: this.normalizeNote(dto.note),
        position: dto.position,
      })
      .onConflictDoNothing({
        target: bookmarksSchema.audiobookBookmarks.id,
      })
      .returning();

    const row = inserted[0];
    if (row) {
      return this.toDto(row);
    }

    // Insert was skipped: the client-supplied id already exists. Treat a
    // replay of the same user's create as idempotent success; anything else
    // is a genuine conflict.
    if (dto.id !== undefined) {
      const existing = await this.db
        .select()
        .from(bookmarksSchema.audiobookBookmarks)
        .where(eq(bookmarksSchema.audiobookBookmarks.id, dto.id));

      const match = existing[0];
      if (
        match &&
        match.userId === userId &&
        match.audiobookId === audiobookId
      ) {
        return this.toDto(match);
      }
    }

    throw new ConflictException('A bookmark with this id already exists');
  }

  async update(
    userId: string,
    audiobookId: string,
    bookmarkId: string,
    dto: UpdateAudiobookBookmarkDto,
  ): Promise<AudiobookBookmarkDto> {
    if (dto.position === undefined && dto.note === undefined) {
      throw new BadRequestException(
        'At least one of position or note must be provided',
      );
    }

    if (dto.position !== undefined) {
      await this.assertValidPosition(audiobookId, dto.position);
    }

    const updated = await this.db
      .update(bookmarksSchema.audiobookBookmarks)
      .set({
        ...(dto.position !== undefined && { position: dto.position }),
        ...(dto.note !== undefined && { note: this.normalizeNote(dto.note) }),
      })
      .where(
        and(
          eq(bookmarksSchema.audiobookBookmarks.id, bookmarkId),
          eq(bookmarksSchema.audiobookBookmarks.userId, userId),
          eq(bookmarksSchema.audiobookBookmarks.audiobookId, audiobookId),
        ),
      )
      .returning();

    const row = updated[0];
    if (!row) {
      throw new NotFoundException('Bookmark not found');
    }
    return this.toDto(row);
  }

  async remove(
    userId: string,
    audiobookId: string,
    bookmarkId: string,
  ): Promise<void> {
    const result = await this.db
      .delete(bookmarksSchema.audiobookBookmarks)
      .where(
        and(
          eq(bookmarksSchema.audiobookBookmarks.id, bookmarkId),
          eq(bookmarksSchema.audiobookBookmarks.userId, userId),
          eq(bookmarksSchema.audiobookBookmarks.audiobookId, audiobookId),
        ),
      );

    if (result.rowCount === 0) {
      throw new NotFoundException('Bookmark not found');
    }
  }

  /**
   * Verifies the audiobook exists (404 otherwise) and that the position does
   * not point past its end. Duration is nullable in the schema (e.g. not yet
   * scanned) — in that case only the lower bound is enforced by the DTO.
   */
  private async assertValidPosition(
    audiobookId: string,
    position: number,
  ): Promise<void> {
    const audiobook = await this.db
      .select({
        id: audiobookSchema.audiobooks.id,
        duration: audiobookSchema.audiobooks.duration,
      })
      .from(audiobookSchema.audiobooks)
      .where(eq(audiobookSchema.audiobooks.id, audiobookId));

    const row = audiobook[0];
    if (!row) {
      throw new NotFoundException('Audiobook not found');
    }

    if (row.duration !== null && position > row.duration) {
      throw new BadRequestException(
        'Bookmark position exceeds the audiobook duration',
      );
    }
  }

  private normalizeNote(note: string | undefined): string | null {
    const trimmed = note?.trim();
    return trimmed ? trimmed : null;
  }

  private toDto(row: BookmarkRow): AudiobookBookmarkDto {
    return {
      id: row.id,
      audiobookId: row.audiobookId,
      note: row.note ?? null,
      position: row.position,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
