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
import { AppEventsService } from '../events/app-events.service';
import { MetadataSource, MetadataFieldPriority } from '../app-settings/schema';

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
    private appEvents: AppEventsService,
  ) {}

  /**
   * Convert a relative file path (stored in DB) to an absolute path using the audiobook library path
   */
  private async resolveFilePath(relativePath: string): Promise<string> {
    const audiobookLibraryPath = await this.appSettingsService.getAudiobookLibraryPath();
    if (!audiobookLibraryPath) {
      throw new Error('Audiobook library path not configured');
    }
    return path.join(audiobookLibraryPath, relativePath);
  }

  /**
   * Resolve a field value based on metadata priority settings.
   * Manual edits always take priority, then follows the configured order.
   * Returns the first non-empty value according to priority order.
   */
  private resolveFieldByPriority<T>(
    fieldName: keyof MetadataFieldPriority,
    sources: {
      manual: T | null | undefined;
      embedded: T | null | undefined;
      hardcover: T | null | undefined;
    },
    priority: MetadataSource[],
    manualFields: string[],
  ): T | null {
    // Manual edits always take priority
    if (manualFields.includes(fieldName)) {
      const value = sources.manual;
      if (this.hasValue(value)) return value;
    }

    // Then follow the configured priority order (excluding 'manual' since we already checked it)
    for (const source of priority) {
      if (source === 'manual') {
        // Already checked above
        continue;
      } else if (source === 'embedded') {
        const value = sources.embedded;
        if (this.hasValue(value)) return value;
      } else if (source === 'hardcover') {
        const value = sources.hardcover;
        if (this.hasValue(value)) return value;
      }
      // 'filename' and 'folder_image' sources are only relevant during import
    }
    // Fallback: return embedded (which is the original DB value)
    return sources.embedded ?? null;
  }

  /**
   * Check if a value is non-empty (not null, undefined, empty string, or empty array)
   */
  private hasValue<T>(value: T | null | undefined): value is T {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string' && value.trim() === '') return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
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

    // Batch fetch hardcover data with all fields needed for priority-based merging
    const hardcoverLinks =
      audiobookIds.length > 0
        ? await this.db
            .select({
              audiobookId: hardcoverSchema.hardcoverAudiobookLinks.audiobookId,
              hardcoverBook: hardcoverSchema.hardcoverBooks,
            })
            .from(hardcoverSchema.hardcoverAudiobookLinks)
            .innerJoin(
              hardcoverSchema.hardcoverBooks,
              eq(
                hardcoverSchema.hardcoverAudiobookLinks.hardcoverBookId,
                hardcoverSchema.hardcoverBooks.id,
              ),
            )
            .where(
              inArray(hardcoverSchema.hardcoverAudiobookLinks.audiobookId, audiobookIds),
            )
        : [];

    const hardcoverDataMap = new Map(
      hardcoverLinks.map((l) => [l.audiobookId, l.hardcoverBook]),
    );

    // Get metadata priority settings
    const metadataPriority = await this.appSettingsService.getMetadataPriority();

    // Fetch authors and series for each audiobook
    const result: AudiobookListItem[] = await Promise.all(
      audiobooks.map(async (ab) => {
        const manualFields = (ab.manualFields as string[]) || [];

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

        const hc = hardcoverDataMap.get(ab.id) || null;

        // Apply priority-based resolution for title
        const resolvedTitle = this.resolveFieldByPriority(
          'title',
          { manual: ab.title, embedded: ab.title, hardcover: hc?.title },
          metadataPriority.title,
          manualFields,
        ) || ab.title;

        // Apply priority-based resolution for subtitle
        const resolvedSubtitle = this.resolveFieldByPriority(
          'subtitle',
          { manual: ab.subtitle, embedded: ab.subtitle, hardcover: null },
          metadataPriority.subtitle,
          manualFields,
        );

        // Apply priority-based resolution for authors
        const embeddedAuthorNames = authors.map((a) => a.name);
        const hardcoverAuthorNames = hc?.authorNames || [];
        const resolvedAuthorNames = this.resolveFieldByPriority(
          'author',
          {
            manual: embeddedAuthorNames,
            embedded: embeddedAuthorNames,
            hardcover: hardcoverAuthorNames,
          },
          metadataPriority.author,
          manualFields,
        ) || embeddedAuthorNames;

        // If hardcover authors win, create virtual author objects
        const resolvedAuthors = resolvedAuthorNames === hardcoverAuthorNames && hc
          ? hardcoverAuthorNames.map((name, idx) => ({
              id: `hc-author-${idx}`,
              name,
            }))
          : authors;

        // Apply priority-based resolution for series
        const embeddedSeriesNames = seriesData.map((s) => s.name);
        const hardcoverSeriesName = hc?.featuredSeriesName ? [hc.featuredSeriesName] : [];
        const resolvedSeriesNames = this.resolveFieldByPriority(
          'series',
          {
            manual: embeddedSeriesNames,
            embedded: embeddedSeriesNames,
            hardcover: hardcoverSeriesName,
          },
          metadataPriority.series,
          manualFields,
        ) || embeddedSeriesNames;

        // If hardcover series wins, create virtual series object
        const resolvedSeries = resolvedSeriesNames === hardcoverSeriesName && hc?.featuredSeriesName
          ? [{
              id: `hc-series-0`,
              name: hc.featuredSeriesName,
              order: hc.featuredSeriesPosition || '0',
            }]
          : seriesData;

        return {
          id: ab.id,
          title: resolvedTitle,
          subtitle: resolvedSubtitle,
          duration: ab.duration,
          coverUrl: this.getCoverUrl(ab.id, ab.coverUrl, ab.coverSource),
          createdAt: ab.createdAt,
          // Hidden audiobooks are filtered out in the query, so status is never 'hidden' here
          status: ab.status as 'available' | 'missing' | 'importing',
          authors: resolvedAuthors,
          series: resolvedSeries,
          hardcoverLinked: !!hc,
          hardcoverRating: hc?.rating ? parseFloat(hc.rating) : null,
          hardcoverRatingsCount: hc?.ratingsCount ?? null,
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
    const manualFields = (ab.manualFields as string[]) || [];

    // Fetch all related data including Hardcover data and priority settings
    const [
      files,
      chapters,
      authors,
      narrators,
      seriesData,
      genres,
      tags,
      hardcoverData,
      metadataPriority,
    ] = await Promise.all([
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
      this.db
        .select({
          hardcoverBook: hardcoverSchema.hardcoverBooks,
        })
        .from(hardcoverSchema.hardcoverAudiobookLinks)
        .innerJoin(
          hardcoverSchema.hardcoverBooks,
          eq(
            hardcoverSchema.hardcoverAudiobookLinks.hardcoverBookId,
            hardcoverSchema.hardcoverBooks.id,
          ),
        )
        .where(eq(hardcoverSchema.hardcoverAudiobookLinks.audiobookId, id))
        .limit(1),
      this.appSettingsService.getMetadataPriority(),
    ]);

    const hc = hardcoverData[0]?.hardcoverBook || null;

    // Apply priority-based merging for each field
    // For scalar fields, use the helper. For relations, we need special handling.

    // Title - always required, fallback to embedded
    const resolvedTitle = this.resolveFieldByPriority(
      'title',
      { manual: ab.title, embedded: ab.title, hardcover: hc?.title },
      metadataPriority.title,
      manualFields,
    ) || ab.title;

    // Subtitle
    const resolvedSubtitle = this.resolveFieldByPriority(
      'subtitle',
      { manual: ab.subtitle, embedded: ab.subtitle, hardcover: null }, // Hardcover doesn't have subtitle
      metadataPriority.subtitle,
      manualFields,
    );

    // Description
    const resolvedDescription = this.resolveFieldByPriority(
      'description',
      { manual: ab.description, embedded: ab.description, hardcover: hc?.description },
      metadataPriority.description,
      manualFields,
    );

    // Publisher
    const resolvedPublisher = this.resolveFieldByPriority(
      'publisher',
      { manual: ab.publisher, embedded: ab.publisher, hardcover: null }, // Hardcover doesn't have publisher
      metadataPriority.publisher,
      manualFields,
    );

    // Published Date
    const resolvedPublishedDate = this.resolveFieldByPriority(
      'publishedDate',
      { manual: ab.publishedDate, embedded: ab.publishedDate, hardcover: null },
      metadataPriority.publishedDate,
      manualFields,
    );

    // Language
    const resolvedLanguage = this.resolveFieldByPriority(
      'language',
      { manual: ab.language, embedded: ab.language, hardcover: null },
      metadataPriority.language,
      manualFields,
    );

    // Authors - need to handle as array of names
    const embeddedAuthorNames = authors.map((a) => a.name);
    const hardcoverAuthorNames = hc?.authorNames || [];
    const resolvedAuthorNames = this.resolveFieldByPriority(
      'author',
      {
        manual: embeddedAuthorNames,
        embedded: embeddedAuthorNames,
        hardcover: hardcoverAuthorNames,
      },
      metadataPriority.author,
      manualFields,
    ) || embeddedAuthorNames;

    // If hardcover authors win, we need to create virtual author objects
    const resolvedAuthors = resolvedAuthorNames === hardcoverAuthorNames && hc
      ? hardcoverAuthorNames.map((name, idx) => ({
          id: `hc-author-${idx}`,
          name,
          imageUrl: null,
        }))
      : authors;

    // Genres - keep audiobook genres separate from Hardcover genres
    // Audiobook genres come from embedded metadata or manual edits only
    // Hardcover genres are returned separately in the hardcover object
    const resolvedGenres = genres;

    // Series - Hardcover provides featured series
    const embeddedSeriesNames = seriesData.map((s) => s.name);
    const hardcoverSeriesName = hc?.featuredSeriesName ? [hc.featuredSeriesName] : [];
    const resolvedSeriesNames = this.resolveFieldByPriority(
      'series',
      {
        manual: embeddedSeriesNames,
        embedded: embeddedSeriesNames,
        hardcover: hardcoverSeriesName,
      },
      metadataPriority.series,
      manualFields,
    ) || embeddedSeriesNames;

    // If hardcover series wins, create virtual series object
    const resolvedSeries = resolvedSeriesNames === hardcoverSeriesName && hc?.featuredSeriesName
      ? [{
          id: `hc-series-0`,
          name: hc.featuredSeriesName,
          order: hc.featuredSeriesPosition || '0',
        }]
      : seriesData;

    return {
      ...ab,
      title: resolvedTitle,
      subtitle: resolvedSubtitle,
      description: resolvedDescription,
      publisher: resolvedPublisher,
      publishedDate: resolvedPublishedDate,
      language: resolvedLanguage,
      coverUrl: this.getCoverUrl(ab.id, ab.coverUrl, ab.coverSource),
      files,
      chapters,
      authors: resolvedAuthors,
      narrators, // Hardcover doesn't have narrators
      series: resolvedSeries,
      genres: resolvedGenres,
      tags, // Tags are user-created, not from metadata sources
      // Include hardcover data for display (separate from audiobook data)
      hardcover: hc ? {
        id: hc.hardcoverId,
        slug: hc.slug,
        rating: hc.rating ? parseFloat(hc.rating) : null,
        ratingsCount: hc.ratingsCount,
        imageUrl: hc.imageUrl,
        genres: hc.genres,
        moods: hc.moods,
        contentWarnings: hc.contentWarnings,
      } : null,
    };
  }

  private getCoverUrl(
    id: string,
    coverUrl: string | null,
    coverSource: 'embedded' | 'uploaded' | 'filesystem' | null,
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

    // If there's an external cover file (uploaded or filesystem)
    if (coverUrl && (coverSource === 'uploaded' || coverSource === 'filesystem')) {
      try {
        // coverUrl stores just the filename (e.g., 'cover.jpg')
        // Join it with the audiobook's filePath to get the full relative path
        const relativeCoverPath = path.join(filePath, coverUrl);
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
    // Verify audiobook exists and get current manualFields
    const existing = await this.db
      .select({
        id: schema.audiobooks.id,
        manualFields: schema.audiobooks.manualFields,
      })
      .from(schema.audiobooks)
      .where(eq(schema.audiobooks.id, id))
      .limit(1);

    if (existing.length === 0) {
      throw new NotFoundException('Audiobook not found');
    }

    // Track which fields are being manually edited
    const currentManualFields = (existing[0].manualFields as string[]) || [];
    const newManualFields = new Set(currentManualFields);

    // Update basic fields
    const updateData: Partial<typeof schema.audiobooks.$inferInsert> = {};

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
    if (dto.isExplicit !== undefined) {
      updateData.isExplicit = dto.isExplicit;
      newManualFields.add('isExplicit');
    }

    // Always update manualFields if we have any updates
    if (Object.keys(updateData).length > 0) {
      updateData.manualFields = Array.from(newManualFields);
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
      newManualFields.add('author');
    }

    // Update narrators if provided
    if (dto.narratorNames !== undefined) {
      await this.updatePeopleRelation(
        id,
        dto.narratorNames,
        'narrator',
        schema.audiobookNarrators,
      );
      newManualFields.add('narrator');
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
      dto.authorNames !== undefined ||
      dto.narratorNames !== undefined ||
      dto.genreNames !== undefined;

    if (relationFieldsChanged && Object.keys(updateData).length === 0) {
      await this.db
        .update(schema.audiobooks)
        .set({ manualFields: Array.from(newManualFields) })
        .where(eq(schema.audiobooks.id, id));
    }

    const result = await this.findById(id);
    this.appEvents.audiobookUpdated(id);
    return result;
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

    this.appEvents.audiobookUpdated(id);
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

      this.appEvents.audiobookDeleted(id);
    } else {
      // Keep files but hide from library
      await this.db
        .update(schema.audiobooks)
        .set({ status: 'hidden' })
        .where(eq(schema.audiobooks.id, id));

      this.appEvents.audiobookUpdated(id);
    }
  }

  /**
   * Get download information for an audiobook.
   * Returns either a single file path (for single-file audiobooks with embedded cover)
   * or information needed to create a ZIP archive (for multi-file or separate cover).
   */
  async getDownloadInfo(id: string): Promise<{
    isZip: boolean;
    filePath?: string;
    files?: Array<{ filePath: string; fileName: string }>;
    coverPath?: string;
    fileName: string;
    mimeType: string;
    fileSize?: number;
  }> {
    // Get audiobook with cover info
    const audiobook = await this.db
      .select({
        id: schema.audiobooks.id,
        title: schema.audiobooks.title,
        filePath: schema.audiobooks.filePath,
        coverUrl: schema.audiobooks.coverUrl,
        coverSource: schema.audiobooks.coverSource,
      })
      .from(schema.audiobooks)
      .where(eq(schema.audiobooks.id, id))
      .limit(1);

    if (audiobook.length === 0) {
      throw new NotFoundException('Audiobook not found');
    }

    const ab = audiobook[0];

    // Get audiobook files
    const files = await this.db
      .select({
        filePath: schema.audiobookFiles.filePath,
        fileName: schema.audiobookFiles.fileName,
        format: schema.audiobookFiles.format,
        sizeBytes: schema.audiobookFiles.sizeBytes,
      })
      .from(schema.audiobookFiles)
      .where(eq(schema.audiobookFiles.audiobookId, id))
      .orderBy(asc(schema.audiobookFiles.order));

    if (files.length === 0) {
      throw new NotFoundException('Audiobook has no audio files');
    }

    // Check if cover is separate (not embedded in audio file)
    const hasSeparateCover =
      ab.coverSource === 'filesystem' || ab.coverSource === 'uploaded';

    // Resolve cover path if separate
    let coverPath: string | undefined;
    if (hasSeparateCover && ab.coverUrl) {
      try {
        const relativeCoverPath = path.join(ab.filePath, ab.coverUrl);
        coverPath = await this.resolveFilePath(relativeCoverPath);
        // Verify file exists
        await fs.access(coverPath);
      } catch {
        coverPath = undefined; // Cover file not found, skip it
      }
    }

    // Single file with embedded cover - direct download
    if (files.length === 1 && !hasSeparateCover) {
      const file = files[0];
      const absolutePath = await this.resolveFilePath(file.filePath);

      const mimeTypes: Record<string, string> = {
        mp3: 'audio/mpeg',
        m4a: 'audio/mp4',
        m4b: 'audio/mp4',
        ogg: 'audio/ogg',
        flac: 'audio/flac',
        wav: 'audio/wav',
      };

      return {
        isZip: false,
        filePath: absolutePath,
        fileName: file.fileName,
        mimeType: mimeTypes[file.format.toLowerCase()] || 'audio/mpeg',
        fileSize: file.sizeBytes,
      };
    }

    // Multiple files OR separate cover - ZIP download
    // Sanitize title for filename
    const sanitizedTitle = ab.title
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '') // Remove invalid filename chars
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .substring(0, 200); // Limit length

    return {
      isZip: true,
      files: await Promise.all(
        files.map(async (f) => ({
          filePath: await this.resolveFilePath(f.filePath),
          fileName: f.fileName,
        })),
      ),
      coverPath,
      fileName: `${sanitizedTitle}.zip`,
      mimeType: 'application/zip',
    };
  }

  /**
   * Get streaming information for an audiobook at a specific position.
   * Handles multi-file audiobooks by finding the correct file and offset.
   */
  async getStreamInfo(
    id: string,
    positionSeconds: number = 0,
  ): Promise<{
    filePath: string;
    mimeType: string;
    fileSize: number;
    offsetInFile: number;
    fileDuration: number;
    totalDuration: number;
    fileIndex: number;
    fileStartPosition: number; // cumulative position where this file starts
  }> {
    // Get audiobook files ordered by sequence
    const files = await this.db
      .select()
      .from(schema.audiobookFiles)
      .where(eq(schema.audiobookFiles.audiobookId, id))
      .orderBy(asc(schema.audiobookFiles.order));

    if (files.length === 0) {
      throw new NotFoundException('Audiobook has no audio files');
    }

    // Calculate total duration
    const totalDuration = files.reduce((sum, f) => sum + f.duration, 0);

    // Clamp position to valid range
    const clampedPosition = Math.max(0, Math.min(positionSeconds, totalDuration));

    // Find which file contains the requested position
    let cumulative = 0;
    let targetFile = files[0];
    let fileIndex = 0;
    let fileStartPosition = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (clampedPosition < cumulative + file.duration) {
        targetFile = file;
        fileIndex = i;
        fileStartPosition = cumulative;
        break;
      }
      cumulative += file.duration;
      // If we've gone through all files, use the last one
      if (i === files.length - 1) {
        targetFile = file;
        fileIndex = i;
        fileStartPosition = cumulative - file.duration;
      }
    }

    // Calculate offset within the file
    const offsetInFile = clampedPosition - fileStartPosition;

    // Resolve absolute path
    const absolutePath = await this.resolveFilePath(targetFile.filePath);

    // Determine MIME type from format
    const mimeTypes: Record<string, string> = {
      mp3: 'audio/mpeg',
      m4a: 'audio/mp4',
      m4b: 'audio/mp4',
      ogg: 'audio/ogg',
      flac: 'audio/flac',
      wav: 'audio/wav',
    };
    const mimeType = mimeTypes[targetFile.format.toLowerCase()] || 'audio/mpeg';

    return {
      filePath: absolutePath,
      mimeType,
      fileSize: targetFile.sizeBytes,
      offsetInFile,
      fileDuration: targetFile.duration,
      totalDuration,
      fileIndex,
      fileStartPosition,
    };
  }
}
