import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, ne, ilike, or, desc, asc, SQL, and, inArray, isNotNull, exists, sql } from 'drizzle-orm';
import * as fs from 'fs/promises';
import * as path from 'path';
import sharp from 'sharp';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as schema from './schema';
import * as hardcoverSchema from '../hardcover/schema';
import { EmbeddedMetadataProvider } from '../library-watcher/metadata/embedded-metadata.provider';
import { UpdateAudiobookDto } from './dto/update-audiobook.dto';
import { AppSettingsService } from '../app-settings/app-settings.service';

export interface AudiobookListItem {
  id: string;
  title: string;
  subtitle: string | null;
  duration: number | null;
  coverUrl: string | null;
  createdAt: Date;
  status: 'available' | 'missing' | 'importing';
  authors: { id: string; name: string }[];
  series: { id: string; name: string; order: string }[];
  hardcoverLinked: boolean;
  hardcoverRating: number | null;
  hardcoverRatingsCount: number | null;
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
    private appSettingsService: AppSettingsService,
  ) {}

  /**
   * Convert a relative file path (stored in DB) to an absolute path using the library path
   */
  private async resolveFilePath(relativePath: string): Promise<string> {
    const libraryPath = await this.appSettingsService.getLibraryPath();
    if (!libraryPath) {
      throw new Error('Library path not configured');
    }
    return path.join(libraryPath, relativePath);
  }

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

    // Always exclude hidden audiobooks
    conditions.push(ne(schema.audiobooks.status, 'hidden'));

    if (search) {
      const searchPattern = `%${search}%`;

      // Search in title and subtitle
      const titleMatch = ilike(schema.audiobooks.title, searchPattern);
      const subtitleMatch = ilike(schema.audiobooks.subtitle, searchPattern);

      // Search in authors (via audiobookAuthors -> people)
      const authorMatch = exists(
        this.db
          .select({ one: sql`1` })
          .from(schema.audiobookAuthors)
          .innerJoin(schema.people, eq(schema.audiobookAuthors.personId, schema.people.id))
          .where(
            and(
              eq(schema.audiobookAuthors.audiobookId, schema.audiobooks.id),
              ilike(schema.people.name, searchPattern),
            ),
          ),
      );

      // Search in series (via audiobookSeries -> series)
      const seriesMatch = exists(
        this.db
          .select({ one: sql`1` })
          .from(schema.audiobookSeries)
          .innerJoin(schema.series, eq(schema.audiobookSeries.seriesId, schema.series.id))
          .where(
            and(
              eq(schema.audiobookSeries.audiobookId, schema.audiobooks.id),
              ilike(schema.series.name, searchPattern),
            ),
          ),
      );

      conditions.push(or(titleMatch, subtitleMatch, authorMatch, seriesMatch)!);
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

    // Get all audiobook IDs for batch fetching
    const audiobookIds = audiobooks.map((ab) => ab.id);

    // Batch fetch hardcover links with rating data
    const hardcoverLinks =
      audiobookIds.length > 0
        ? await this.db
            .select({
              audiobookId: hardcoverSchema.hardcoverBooks.audiobookId,
              rating: hardcoverSchema.hardcoverBooks.rating,
              ratingsCount: hardcoverSchema.hardcoverBooks.ratingsCount,
            })
            .from(hardcoverSchema.hardcoverBooks)
            .where(
              inArray(hardcoverSchema.hardcoverBooks.audiobookId, audiobookIds),
            )
        : [];

    const hardcoverDataMap = new Map(
      hardcoverLinks.map((l) => [
        l.audiobookId,
        {
          rating: l.rating ? parseFloat(l.rating) : null,
          ratingsCount: l.ratingsCount,
        },
      ]),
    );

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

        const hardcoverData = hardcoverDataMap.get(ab.id);

        return {
          id: ab.id,
          title: ab.title,
          subtitle: ab.subtitle,
          duration: ab.duration,
          coverUrl: this.getCoverUrl(ab.id, ab.coverUrl, ab.coverSource),
          createdAt: ab.createdAt,
          // Hidden audiobooks are filtered out in the query, so status is never 'hidden' here
          status: ab.status as 'available' | 'missing' | 'importing',
          authors,
          series: seriesData,
          hardcoverLinked: !!hardcoverData,
          hardcoverRating: hardcoverData?.rating ?? null,
          hardcoverRatingsCount: hardcoverData?.ratingsCount ?? null,
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
        // coverUrl is stored as relative path, resolve it
        const absoluteCoverPath = await this.resolveFilePath(coverUrl);
        const data = await fs.readFile(absoluteCoverPath);
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
        // filePath is stored as relative, resolve to absolute
        const absoluteFilePath = await this.resolveFilePath(files[0].filePath);
        return this.metadataProvider.extractCover(absoluteFilePath);
      }

      // Fallback: if filePath is the audio file itself (single-file audiobook)
      const absoluteAudiobookPath = await this.resolveFilePath(filePath);
      return this.metadataProvider.extractCover(absoluteAudiobookPath);
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

  async getGenres(search?: string): Promise<{ id: string; name: string }[]> {
    const conditions: SQL[] = [];

    if (search) {
      conditions.push(ilike(schema.genres.name, `%${search}%`));
    }

    const genres = await this.db
      .select({
        id: schema.genres.id,
        name: schema.genres.name,
      })
      .from(schema.genres)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(schema.genres.name))
      .limit(50);

    return genres;
  }

  async getTags(search?: string): Promise<{ id: string; name: string }[]> {
    const conditions: SQL[] = [];

    if (search) {
      conditions.push(ilike(schema.tags.name, `%${search}%`));
    }

    const tags = await this.db
      .select({
        id: schema.tags.id,
        name: schema.tags.name,
      })
      .from(schema.tags)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(schema.tags.name))
      .limit(50);

    return tags;
  }

  async getPublishers(search?: string): Promise<string[]> {
    const conditions: SQL[] = [];

    // Only get non-null publishers
    conditions.push(isNotNull(schema.audiobooks.publisher));

    if (search) {
      conditions.push(ilike(schema.audiobooks.publisher, `%${search}%`));
    }

    const publishers = await this.db
      .selectDistinct({
        publisher: schema.audiobooks.publisher,
      })
      .from(schema.audiobooks)
      .where(and(...conditions))
      .orderBy(asc(schema.audiobooks.publisher))
      .limit(50);

    return publishers.map((p) => p.publisher!);
  }

  async getAuthors(search?: string): Promise<{ id: string; name: string }[]> {
    const conditions: SQL[] = [];

    if (search) {
      conditions.push(ilike(schema.people.name, `%${search}%`));
    }

    // Get people who are authors (linked via audiobookAuthors)
    const authors = await this.db
      .selectDistinct({
        id: schema.people.id,
        name: schema.people.name,
      })
      .from(schema.people)
      .innerJoin(
        schema.audiobookAuthors,
        eq(schema.people.id, schema.audiobookAuthors.personId),
      )
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(schema.people.name))
      .limit(50);

    return authors;
  }

  async getNarrators(search?: string): Promise<{ id: string; name: string }[]> {
    const conditions: SQL[] = [];

    if (search) {
      conditions.push(ilike(schema.people.name, `%${search}%`));
    }

    // Get people who are narrators (linked via audiobookNarrators)
    const narrators = await this.db
      .selectDistinct({
        id: schema.people.id,
        name: schema.people.name,
      })
      .from(schema.people)
      .innerJoin(
        schema.audiobookNarrators,
        eq(schema.people.id, schema.audiobookNarrators.personId),
      )
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(schema.people.name))
      .limit(50);

    return narrators;
  }

  async refreshChapters(id: string): Promise<{ count: number }> {
    // Verify audiobook exists
    const audiobook = await this.db
      .select()
      .from(schema.audiobooks)
      .where(eq(schema.audiobooks.id, id))
      .limit(1);

    if (audiobook.length === 0) {
      throw new NotFoundException('Audiobook not found');
    }

    // Get audiobook files
    const files = await this.db
      .select()
      .from(schema.audiobookFiles)
      .where(eq(schema.audiobookFiles.audiobookId, id))
      .orderBy(asc(schema.audiobookFiles.order));

    if (files.length === 0) {
      return { count: 0 };
    }

    // Delete existing chapters
    await this.db
      .delete(schema.chapters)
      .where(eq(schema.chapters.audiobookId, id));

    // Extract chapters from each file
    let totalChapters = 0;
    let timeOffset = 0;

    for (const file of files) {
      // Resolve relative path to absolute
      const absoluteFilePath = await this.resolveFilePath(file.filePath);
      const extractedChapters = await this.metadataProvider.extractChapters(absoluteFilePath);

      if (extractedChapters.length > 0) {
        // Insert chapters with proper ordering and time offset for multi-file audiobooks
        await this.db.insert(schema.chapters).values(
          extractedChapters.map((chap, index) => ({
            audiobookId: id,
            title: chap.title,
            startTime: chap.startTime + timeOffset,
            endTime: chap.endTime ? chap.endTime + timeOffset : null,
            order: totalChapters + index + 1,
            source: 'embedded' as const,
          })),
        );

        totalChapters += extractedChapters.length;
      }

      // Add file duration to offset for next file
      timeOffset += file.duration;
    }

    return { count: totalChapters };
  }

  async updateCoverFromFile(
    id: string,
    buffer: Buffer,
  ): Promise<{ coverUrl: string }> {
    return this.processAndSaveCover(id, buffer);
  }

  async updateCoverFromUrl(
    id: string,
    url: string,
  ): Promise<{ coverUrl: string }> {
    // Fetch the image from URL
    let response: Response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

      response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'SimpleAudiobookVault/1.0',
        },
      });

      clearTimeout(timeout);
    } catch (error) {
      throw new UnprocessableEntityException(
        `Failed to fetch image from URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }

    if (!response.ok) {
      throw new UnprocessableEntityException(
        `Failed to fetch image: HTTP ${response.status}`,
      );
    }

    // Validate content type
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.startsWith('image/')) {
      throw new BadRequestException('URL does not point to an image');
    }

    // Check content length if available
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > 2 * 1024 * 1024) {
      throw new BadRequestException('Image size exceeds 2 MB limit');
    }

    // Read the response body
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Double-check size after download
    if (buffer.length > 2 * 1024 * 1024) {
      throw new BadRequestException('Image size exceeds 2 MB limit');
    }

    return this.processAndSaveCover(id, buffer);
  }

  private async processAndSaveCover(
    id: string,
    buffer: Buffer,
  ): Promise<{ coverUrl: string }> {
    // Get audiobook to find library path
    const audiobook = await this.db
      .select({
        filePath: schema.audiobooks.filePath,
      })
      .from(schema.audiobooks)
      .where(eq(schema.audiobooks.id, id))
      .limit(1);

    if (audiobook.length === 0) {
      throw new NotFoundException('Audiobook not found');
    }

    // Process image with sharp
    let processedBuffer: Buffer;
    try {
      processedBuffer = await sharp(buffer)
        .resize(1000, 1000, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85 })
        .toBuffer();
    } catch {
      throw new BadRequestException('Invalid image file');
    }

    // Resolve the audiobook's library path and save cover
    const absolutePath = await this.resolveFilePath(audiobook[0].filePath);
    const coverPath = path.join(absolutePath, 'cover.jpg');

    await fs.writeFile(coverPath, processedBuffer);

    // Update database
    await this.db
      .update(schema.audiobooks)
      .set({
        coverUrl: 'cover.jpg',
        coverSource: 'uploaded',
      })
      .where(eq(schema.audiobooks.id, id));

    return { coverUrl: `/api/audiobooks/${id}/cover` };
  }

  async delete(id: string, deleteFiles: boolean): Promise<void> {
    // Get audiobook details first
    const audiobook = await this.db
      .select({
        id: schema.audiobooks.id,
        filePath: schema.audiobooks.filePath,
        status: schema.audiobooks.status,
      })
      .from(schema.audiobooks)
      .where(eq(schema.audiobooks.id, id))
      .limit(1);

    if (audiobook.length === 0) {
      throw new NotFoundException('Audiobook not found');
    }

    const { filePath, status } = audiobook[0];

    // Determine if we should fully delete from DB:
    // - If deleteFiles is true (user wants to delete files)
    // - If status is 'missing' (files are already gone, no point keeping record)
    const shouldDeleteFromDb = deleteFiles || status === 'missing';

    if (shouldDeleteFromDb) {
      // Delete files from disk if requested and not already missing
      if (deleteFiles && status !== 'missing') {
        try {
          const absolutePath = await this.resolveFilePath(filePath);
          const stat = await fs.stat(absolutePath);

          if (stat.isDirectory()) {
            // Delete entire directory for multi-file audiobooks
            await fs.rm(absolutePath, { recursive: true, force: true });
          } else {
            // Delete single file
            await fs.unlink(absolutePath);
          }
        } catch (error) {
          // Log but continue with DB deletion if file removal fails
          console.error(`Failed to delete files for audiobook ${id}:`, error);
        }
      }

      // Delete the audiobook - related records are deleted via ON DELETE CASCADE
      await this.db
        .delete(schema.audiobooks)
        .where(eq(schema.audiobooks.id, id));
    } else {
      // Keep files but hide from library
      await this.db
        .update(schema.audiobooks)
        .set({ status: 'hidden' })
        .where(eq(schema.audiobooks.id, id));
    }
  }
}
