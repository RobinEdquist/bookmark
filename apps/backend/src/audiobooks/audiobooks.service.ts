import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, ilike, or, desc, asc, SQL, and, inArray } from 'drizzle-orm';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as schema from './schema';
import { EmbeddedMetadataProvider } from '../library-watcher/metadata/embedded-metadata.provider';
import { UpdateAudiobookDto } from './dto/update-audiobook.dto';

export interface AudiobookListItem {
  id: string;
  title: string;
  subtitle: string | null;
  duration: number | null;
  coverUrl: string | null;
  createdAt: Date;
  authors: { id: string; name: string }[];
  series: { id: string; name: string; order: string }[];
}

export interface AudiobookFilters {
  search?: string;
  genreId?: string;
  seriesId?: string;
  authorId?: string;
  language?: string;
  sortBy?: 'title' | 'createdAt' | 'author';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

@Injectable()
export class AudiobooksService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: NodePgDatabase<typeof schema>,
    private metadataProvider: EmbeddedMetadataProvider,
  ) {}

  async findAll(
    filters: AudiobookFilters = {},
  ): Promise<{ audiobooks: AudiobookListItem[]; total: number }> {
    const {
      search,
      language,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      limit = 24,
      offset = 0,
    } = filters;

    // Build where conditions
    const conditions: SQL[] = [];

    if (search) {
      conditions.push(
        or(
          ilike(schema.audiobooks.title, `%${search}%`),
          ilike(schema.audiobooks.subtitle, `%${search}%`),
        )!,
      );
    }

    if (language) {
      conditions.push(eq(schema.audiobooks.language, language));
    }

    // Base query for audiobooks
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const countResult = await this.db
      .select({ count: schema.audiobooks.id })
      .from(schema.audiobooks)
      .where(whereClause);
    const total = countResult.length;

    // Get audiobooks with sorting
    const orderBy =
      sortOrder === 'asc'
        ? asc(schema.audiobooks[sortBy === 'author' ? 'title' : sortBy])
        : desc(schema.audiobooks[sortBy === 'author' ? 'title' : sortBy]);

    const audiobooks = await this.db
      .select()
      .from(schema.audiobooks)
      .where(whereClause)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    // Fetch authors and series for each audiobook
    const result: AudiobookListItem[] = await Promise.all(
      audiobooks.map(async (ab) => {
        const authors = await this.db
          .select({
            id: schema.people.id,
            name: schema.people.name,
          })
          .from(schema.audiobookAuthors)
          .innerJoin(
            schema.people,
            eq(schema.audiobookAuthors.personId, schema.people.id),
          )
          .where(eq(schema.audiobookAuthors.audiobookId, ab.id))
          .orderBy(asc(schema.audiobookAuthors.order));

        const seriesData = await this.db
          .select({
            id: schema.series.id,
            name: schema.series.name,
            order: schema.audiobookSeries.order,
          })
          .from(schema.audiobookSeries)
          .innerJoin(
            schema.series,
            eq(schema.audiobookSeries.seriesId, schema.series.id),
          )
          .where(eq(schema.audiobookSeries.audiobookId, ab.id));

        return {
          id: ab.id,
          title: ab.title,
          subtitle: ab.subtitle,
          duration: ab.duration,
          coverUrl: this.getCoverUrl(ab.id, ab.coverUrl, ab.coverSource),
          createdAt: ab.createdAt,
          authors,
          series: seriesData,
        };
      }),
    );

    return { audiobooks: result, total };
  }

  async findById(id: string) {
    const audiobook = await this.db
      .select()
      .from(schema.audiobooks)
      .where(eq(schema.audiobooks.id, id))
      .limit(1);

    if (audiobook.length === 0) {
      throw new NotFoundException('Audiobook not found');
    }

    const ab = audiobook[0];

    // Fetch all related data
    const [files, chapters, authors, narrators, seriesData, genres, tags] =
      await Promise.all([
        this.db
          .select()
          .from(schema.audiobookFiles)
          .where(eq(schema.audiobookFiles.audiobookId, id))
          .orderBy(asc(schema.audiobookFiles.order)),
        this.db
          .select()
          .from(schema.chapters)
          .where(eq(schema.chapters.audiobookId, id))
          .orderBy(asc(schema.chapters.order)),
        this.db
          .select({
            id: schema.people.id,
            name: schema.people.name,
            imageUrl: schema.people.imageUrl,
          })
          .from(schema.audiobookAuthors)
          .innerJoin(
            schema.people,
            eq(schema.audiobookAuthors.personId, schema.people.id),
          )
          .where(eq(schema.audiobookAuthors.audiobookId, id))
          .orderBy(asc(schema.audiobookAuthors.order)),
        this.db
          .select({
            id: schema.people.id,
            name: schema.people.name,
            imageUrl: schema.people.imageUrl,
          })
          .from(schema.audiobookNarrators)
          .innerJoin(
            schema.people,
            eq(schema.audiobookNarrators.personId, schema.people.id),
          )
          .where(eq(schema.audiobookNarrators.audiobookId, id))
          .orderBy(asc(schema.audiobookNarrators.order)),
        this.db
          .select({
            id: schema.series.id,
            name: schema.series.name,
            order: schema.audiobookSeries.order,
          })
          .from(schema.audiobookSeries)
          .innerJoin(
            schema.series,
            eq(schema.audiobookSeries.seriesId, schema.series.id),
          )
          .where(eq(schema.audiobookSeries.audiobookId, id)),
        this.db
          .select({ id: schema.genres.id, name: schema.genres.name })
          .from(schema.audiobookGenres)
          .innerJoin(
            schema.genres,
            eq(schema.audiobookGenres.genreId, schema.genres.id),
          )
          .where(eq(schema.audiobookGenres.audiobookId, id)),
        this.db
          .select({ id: schema.tags.id, name: schema.tags.name })
          .from(schema.audiobookTags)
          .innerJoin(schema.tags, eq(schema.audiobookTags.tagId, schema.tags.id))
          .where(eq(schema.audiobookTags.audiobookId, id)),
      ]);

    return {
      ...ab,
      coverUrl: this.getCoverUrl(ab.id, ab.coverUrl, ab.coverSource),
      files,
      chapters,
      authors,
      narrators,
      series: seriesData,
      genres,
      tags,
    };
  }

  private getCoverUrl(
    id: string,
    coverUrl: string | null,
    coverSource: 'embedded' | 'uploaded' | null,
  ): string | null {
    // Always return consistent URL pattern for API/mobile compatibility
    if (coverSource || coverUrl) {
      return `/api/audiobooks/${id}/cover`;
    }
    return null;
  }

  async getCover(
    id: string,
  ): Promise<{ data: Buffer; mimeType: string } | null> {
    const audiobook = await this.db
      .select({
        filePath: schema.audiobooks.filePath,
        coverSource: schema.audiobooks.coverSource,
        coverUrl: schema.audiobooks.coverUrl,
      })
      .from(schema.audiobooks)
      .where(eq(schema.audiobooks.id, id))
      .limit(1);

    if (audiobook.length === 0) {
      throw new NotFoundException('Audiobook not found');
    }

    const { filePath, coverSource, coverUrl } = audiobook[0];

    // If there's an external cover file stored next to the audiobook
    if (coverUrl && coverSource !== 'embedded') {
      try {
        const data = await fs.readFile(coverUrl);
        const ext = path.extname(coverUrl).toLowerCase();
        const mimeType =
          ext === '.png'
            ? 'image/png'
            : ext === '.webp'
              ? 'image/webp'
              : 'image/jpeg';
        return { data, mimeType };
      } catch {
        // Fall through to try embedded
      }
    }

    // Try to extract embedded cover from the first audio file
    if (coverSource === 'embedded') {
      // Get the first audio file for this audiobook
      const files = await this.db
        .select({ filePath: schema.audiobookFiles.filePath })
        .from(schema.audiobookFiles)
        .where(eq(schema.audiobookFiles.audiobookId, id))
        .orderBy(asc(schema.audiobookFiles.order))
        .limit(1);

      if (files.length > 0) {
        return this.metadataProvider.extractCover(files[0].filePath);
      }

      // Fallback: if filePath is the audio file itself (single-file audiobook)
      return this.metadataProvider.extractCover(filePath);
    }

    return null;
  }

  async update(id: string, dto: UpdateAudiobookDto) {
    // Verify audiobook exists
    const existing = await this.db
      .select({ id: schema.audiobooks.id })
      .from(schema.audiobooks)
      .where(eq(schema.audiobooks.id, id))
      .limit(1);

    if (existing.length === 0) {
      throw new NotFoundException('Audiobook not found');
    }

    // Update basic fields
    const updateData: Partial<typeof schema.audiobooks.$inferInsert> = {};

    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.subtitle !== undefined) updateData.subtitle = dto.subtitle || null;
    if (dto.description !== undefined)
      updateData.description = dto.description || null;
    if (dto.publisher !== undefined) updateData.publisher = dto.publisher || null;
    if (dto.language !== undefined) updateData.language = dto.language || null;
    if (dto.publishedDate !== undefined)
      updateData.publishedDate = dto.publishedDate || null;
    if (dto.isbn !== undefined) updateData.isbn = dto.isbn || null;
    if (dto.asin !== undefined) updateData.asin = dto.asin || null;
    if (dto.isExplicit !== undefined) updateData.isExplicit = dto.isExplicit;

    if (Object.keys(updateData).length > 0) {
      await this.db
        .update(schema.audiobooks)
        .set(updateData)
        .where(eq(schema.audiobooks.id, id));
    }

    // Update authors if provided
    if (dto.authorNames !== undefined) {
      await this.updatePeopleRelation(
        id,
        dto.authorNames,
        'author',
        schema.audiobookAuthors,
      );
    }

    // Update narrators if provided
    if (dto.narratorNames !== undefined) {
      await this.updatePeopleRelation(
        id,
        dto.narratorNames,
        'narrator',
        schema.audiobookNarrators,
      );
    }

    // Update genres if provided
    if (dto.genreNames !== undefined) {
      await this.updateGenres(id, dto.genreNames);
    }

    // Update tags if provided
    if (dto.tagNames !== undefined) {
      await this.updateTags(id, dto.tagNames);
    }

    return this.findById(id);
  }

  private async updatePeopleRelation(
    audiobookId: string,
    names: string[],
    _role: 'author' | 'narrator',
    relationTable: typeof schema.audiobookAuthors | typeof schema.audiobookNarrators,
  ) {
    // Delete existing relations
    await this.db
      .delete(relationTable)
      .where(eq(relationTable.audiobookId, audiobookId));

    // Create new relations
    for (let i = 0; i < names.length; i++) {
      const name = names[i].trim();
      if (!name) continue;

      // Find or create person
      let [person] = await this.db
        .select()
        .from(schema.people)
        .where(eq(schema.people.name, name))
        .limit(1);

      if (!person) {
        [person] = await this.db
          .insert(schema.people)
          .values({ name })
          .returning();
      }

      // Create relation
      await this.db.insert(relationTable).values({
        audiobookId,
        personId: person.id,
        order: i,
      });
    }
  }

  private async updateGenres(audiobookId: string, genreNames: string[]) {
    // Delete existing relations
    await this.db
      .delete(schema.audiobookGenres)
      .where(eq(schema.audiobookGenres.audiobookId, audiobookId));

    // Create new relations
    for (const name of genreNames) {
      const trimmedName = name.trim();
      if (!trimmedName) continue;

      // Find or create genre
      let [genre] = await this.db
        .select()
        .from(schema.genres)
        .where(eq(schema.genres.name, trimmedName))
        .limit(1);

      if (!genre) {
        [genre] = await this.db
          .insert(schema.genres)
          .values({ name: trimmedName })
          .returning();
      }

      // Create relation
      await this.db.insert(schema.audiobookGenres).values({
        audiobookId,
        genreId: genre.id,
      });
    }
  }

  private async updateTags(audiobookId: string, tagNames: string[]) {
    // Delete existing relations
    await this.db
      .delete(schema.audiobookTags)
      .where(eq(schema.audiobookTags.audiobookId, audiobookId));

    // Create new relations
    for (const name of tagNames) {
      const trimmedName = name.trim();
      if (!trimmedName) continue;

      // Find or create tag
      let [tag] = await this.db
        .select()
        .from(schema.tags)
        .where(eq(schema.tags.name, trimmedName))
        .limit(1);

      if (!tag) {
        [tag] = await this.db
          .insert(schema.tags)
          .values({ name: trimmedName })
          .returning();
      }

      // Create relation
      await this.db.insert(schema.audiobookTags).values({
        audiobookId,
        tagId: tag.id,
      });
    }
  }
}
