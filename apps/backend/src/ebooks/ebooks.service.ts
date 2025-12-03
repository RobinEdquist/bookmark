import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, ne, ilike, or, desc, asc, SQL, and, isNotNull, exists, sql } from 'drizzle-orm';
import * as fs from 'fs/promises';
import * as path from 'path';
import sharp from 'sharp';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as schema from './schema';
import * as audiobookSchema from '../audiobooks/schema';
import * as hardcoverSchema from '../hardcover/schema';
import { UpdateEbookDto } from './dto/update-ebook.dto';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { AppEventsService } from '../events/app-events.service';
import { EbookMetadataProvider } from '../library-watcher/metadata/ebook-metadata.provider';

export interface EbookListItem {
  id: string;
  title: string;
  subtitle: string | null;
  pageCount: number | null;
  coverUrl: string | null;
  createdAt: Date;
  status: 'available' | 'missing' | 'importing';
  authors: { id: string; name: string }[];
  series: { id: string; name: string; order: string }[];
  hardcoverLinked: boolean;
  hardcoverRating: number | null;
  hardcoverRatingsCount: number | null;
}

export interface EbookFilters {
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
export class EbooksService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: NodePgDatabase<typeof schema>,
    private appSettingsService: AppSettingsService,
    private appEvents: AppEventsService,
    private ebookMetadataProvider: EbookMetadataProvider,
  ) {}

  /**
   * Convert a relative file path (stored in DB) to an absolute path using the ebook library path
   */
  private async resolveFilePath(relativePath: string): Promise<string> {
    const ebookLibraryPath = await this.appSettingsService.getEbookLibraryPath();
    if (!ebookLibraryPath) {
      throw new Error('Ebook library path not configured');
    }
    return path.join(ebookLibraryPath, relativePath);
  }

  async findAll(
    filters: EbookFilters = {},
  ): Promise<{ ebooks: EbookListItem[]; total: number }> {
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

    // Always exclude hidden ebooks
    conditions.push(ne(schema.ebooks.status, 'hidden'));

    if (search) {
      const searchPattern = `%${search}%`;

      // Search in title and subtitle
      const titleMatch = ilike(schema.ebooks.title, searchPattern);
      const subtitleMatch = ilike(schema.ebooks.subtitle, searchPattern);

      // Search in authors (via ebookAuthors -> people)
      const authorMatch = exists(
        this.db
          .select({ one: sql`1` })
          .from(schema.ebookAuthors)
          .innerJoin(audiobookSchema.people, eq(schema.ebookAuthors.personId, audiobookSchema.people.id))
          .where(
            and(
              eq(schema.ebookAuthors.ebookId, schema.ebooks.id),
              ilike(audiobookSchema.people.name, searchPattern),
            ),
          ),
      );

      // Search in series (via ebookSeries -> series)
      const seriesMatch = exists(
        this.db
          .select({ one: sql`1` })
          .from(schema.ebookSeries)
          .innerJoin(audiobookSchema.series, eq(schema.ebookSeries.seriesId, audiobookSchema.series.id))
          .where(
            and(
              eq(schema.ebookSeries.ebookId, schema.ebooks.id),
              ilike(audiobookSchema.series.name, searchPattern),
            ),
          ),
      );

      conditions.push(or(titleMatch, subtitleMatch, authorMatch, seriesMatch)!);
    }

    if (language) {
      conditions.push(eq(schema.ebooks.language, language));
    }

    // Base query for ebooks
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const countResult = await this.db
      .select({ count: schema.ebooks.id })
      .from(schema.ebooks)
      .where(whereClause);
    const total = countResult.length;

    // Get ebooks with sorting
    const orderBy =
      sortOrder === 'asc'
        ? asc(schema.ebooks[sortBy === 'author' ? 'title' : sortBy])
        : desc(schema.ebooks[sortBy === 'author' ? 'title' : sortBy]);

    const ebooks = await this.db
      .select()
      .from(schema.ebooks)
      .where(whereClause)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    // Fetch authors, series, and Hardcover data for each ebook
    const result: EbookListItem[] = await Promise.all(
      ebooks.map(async (eb) => {
        const [authors, seriesData, hardcoverData] = await Promise.all([
          this.db
            .select({
              id: audiobookSchema.people.id,
              name: audiobookSchema.people.name,
            })
            .from(schema.ebookAuthors)
            .innerJoin(
              audiobookSchema.people,
              eq(schema.ebookAuthors.personId, audiobookSchema.people.id),
            )
            .where(eq(schema.ebookAuthors.ebookId, eb.id))
            .orderBy(asc(schema.ebookAuthors.order)),
          this.db
            .select({
              id: audiobookSchema.series.id,
              name: audiobookSchema.series.name,
              order: schema.ebookSeries.order,
            })
            .from(schema.ebookSeries)
            .innerJoin(
              audiobookSchema.series,
              eq(schema.ebookSeries.seriesId, audiobookSchema.series.id),
            )
            .where(eq(schema.ebookSeries.ebookId, eb.id)),
          this.db
            .select({
              rating: hardcoverSchema.hardcoverBooks.rating,
              ratingsCount: hardcoverSchema.hardcoverBooks.ratingsCount,
            })
            .from(hardcoverSchema.hardcoverEbookLinks)
            .innerJoin(
              hardcoverSchema.hardcoverBooks,
              eq(
                hardcoverSchema.hardcoverEbookLinks.hardcoverBookId,
                hardcoverSchema.hardcoverBooks.id,
              ),
            )
            .where(eq(hardcoverSchema.hardcoverEbookLinks.ebookId, eb.id))
            .limit(1),
        ]);

        const hc = hardcoverData[0] || null;

        return {
          id: eb.id,
          title: eb.title,
          subtitle: eb.subtitle,
          pageCount: eb.pageCount,
          coverUrl: this.getCoverUrl(eb.id, eb.coverUrl, eb.coverSource),
          createdAt: eb.createdAt,
          status: eb.status as 'available' | 'missing' | 'importing',
          authors,
          series: seriesData,
          hardcoverLinked: !!hc,
          hardcoverRating: hc?.rating ? parseFloat(hc.rating) : null,
          hardcoverRatingsCount: hc?.ratingsCount ?? null,
        };
      }),
    );

    return { ebooks: result, total };
  }

  async findById(id: string) {
    const ebook = await this.db
      .select()
      .from(schema.ebooks)
      .where(eq(schema.ebooks.id, id))
      .limit(1);

    if (ebook.length === 0) {
      throw new NotFoundException('Ebook not found');
    }

    const eb = ebook[0];

    // Fetch all related data
    const [authors, seriesData, genres, tags] = await Promise.all([
      this.db
        .select({
          id: audiobookSchema.people.id,
          name: audiobookSchema.people.name,
          imageUrl: audiobookSchema.people.imageUrl,
        })
        .from(schema.ebookAuthors)
        .innerJoin(
          audiobookSchema.people,
          eq(schema.ebookAuthors.personId, audiobookSchema.people.id),
        )
        .where(eq(schema.ebookAuthors.ebookId, id))
        .orderBy(asc(schema.ebookAuthors.order)),
      this.db
        .select({
          id: audiobookSchema.series.id,
          name: audiobookSchema.series.name,
          order: schema.ebookSeries.order,
        })
        .from(schema.ebookSeries)
        .innerJoin(
          audiobookSchema.series,
          eq(schema.ebookSeries.seriesId, audiobookSchema.series.id),
        )
        .where(eq(schema.ebookSeries.ebookId, id)),
      this.db
        .select({ id: audiobookSchema.genres.id, name: audiobookSchema.genres.name })
        .from(schema.ebookGenres)
        .innerJoin(
          audiobookSchema.genres,
          eq(schema.ebookGenres.genreId, audiobookSchema.genres.id),
        )
        .where(eq(schema.ebookGenres.ebookId, id)),
      this.db
        .select({ id: audiobookSchema.tags.id, name: audiobookSchema.tags.name })
        .from(schema.ebookTags)
        .innerJoin(audiobookSchema.tags, eq(schema.ebookTags.tagId, audiobookSchema.tags.id))
        .where(eq(schema.ebookTags.ebookId, id)),
    ]);

    return {
      ...eb,
      coverUrl: this.getCoverUrl(eb.id, eb.coverUrl, eb.coverSource),
      authors,
      series: seriesData,
      genres,
      tags,
    };
  }

  private getCoverUrl(
    id: string,
    coverUrl: string | null,
    coverSource: 'embedded' | 'uploaded' | 'filesystem' | null,
  ): string | null {
    if (coverSource || coverUrl) {
      return `/api/ebooks/${id}/cover`;
    }
    return null;
  }

  async getCover(
    id: string,
  ): Promise<{ data: Buffer; mimeType: string } | null> {
    const ebook = await this.db
      .select({
        filePath: schema.ebooks.filePath,
        coverSource: schema.ebooks.coverSource,
        coverUrl: schema.ebooks.coverUrl,
      })
      .from(schema.ebooks)
      .where(eq(schema.ebooks.id, id))
      .limit(1);

    if (ebook.length === 0) {
      throw new NotFoundException('Ebook not found');
    }

    const { filePath, coverSource, coverUrl } = ebook[0];

    // If there's an external cover file (uploaded or filesystem)
    if (coverUrl && (coverSource === 'uploaded' || coverSource === 'filesystem')) {
      try {
        // coverUrl stores just the filename (e.g., 'cover.jpg')
        // For ebooks, the cover is stored alongside the epub file
        const dir = path.dirname(filePath);
        const relativeCoverPath = path.join(dir, coverUrl);
        const absoluteCoverPath = await this.resolveFilePath(relativeCoverPath);
        const data = await fs.readFile(absoluteCoverPath);
        const ext = path.extname(coverUrl).toLowerCase();
        const mimeType =
          ext === '.png'
            ? 'image/png'
            : ext === '.webp'
              ? 'image/webp'
              : ext === '.gif'
                ? 'image/gif'
                : 'image/jpeg';
        return { data, mimeType };
      } catch {
        // Fall through to try embedded
      }
    }

    // Try to extract embedded cover from the EPUB
    if (coverSource === 'embedded') {
      try {
        const absolutePath = await this.resolveFilePath(filePath);
        return await this.ebookMetadataProvider.extractCoverFromFile(absolutePath);
      } catch {
        return null;
      }
    }

    return null;
  }

  async update(id: string, dto: UpdateEbookDto) {
    // Verify ebook exists and get current manualFields
    const existing = await this.db
      .select({
        id: schema.ebooks.id,
        manualFields: schema.ebooks.manualFields,
      })
      .from(schema.ebooks)
      .where(eq(schema.ebooks.id, id))
      .limit(1);

    if (existing.length === 0) {
      throw new NotFoundException('Ebook not found');
    }

    // Track which fields are being manually edited
    const currentManualFields = (existing[0].manualFields as string[]) || [];
    const newManualFields = new Set(currentManualFields);

    // Update basic fields
    const updateData: Partial<typeof schema.ebooks.$inferInsert> = {};

    if (dto.title !== undefined) {
      updateData.title = dto.title;
      newManualFields.add('title');
    }
    if (dto.subtitle !== undefined) {
      updateData.subtitle = dto.subtitle || null;
      newManualFields.add('subtitle');
    }
    if (dto.description !== undefined) {
      updateData.description = dto.description || null;
      newManualFields.add('description');
    }
    if (dto.publisher !== undefined) {
      updateData.publisher = dto.publisher || null;
      newManualFields.add('publisher');
    }
    if (dto.language !== undefined) {
      updateData.language = dto.language || null;
      newManualFields.add('language');
    }
    if (dto.publishedDate !== undefined) {
      updateData.publishedDate = dto.publishedDate || null;
      newManualFields.add('publishedDate');
    }
    if (dto.isbn !== undefined) {
      updateData.isbn = dto.isbn || null;
      newManualFields.add('isbn');
    }
    if (dto.asin !== undefined) {
      updateData.asin = dto.asin || null;
      newManualFields.add('asin');
    }
    if (dto.pageCount !== undefined) {
      updateData.pageCount = dto.pageCount || null;
      newManualFields.add('pageCount');
    }
    if (dto.isExplicit !== undefined) {
      updateData.isExplicit = dto.isExplicit;
      newManualFields.add('isExplicit');
    }

    // Always update manualFields if we have any updates
    if (Object.keys(updateData).length > 0) {
      updateData.manualFields = Array.from(newManualFields);
      await this.db
        .update(schema.ebooks)
        .set(updateData)
        .where(eq(schema.ebooks.id, id));
    }

    // Update authors if provided
    if (dto.authorNames !== undefined) {
      await this.updateAuthors(id, dto.authorNames);
      newManualFields.add('author');
    }

    // Update genres if provided
    if (dto.genreNames !== undefined) {
      await this.updateGenres(id, dto.genreNames);
      newManualFields.add('genres');
    }

    // Update tags if provided
    if (dto.tagNames !== undefined) {
      await this.updateTags(id, dto.tagNames);
    }

    // Update manualFields for relation changes (if not already updated above)
    const relationFieldsChanged =
      dto.authorNames !== undefined || dto.genreNames !== undefined;

    if (relationFieldsChanged && Object.keys(updateData).length === 0) {
      await this.db
        .update(schema.ebooks)
        .set({ manualFields: Array.from(newManualFields) })
        .where(eq(schema.ebooks.id, id));
    }

    const result = await this.findById(id);
    this.appEvents.ebookUpdated(id);
    return result;
  }

  private async updateAuthors(ebookId: string, names: string[]) {
    // Delete existing relations
    await this.db
      .delete(schema.ebookAuthors)
      .where(eq(schema.ebookAuthors.ebookId, ebookId));

    // Create new relations
    for (let i = 0; i < names.length; i++) {
      const name = names[i].trim();
      if (!name) continue;

      // Find or create person
      let [person] = await this.db
        .select()
        .from(audiobookSchema.people)
        .where(eq(audiobookSchema.people.name, name))
        .limit(1);

      if (!person) {
        [person] = await this.db
          .insert(audiobookSchema.people)
          .values({ name })
          .returning();
      }

      // Create relation
      await this.db.insert(schema.ebookAuthors).values({
        ebookId,
        personId: person.id,
        order: i,
      });
    }
  }

  private async updateGenres(ebookId: string, genreNames: string[]) {
    // Delete existing relations
    await this.db
      .delete(schema.ebookGenres)
      .where(eq(schema.ebookGenres.ebookId, ebookId));

    // Create new relations
    for (const name of genreNames) {
      const trimmedName = name.trim();
      if (!trimmedName) continue;

      // Find or create genre
      let [genre] = await this.db
        .select()
        .from(audiobookSchema.genres)
        .where(eq(audiobookSchema.genres.name, trimmedName))
        .limit(1);

      if (!genre) {
        [genre] = await this.db
          .insert(audiobookSchema.genres)
          .values({ name: trimmedName })
          .returning();
      }

      // Create relation
      await this.db.insert(schema.ebookGenres).values({
        ebookId,
        genreId: genre.id,
      });
    }
  }

  private async updateTags(ebookId: string, tagNames: string[]) {
    // Delete existing relations
    await this.db
      .delete(schema.ebookTags)
      .where(eq(schema.ebookTags.ebookId, ebookId));

    // Create new relations
    for (const name of tagNames) {
      const trimmedName = name.trim();
      if (!trimmedName) continue;

      // Find or create tag
      let [tag] = await this.db
        .select()
        .from(audiobookSchema.tags)
        .where(eq(audiobookSchema.tags.name, trimmedName))
        .limit(1);

      if (!tag) {
        [tag] = await this.db
          .insert(audiobookSchema.tags)
          .values({ name: trimmedName })
          .returning();
      }

      // Create relation
      await this.db.insert(schema.ebookTags).values({
        ebookId,
        tagId: tag.id,
      });
    }
  }

  async getAuthors(search?: string): Promise<{ id: string; name: string }[]> {
    const conditions: SQL[] = [];

    if (search) {
      conditions.push(ilike(audiobookSchema.people.name, `%${search}%`));
    }

    // Get people who are ebook authors (linked via ebookAuthors)
    const authors = await this.db
      .selectDistinct({
        id: audiobookSchema.people.id,
        name: audiobookSchema.people.name,
      })
      .from(audiobookSchema.people)
      .innerJoin(
        schema.ebookAuthors,
        eq(audiobookSchema.people.id, schema.ebookAuthors.personId),
      )
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(audiobookSchema.people.name))
      .limit(50);

    return authors;
  }

  async getPublishers(search?: string): Promise<string[]> {
    const conditions: SQL[] = [];

    // Only get non-null publishers
    conditions.push(isNotNull(schema.ebooks.publisher));

    if (search) {
      conditions.push(ilike(schema.ebooks.publisher, `%${search}%`));
    }

    const publishers = await this.db
      .selectDistinct({
        publisher: schema.ebooks.publisher,
      })
      .from(schema.ebooks)
      .where(and(...conditions))
      .orderBy(asc(schema.ebooks.publisher))
      .limit(50);

    return publishers.map((p) => p.publisher!);
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
    // Get ebook to find library path
    const ebook = await this.db
      .select({
        filePath: schema.ebooks.filePath,
      })
      .from(schema.ebooks)
      .where(eq(schema.ebooks.id, id))
      .limit(1);

    if (ebook.length === 0) {
      throw new NotFoundException('Ebook not found');
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

    // Resolve the ebook's directory and save cover
    const ebookDir = path.dirname(ebook[0].filePath);
    const absoluteDir = await this.resolveFilePath(ebookDir);
    const coverPath = path.join(absoluteDir, 'cover.jpg');

    await fs.writeFile(coverPath, processedBuffer);

    // Update database
    await this.db
      .update(schema.ebooks)
      .set({
        coverUrl: 'cover.jpg',
        coverSource: 'uploaded',
      })
      .where(eq(schema.ebooks.id, id));

    this.appEvents.ebookUpdated(id);
    return { coverUrl: `/api/ebooks/${id}/cover` };
  }

  async delete(id: string, deleteFiles: boolean): Promise<void> {
    // Get ebook details first
    const ebook = await this.db
      .select({
        id: schema.ebooks.id,
        filePath: schema.ebooks.filePath,
        status: schema.ebooks.status,
      })
      .from(schema.ebooks)
      .where(eq(schema.ebooks.id, id))
      .limit(1);

    if (ebook.length === 0) {
      throw new NotFoundException('Ebook not found');
    }

    const { filePath, status } = ebook[0];

    // Determine if we should fully delete from DB:
    // - If deleteFiles is true (user wants to delete files)
    // - If status is 'missing' (files are already gone, no point keeping record)
    const shouldDeleteFromDb = deleteFiles || status === 'missing';

    if (shouldDeleteFromDb) {
      // Delete files from disk if requested and not already missing
      if (deleteFiles && status !== 'missing') {
        try {
          const absolutePath = await this.resolveFilePath(filePath);
          await fs.unlink(absolutePath);

          // Also try to delete associated cover
          const dir = path.dirname(absolutePath);
          const coverPath = path.join(dir, 'cover.jpg');
          try {
            await fs.unlink(coverPath);
          } catch {
            // Cover might not exist, ignore
          }
        } catch (error) {
          // Log but continue with DB deletion if file removal fails
          console.error(`Failed to delete files for ebook ${id}:`, error);
        }
      }

      // Delete the ebook - related records are deleted via ON DELETE CASCADE
      await this.db.delete(schema.ebooks).where(eq(schema.ebooks.id, id));

      this.appEvents.ebookDeleted(id);
    } else {
      // Keep files but hide from library
      await this.db
        .update(schema.ebooks)
        .set({ status: 'hidden' })
        .where(eq(schema.ebooks.id, id));

      this.appEvents.ebookUpdated(id);
    }
  }

  /**
   * Get download information for an ebook.
   */
  async getDownloadInfo(id: string): Promise<{
    filePath: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
  }> {
    const ebook = await this.db
      .select({
        filePath: schema.ebooks.filePath,
        fileName: schema.ebooks.fileName,
        sizeBytes: schema.ebooks.sizeBytes,
        format: schema.ebooks.format,
      })
      .from(schema.ebooks)
      .where(eq(schema.ebooks.id, id))
      .limit(1);

    if (ebook.length === 0) {
      throw new NotFoundException('Ebook not found');
    }

    const { filePath, fileName, sizeBytes, format } = ebook[0];
    const absolutePath = await this.resolveFilePath(filePath);

    const mimeTypes: Record<string, string> = {
      epub: 'application/epub+zip',
      pdf: 'application/pdf',
      mobi: 'application/x-mobipocket-ebook',
    };

    return {
      filePath: absolutePath,
      fileName,
      mimeType: mimeTypes[format.toLowerCase()] || 'application/octet-stream',
      fileSize: sizeBytes,
    };
  }
}
