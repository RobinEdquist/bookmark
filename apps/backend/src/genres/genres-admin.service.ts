import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, sql, and, ne } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import { genres, audiobookGenres } from '../audiobooks/schema';
import { ebookGenres } from '../ebooks/schema';
import type {
  AdminGenreDto,
  RenameConflictDto,
  MergeResultDto,
} from './dto/admin-genre.dto';

@Injectable()
export class GenresAdminService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase,
  ) {}

  async findAll(): Promise<AdminGenreDto[]> {
    const result = await this.db
      .select({
        id: genres.id,
        name: genres.name,
        audiobookCount: sql<number>`(
          SELECT COUNT(*)::int FROM audiobook_genres ag WHERE ag.genre_id = ${genres.id}
        )`,
        ebookCount: sql<number>`(
          SELECT COUNT(*)::int FROM ebook_genres eg WHERE eg.genre_id = ${genres.id}
        )`,
      })
      .from(genres)
      .orderBy(genres.name);

    return result;
  }

  async rename(
    id: string,
    newName: string,
  ): Promise<AdminGenreDto | RenameConflictDto> {
    // Check if genre exists
    const [genre] = await this.db
      .select()
      .from(genres)
      .where(eq(genres.id, id));

    if (!genre) {
      throw new NotFoundException('Genre not found');
    }

    // If name unchanged, return current genre
    if (genre.name === newName) {
      const counts = await this.getGenreCounts(id);
      return { id, name: newName, ...counts };
    }

    // Check if target name already exists (case-insensitive)
    const [existing] = await this.db
      .select()
      .from(genres)
      .where(
        and(sql`LOWER(${genres.name}) = LOWER(${newName})`, ne(genres.id, id)),
      );

    if (existing) {
      // Return conflict info for frontend to show merge dialog
      const sourceCounts = await this.getGenreCounts(id);
      return {
        conflict: true,
        existingGenre: { id: existing.id, name: existing.name },
        sourceGenre: { id: genre.id, name: genre.name },
        audiobookCount: sourceCounts.audiobookCount,
        ebookCount: sourceCounts.ebookCount,
      };
    }

    // Simple rename
    await this.db
      .update(genres)
      .set({ name: newName })
      .where(eq(genres.id, id));

    const counts = await this.getGenreCounts(id);
    return { id, name: newName, ...counts };
  }

  async merge(sourceId: string, targetId: string): Promise<MergeResultDto> {
    // Validate both genres exist
    const [source] = await this.db
      .select()
      .from(genres)
      .where(eq(genres.id, sourceId));
    const [target] = await this.db
      .select()
      .from(genres)
      .where(eq(genres.id, targetId));

    if (!source) {
      throw new NotFoundException('Source genre not found');
    }
    if (!target) {
      throw new NotFoundException('Target genre not found');
    }

    // Get counts before merge
    const sourceCounts = await this.getGenreCounts(sourceId);

    // Merge audiobook_genres: update source to target, skip duplicates
    await this.db.execute(sql`
      UPDATE audiobook_genres
      SET genre_id = ${targetId}
      WHERE genre_id = ${sourceId}
        AND audiobook_id NOT IN (
          SELECT audiobook_id FROM audiobook_genres WHERE genre_id = ${targetId}
        )
    `);

    // Delete remaining source audiobook links (duplicates)
    await this.db
      .delete(audiobookGenres)
      .where(eq(audiobookGenres.genreId, sourceId));

    // Merge ebook_genres: update source to target, skip duplicates
    await this.db.execute(sql`
      UPDATE ebook_genres
      SET genre_id = ${targetId}
      WHERE genre_id = ${sourceId}
        AND ebook_id NOT IN (
          SELECT ebook_id FROM ebook_genres WHERE genre_id = ${targetId}
        )
    `);

    // Delete remaining source ebook links (duplicates)
    await this.db.delete(ebookGenres).where(eq(ebookGenres.genreId, sourceId));

    // Delete source genre
    await this.db.delete(genres).where(eq(genres.id, sourceId));

    return {
      id: targetId,
      name: target.name,
      audiobooksMerged: sourceCounts.audiobookCount,
      ebooksMerged: sourceCounts.ebookCount,
    };
  }

  async delete(id: string): Promise<void> {
    const [genre] = await this.db
      .select()
      .from(genres)
      .where(eq(genres.id, id));

    if (!genre) {
      throw new NotFoundException('Genre not found');
    }

    // Junction table entries are deleted via CASCADE
    await this.db.delete(genres).where(eq(genres.id, id));
  }

  private async getGenreCounts(
    id: string,
  ): Promise<{ audiobookCount: number; ebookCount: number }> {
    const [result] = await this.db
      .select({
        audiobookCount: sql<number>`(
          SELECT COUNT(*)::int FROM audiobook_genres WHERE genre_id = ${id}
        )`,
        ebookCount: sql<number>`(
          SELECT COUNT(*)::int FROM ebook_genres WHERE genre_id = ${id}
        )`,
      })
      .from(sql`(SELECT 1) as dummy`);

    return result;
  }
}
