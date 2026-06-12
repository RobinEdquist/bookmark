import {
  Inject,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  eq,
  ne,
  ilike,
  or,
  desc,
  asc,
  SQL,
  and,
  inArray,
  isNotNull,
  exists,
  notExists,
  sql,
} from 'drizzle-orm';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import { CoverService } from '../common/cover.service';
import * as schema from './schema';
import * as ebookSchema from '../ebooks/schema';
import * as hardcoverSchema from '../hardcover/schema';
import * as goodreadsSchema from '../gr-finder/schema';
import * as usersSchema from '../users/schema';
import { EmbeddedMetadataProvider } from '../library-watcher/metadata/embedded-metadata.provider';
import { UpdateAudiobookDto, SeriesEntryDto } from './dto/update-audiobook.dto';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { AppEventsService } from '../events/app-events.service';
import { AppDataService } from '../app-data/app-data.service';
import { MetadataSource, MetadataFieldPriority } from '../app-settings/schema';
import { splitPersonNames } from '../common/utils/name.utils';
import { resolveExternalTitle } from '../common/utils/title.utils';

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
  goodreadsLinked: boolean;
  goodreadsRating: number | null;
  goodreadsRatingsCount: number | null;
}

export interface AudiobookFilters {
  search?: string;
  genreId?: string;
  seriesId?: string;
  authorId?: string;
  language?: string;
  sortBy?: 'title' | 'createdAt' | 'author' | 'rating' | 'series';
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
    private appDataService: AppDataService,
    private coverService: CoverService,
  ) {}

  /**
   * Convert a relative file path (stored in DB) to an absolute path using the audiobook library path
   */
  private async resolveFilePath(relativePath: string): Promise<string> {
    const audiobookLibraryPath =
      await this.appSettingsService.getAudiobookLibraryPath();
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
      goodreads?: T | null | undefined;
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
      } else if (source === 'goodreads') {
        const value = sources.goodreads;
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

  /**
   * Check if an audiobook has any tags that are blacklisted for the given user.
   * Returns true if the audiobook should be hidden from this user.
   */
  async hasBlacklistedTags(
    audiobookId: string,
    userId: string,
  ): Promise<boolean> {
    const result = await this.db
      .select({ one: sql`1` })
      .from(schema.audiobookTags)
      .innerJoin(
        usersSchema.userBlacklistedTags,
        and(
          eq(schema.audiobookTags.tagId, usersSchema.userBlacklistedTags.tagId),
          eq(usersSchema.userBlacklistedTags.userId, userId),
        ),
      )
      .where(eq(schema.audiobookTags.audiobookId, audiobookId))
      .limit(1);

    return result.length > 0;
  }

  /**
   * Verify that the user can access this audiobook (not blacklisted).
   * Throws ForbiddenException if the audiobook has blacklisted tags for this user.
   */
  async verifyNotBlacklisted(
    audiobookId: string,
    userId: string,
  ): Promise<void> {
    const isBlacklisted = await this.hasBlacklistedTags(audiobookId, userId);
    if (isBlacklisted) {
      throw new ForbiddenException('Access denied');
    }
  }

  async findAll(
    filters: AudiobookFilters = {},
    userId?: string,
  ): Promise<{ audiobooks: AudiobookListItem[]; total: number }> {
    const {
      search,
      genreId,
      seriesId,
      authorId,
      language,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      limit,
      offset = 0,
    } = filters;

    // Build where conditions
    const conditions: SQL[] = [];

    // Always exclude hidden audiobooks
    conditions.push(ne(schema.audiobooks.status, 'hidden'));

    // Exclude audiobooks with blacklisted tags for this user
    if (userId) {
      const blacklistedTagsFilter = notExists(
        this.db
          .select({ one: sql`1` })
          .from(schema.audiobookTags)
          .innerJoin(
            usersSchema.userBlacklistedTags,
            and(
              eq(
                schema.audiobookTags.tagId,
                usersSchema.userBlacklistedTags.tagId,
              ),
              eq(usersSchema.userBlacklistedTags.userId, userId),
            ),
          )
          .where(eq(schema.audiobookTags.audiobookId, schema.audiobooks.id)),
      );
      conditions.push(blacklistedTagsFilter);
    }

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
          .innerJoin(
            schema.people,
            eq(schema.audiobookAuthors.personId, schema.people.id),
          )
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
          .innerJoin(
            schema.series,
            eq(schema.audiobookSeries.seriesId, schema.series.id),
          )
          .where(
            and(
              eq(schema.audiobookSeries.audiobookId, schema.audiobooks.id),
              ilike(schema.series.name, searchPattern),
            ),
          ),
      );

      // Search in linked Goodreads book (title and author)
      const goodreadsMatch = exists(
        this.db
          .select({ one: sql`1` })
          .from(goodreadsSchema.goodreadsAudiobookLinks)
          .innerJoin(
            goodreadsSchema.goodreadsBooks,
            eq(
              goodreadsSchema.goodreadsAudiobookLinks.goodreadsBookId,
              goodreadsSchema.goodreadsBooks.id,
            ),
          )
          .where(
            and(
              eq(
                goodreadsSchema.goodreadsAudiobookLinks.audiobookId,
                schema.audiobooks.id,
              ),
              or(
                ilike(goodreadsSchema.goodreadsBooks.title, searchPattern),
                ilike(goodreadsSchema.goodreadsBooks.author, searchPattern),
              ),
            ),
          ),
      );

      // Search in linked Hardcover book (title and author names)
      const hardcoverMatch = exists(
        this.db
          .select({ one: sql`1` })
          .from(hardcoverSchema.hardcoverAudiobookLinks)
          .innerJoin(
            hardcoverSchema.hardcoverBooks,
            eq(
              hardcoverSchema.hardcoverAudiobookLinks.hardcoverBookId,
              hardcoverSchema.hardcoverBooks.id,
            ),
          )
          .where(
            and(
              eq(
                hardcoverSchema.hardcoverAudiobookLinks.audiobookId,
                schema.audiobooks.id,
              ),
              or(
                ilike(hardcoverSchema.hardcoverBooks.title, searchPattern),
                sql`EXISTS (
                  SELECT 1 FROM jsonb_array_elements_text(${hardcoverSchema.hardcoverBooks.authorNames}) AS author_name
                  WHERE author_name ILIKE ${searchPattern}
                )`,
              ),
            ),
          ),
      );

      conditions.push(
        or(
          titleMatch,
          subtitleMatch,
          authorMatch,
          seriesMatch,
          goodreadsMatch,
          hardcoverMatch,
        )!,
      );
    }

    if (language) {
      conditions.push(eq(schema.audiobooks.language, language));
    }

    // Filter by genre using the audiobookGenres junction table
    if (genreId) {
      const genreFilter = exists(
        this.db
          .select({ one: sql`1` })
          .from(schema.audiobookGenres)
          .where(
            and(
              eq(schema.audiobookGenres.audiobookId, schema.audiobooks.id),
              eq(schema.audiobookGenres.genreId, genreId),
            ),
          ),
      );
      conditions.push(genreFilter);
    }

    // Filter by series using the audiobookSeries junction table
    if (seriesId) {
      const seriesFilter = exists(
        this.db
          .select({ one: sql`1` })
          .from(schema.audiobookSeries)
          .where(
            and(
              eq(schema.audiobookSeries.audiobookId, schema.audiobooks.id),
              eq(schema.audiobookSeries.seriesId, seriesId),
            ),
          ),
      );
      conditions.push(seriesFilter);
    }

    // Filter by author using the audiobookAuthors junction table
    if (authorId) {
      const authorFilter = exists(
        this.db
          .select({ one: sql`1` })
          .from(schema.audiobookAuthors)
          .where(
            and(
              eq(schema.audiobookAuthors.audiobookId, schema.audiobooks.id),
              eq(schema.audiobookAuthors.personId, authorId),
            ),
          ),
      );
      conditions.push(authorFilter);
    }

    // Base query for audiobooks
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const countResult = await this.db
      .select({ count: schema.audiobooks.id })
      .from(schema.audiobooks)
      .where(whereClause);
    const total = countResult.length;

    // Build order by clause based on sortBy
    let orderByClause: SQL;

    switch (sortBy) {
      case 'title':
        orderByClause =
          sortOrder === 'asc'
            ? asc(schema.audiobooks.title)
            : desc(schema.audiobooks.title);
        break;
      case 'createdAt':
        orderByClause =
          sortOrder === 'asc'
            ? asc(schema.audiobooks.createdAt)
            : desc(schema.audiobooks.createdAt);
        break;
      case 'author':
        // Sort by title as fallback since author is a relation
        orderByClause =
          sortOrder === 'asc'
            ? asc(schema.audiobooks.title)
            : desc(schema.audiobooks.title);
        break;
      case 'rating':
        // Will be handled after fetching Hardcover data
        orderByClause =
          sortOrder === 'asc'
            ? asc(schema.audiobooks.createdAt)
            : desc(schema.audiobooks.createdAt);
        break;
      case 'series':
        // Will be handled after fetching series data
        orderByClause =
          sortOrder === 'asc'
            ? asc(schema.audiobooks.title)
            : desc(schema.audiobooks.title);
        break;
      default:
        orderByClause = desc(schema.audiobooks.createdAt);
    }

    const baseQuery = this.db
      .select()
      .from(schema.audiobooks)
      .where(whereClause)
      .orderBy(orderByClause);

    const audiobooks =
      limit !== undefined
        ? await baseQuery.limit(limit).offset(offset)
        : await baseQuery;

    // Get all audiobook IDs for batch fetching
    const audiobookIds = audiobooks.map((ab) => ab.id);

    // Batch fetch all related data in parallel
    const [
      hardcoverLinks,
      goodreadsLinks,
      allAuthors,
      allSeriesData,
      metadataPriority,
    ] = await Promise.all([
      // Hardcover data
      audiobookIds.length > 0
        ? this.db
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
              inArray(
                hardcoverSchema.hardcoverAudiobookLinks.audiobookId,
                audiobookIds,
              ),
            )
        : [],
      // Goodreads data
      audiobookIds.length > 0
        ? this.db
            .select({
              audiobookId: goodreadsSchema.goodreadsAudiobookLinks.audiobookId,
              goodreadsBook: goodreadsSchema.goodreadsBooks,
            })
            .from(goodreadsSchema.goodreadsAudiobookLinks)
            .innerJoin(
              goodreadsSchema.goodreadsBooks,
              eq(
                goodreadsSchema.goodreadsAudiobookLinks.goodreadsBookId,
                goodreadsSchema.goodreadsBooks.id,
              ),
            )
            .where(
              inArray(
                goodreadsSchema.goodreadsAudiobookLinks.audiobookId,
                audiobookIds,
              ),
            )
        : [],
      // Authors for all audiobooks
      audiobookIds.length > 0
        ? this.db
            .select({
              audiobookId: schema.audiobookAuthors.audiobookId,
              personId: schema.people.id,
              personName: schema.people.name,
              order: schema.audiobookAuthors.order,
            })
            .from(schema.audiobookAuthors)
            .innerJoin(
              schema.people,
              eq(schema.audiobookAuthors.personId, schema.people.id),
            )
            .where(inArray(schema.audiobookAuthors.audiobookId, audiobookIds))
            .orderBy(
              asc(schema.audiobookAuthors.audiobookId),
              asc(schema.audiobookAuthors.order),
            )
        : [],
      // Series for all audiobooks
      audiobookIds.length > 0
        ? this.db
            .select({
              audiobookId: schema.audiobookSeries.audiobookId,
              seriesId: schema.series.id,
              seriesName: schema.series.name,
              order: schema.audiobookSeries.order,
            })
            .from(schema.audiobookSeries)
            .innerJoin(
              schema.series,
              eq(schema.audiobookSeries.seriesId, schema.series.id),
            )
            .where(inArray(schema.audiobookSeries.audiobookId, audiobookIds))
        : [],
      // Metadata priority settings
      this.appSettingsService.getMetadataPriority(),
    ]);

    // Build lookup maps for O(1) access
    type HardcoverBook = typeof hardcoverSchema.hardcoverBooks.$inferSelect;
    const hardcoverDataMap = new Map<string, HardcoverBook>(
      hardcoverLinks.map(
        (l) => [l.audiobookId, l.hardcoverBook] as [string, HardcoverBook],
      ),
    );

    type GoodreadsBook = typeof goodreadsSchema.goodreadsBooks.$inferSelect;
    const goodreadsDataMap = new Map<string, GoodreadsBook>(
      goodreadsLinks.map(
        (l) => [l.audiobookId, l.goodreadsBook] as [string, GoodreadsBook],
      ),
    );

    // Group authors by audiobook ID
    const authorsMap = new Map<string, { id: string; name: string }[]>();
    for (const author of allAuthors) {
      const existing = authorsMap.get(author.audiobookId) || [];
      existing.push({ id: author.personId, name: author.personName });
      authorsMap.set(author.audiobookId, existing);
    }

    // Group series by audiobook ID
    const seriesMap = new Map<
      string,
      { id: string; name: string; order: string }[]
    >();
    for (const s of allSeriesData) {
      const existing = seriesMap.get(s.audiobookId) || [];
      existing.push({ id: s.seriesId, name: s.seriesName, order: s.order });
      seriesMap.set(s.audiobookId, existing);
    }

    // Map audiobooks to list items (no async needed now)
    const result: AudiobookListItem[] = audiobooks.map((ab) => {
      const manualFields = (ab.manualFields as string[]) || [];
      const authors = authorsMap.get(ab.id) || [];
      const seriesData = seriesMap.get(ab.id) || [];
      const hc = hardcoverDataMap.get(ab.id) || null;
      const gr = goodreadsDataMap.get(ab.id) || null;

      // Apply priority-based resolution for title.
      // Hardcover/Goodreads historically stored "Title: Subtitle" in one field;
      // resolveExternalTitle normalizes that against the embedded title/subtitle
      // so the subtitle line below doesn't end up duplicating text already
      // baked into the resolved title.
      const resolvedTitle =
        this.resolveFieldByPriority(
          'title',
          {
            manual: ab.title,
            embedded: ab.title,
            hardcover: resolveExternalTitle(
              hc?.title,
              hc?.subtitle,
              ab.title,
              ab.subtitle,
            ),
            goodreads: resolveExternalTitle(
              gr?.title,
              gr?.subtitle,
              ab.title,
              ab.subtitle,
            ),
          },
          metadataPriority.title,
          manualFields,
        ) || ab.title;

      // Apply priority-based resolution for subtitle.
      // External sources populate `subtitle` when their incoming title has the
      // form `"Title: Subtitle"` — see splitTitleSubtitle in title.utils.
      const resolvedSubtitle = this.resolveFieldByPriority(
        'subtitle',
        {
          manual: ab.subtitle,
          embedded: ab.subtitle,
          hardcover: hc?.subtitle,
          goodreads: gr?.subtitle,
        },
        metadataPriority.subtitle,
        manualFields,
      );

      // Apply priority-based resolution for authors
      const embeddedAuthorNames = authors.map((a) => a.name);
      const hardcoverAuthorNames = hc?.authorNames || [];
      const goodreadsAuthorNames = splitPersonNames(gr?.author);
      const resolvedAuthorNames =
        this.resolveFieldByPriority(
          'author',
          {
            manual: embeddedAuthorNames,
            embedded: embeddedAuthorNames,
            hardcover: hardcoverAuthorNames,
            goodreads: goodreadsAuthorNames,
          },
          metadataPriority.author,
          manualFields,
        ) || embeddedAuthorNames;

      // If hardcover or goodreads authors win, create virtual author objects
      const resolvedAuthors =
        resolvedAuthorNames === hardcoverAuthorNames && hc
          ? hardcoverAuthorNames.map((name, idx) => ({
              id: `hc-author-${idx}`,
              name,
            }))
          : resolvedAuthorNames === goodreadsAuthorNames && gr
            ? goodreadsAuthorNames.map((name, idx) => ({
                id: `gr-author-${idx}`,
                name,
              }))
            : authors;

      // Apply priority-based resolution for series
      const embeddedSeriesNames = seriesData.map((s) => s.name);
      const hardcoverSeriesName = hc?.featuredSeriesName
        ? [hc.featuredSeriesName]
        : [];
      // Goodreads doesn't have series info
      const resolvedSeriesNames =
        this.resolveFieldByPriority(
          'series',
          {
            manual: embeddedSeriesNames,
            embedded: embeddedSeriesNames,
            hardcover: hardcoverSeriesName,
            goodreads: [],
          },
          metadataPriority.series,
          manualFields,
        ) || embeddedSeriesNames;

      // If hardcover series wins, create virtual series object
      const resolvedSeries =
        resolvedSeriesNames === hardcoverSeriesName && hc?.featuredSeriesName
          ? [
              {
                id: `hc-series-0`,
                name: hc.featuredSeriesName,
                order: hc.featuredSeriesPosition || '0',
              },
            ]
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
        goodreadsLinked: !!gr,
        goodreadsRating: gr?.rating ? parseFloat(gr.rating) : null,
        goodreadsRatingsCount: gr?.ratingsCount ?? null,
      };
    });

    // Apply client-side sorting for rating and series
    if (sortBy === 'rating') {
      result.sort((a, b) => {
        const ratingA =
          a.hardcoverRating ?? (sortOrder === 'desc' ? -Infinity : Infinity);
        const ratingB =
          b.hardcoverRating ?? (sortOrder === 'desc' ? -Infinity : Infinity);
        return sortOrder === 'desc' ? ratingB - ratingA : ratingA - ratingB;
      });
    } else if (sortBy === 'series') {
      result.sort((a, b) => {
        const seriesA = a.series[0]?.name ?? '';
        const seriesB = b.series[0]?.name ?? '';
        if (!seriesA && !seriesB) return 0;
        if (!seriesA) return sortOrder === 'asc' ? 1 : -1;
        if (!seriesB) return sortOrder === 'asc' ? -1 : 1;
        return sortOrder === 'asc'
          ? seriesA.localeCompare(seriesB)
          : seriesB.localeCompare(seriesA);
      });
    } else if (sortBy === 'author') {
      result.sort((a, b) => {
        const authorA = a.authors[0]?.name ?? '';
        const authorB = b.authors[0]?.name ?? '';
        return sortOrder === 'asc'
          ? authorA.localeCompare(authorB)
          : authorB.localeCompare(authorA);
      });
    }

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

    // Fetch all related data including Hardcover/Goodreads data and priority settings
    const [
      files,
      chapters,
      authors,
      narrators,
      seriesData,
      genres,
      tags,
      hardcoverData,
      goodreadsData,
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
      this.db
        .select({
          goodreadsBook: goodreadsSchema.goodreadsBooks,
        })
        .from(goodreadsSchema.goodreadsAudiobookLinks)
        .innerJoin(
          goodreadsSchema.goodreadsBooks,
          eq(
            goodreadsSchema.goodreadsAudiobookLinks.goodreadsBookId,
            goodreadsSchema.goodreadsBooks.id,
          ),
        )
        .where(eq(goodreadsSchema.goodreadsAudiobookLinks.audiobookId, id))
        .limit(1),
      this.appSettingsService.getMetadataPriority(),
    ]);

    const hc = hardcoverData[0]?.hardcoverBook || null;
    const gr = goodreadsData[0]?.goodreadsBook || null;

    // Apply priority-based merging for each field
    // For scalar fields, use the helper. For relations, we need special handling.

    // Title - always required, fallback to embedded.
    // resolveExternalTitle normalizes legacy combined "Title: Subtitle" values
    // against the embedded title/subtitle so the subtitle line below doesn't
    // duplicate text already baked into the resolved title.
    const resolvedTitle =
      this.resolveFieldByPriority(
        'title',
        {
          manual: ab.title,
          embedded: ab.title,
          hardcover: resolveExternalTitle(
            hc?.title,
            hc?.subtitle,
            ab.title,
            ab.subtitle,
          ),
          goodreads: resolveExternalTitle(
            gr?.title,
            gr?.subtitle,
            ab.title,
            ab.subtitle,
          ),
        },
        metadataPriority.title,
        manualFields,
      ) || ab.title;

    // Subtitle. External sources populate this when their incoming title has
    // the form `"Title: Subtitle"` — see splitTitleSubtitle in title.utils.
    const resolvedSubtitle = this.resolveFieldByPriority(
      'subtitle',
      {
        manual: ab.subtitle,
        embedded: ab.subtitle,
        hardcover: hc?.subtitle,
        goodreads: gr?.subtitle,
      },
      metadataPriority.subtitle,
      manualFields,
    );

    // Description
    const resolvedDescription = this.resolveFieldByPriority(
      'description',
      {
        manual: ab.description,
        embedded: ab.description,
        hardcover: hc?.description,
        goodreads: gr?.description,
      },
      metadataPriority.description,
      manualFields,
    );

    // Publisher
    const resolvedPublisher = this.resolveFieldByPriority(
      'publisher',
      {
        manual: ab.publisher,
        embedded: ab.publisher,
        hardcover: null,
        goodreads: null,
      },
      metadataPriority.publisher,
      manualFields,
    );

    // Published Date
    const resolvedPublishedDate = this.resolveFieldByPriority(
      'publishedDate',
      {
        manual: ab.publishedDate,
        embedded: ab.publishedDate,
        hardcover: null,
        goodreads: null,
      },
      metadataPriority.publishedDate,
      manualFields,
    );

    // Language
    const resolvedLanguage = this.resolveFieldByPriority(
      'language',
      {
        manual: ab.language,
        embedded: ab.language,
        hardcover: null,
        goodreads: null,
      },
      metadataPriority.language,
      manualFields,
    );

    // Authors - need to handle as array of names
    const embeddedAuthorNames = authors.map((a) => a.name);
    const hardcoverAuthorNames = hc?.authorNames || [];
    const goodreadsAuthorNames = splitPersonNames(gr?.author);
    const resolvedAuthorNames =
      this.resolveFieldByPriority(
        'author',
        {
          manual: embeddedAuthorNames,
          embedded: embeddedAuthorNames,
          hardcover: hardcoverAuthorNames,
          goodreads: goodreadsAuthorNames,
        },
        metadataPriority.author,
        manualFields,
      ) || embeddedAuthorNames;

    // If hardcover or goodreads authors win, we need to create virtual author objects
    const resolvedAuthors =
      resolvedAuthorNames === hardcoverAuthorNames && hc
        ? hardcoverAuthorNames.map((name, idx) => ({
            id: `hc-author-${idx}`,
            name,
            imageUrl: null,
          }))
        : resolvedAuthorNames === goodreadsAuthorNames && gr
          ? goodreadsAuthorNames.map((name, idx) => ({
              id: `gr-author-${idx}`,
              name,
              imageUrl: null,
            }))
          : authors;

    // Genres - keep audiobook genres separate from Hardcover/Goodreads genres
    // Audiobook genres come from embedded metadata or manual edits only
    // Hardcover/Goodreads genres are returned separately in their respective objects
    const resolvedGenres = genres;

    // Series - Hardcover provides featured series, Goodreads doesn't have series
    const embeddedSeriesNames = seriesData.map((s) => s.name);
    const hardcoverSeriesName = hc?.featuredSeriesName
      ? [hc.featuredSeriesName]
      : [];
    const resolvedSeriesNames =
      this.resolveFieldByPriority(
        'series',
        {
          manual: embeddedSeriesNames,
          embedded: embeddedSeriesNames,
          hardcover: hardcoverSeriesName,
          goodreads: [],
        },
        metadataPriority.series,
        manualFields,
      ) || embeddedSeriesNames;

    // If hardcover series wins, create virtual series object
    const resolvedSeries =
      resolvedSeriesNames === hardcoverSeriesName && hc?.featuredSeriesName
        ? [
            {
              id: `hc-series-0`,
              name: hc.featuredSeriesName,
              order: hc.featuredSeriesPosition || '0',
            },
          ]
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
      hardcover: hc
        ? {
            id: hc.hardcoverId,
            slug: hc.slug,
            rating: hc.rating ? parseFloat(hc.rating) : null,
            ratingsCount: hc.ratingsCount,
            imageUrl: hc.imageUrl,
            genres: hc.genres,
            moods: hc.moods,
            contentWarnings: hc.contentWarnings,
          }
        : null,
      // Include goodreads data for display (separate from audiobook data)
      goodreads: gr
        ? {
            id: gr.goodreadsId,
            url: gr.url,
            rating: gr.rating ? parseFloat(gr.rating) : null,
            ratingsCount: gr.ratingsCount,
            coverUrl: gr.coverUrl,
            genres: gr.genres,
            description: gr.description,
          }
        : null,
    };
  }

  private getCoverUrl(
    id: string,
    coverUrl: string | null,
    coverSource: 'embedded' | 'uploaded' | 'filesystem' | 'folder_image' | null,
  ): string | null {
    return this.coverService.getCoverUrl(
      id,
      coverUrl,
      coverSource,
      'audiobooks',
    );
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

    // If cover was uploaded, read from app data directory
    if (coverSource === 'uploaded' && coverUrl) {
      try {
        const coverPath = this.appDataService.getAudiobookCoverPath(id);
        const data = await fs.readFile(coverPath);
        // Uploaded covers are always saved as JPEG
        return { data, mimeType: 'image/jpeg' };
      } catch {
        // Fall through to try embedded
      }
    }

    // Try to extract embedded cover from the first audio file
    if (coverSource === 'embedded') {
      const coverPath = this.appDataService.getAudiobookCoverPath(id);

      // Check if a cached version exists on disk
      try {
        const data = await fs.readFile(coverPath);
        return { data, mimeType: 'image/jpeg' };
      } catch {
        // Not cached yet, extract from file
      }

      // Get the first audio file for this audiobook
      const files = await this.db
        .select({ filePath: schema.audiobookFiles.filePath })
        .from(schema.audiobookFiles)
        .where(eq(schema.audiobookFiles.audiobookId, id))
        .orderBy(asc(schema.audiobookFiles.order))
        .limit(1);

      if (files.length > 0) {
        // Path construction: audiobook.filePath (folder) + file.filePath (filename)
        // For root-level files, filePath is empty string
        const absoluteFilePath = await this.resolveFilePath(
          path.join(filePath, files[0].filePath),
        );
        const result =
          await this.metadataProvider.extractCover(absoluteFilePath);

        // Cache to disk for future requests
        if (result) {
          fs.writeFile(coverPath, result.data).catch(() => {});
        }

        return result;
      }
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

    // Update series if provided
    if (dto.series !== undefined) {
      await this.updateSeries(id, dto.series);
      newManualFields.add('series');
    }

    // Update manualFields for relation changes (if not already updated above)
    const relationFieldsChanged =
      dto.authorNames !== undefined ||
      dto.narratorNames !== undefined ||
      dto.genreNames !== undefined ||
      dto.series !== undefined;

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
    relationTable:
      | typeof schema.audiobookAuthors
      | typeof schema.audiobookNarrators,
  ) {
    // Delete existing relations
    await this.db
      .delete(relationTable)
      .where(eq(relationTable.audiobookId, audiobookId));

    const normalizedNames = splitPersonNames(names);

    // Create new relations
    for (let i = 0; i < normalizedNames.length; i++) {
      const name = normalizedNames[i];
      if (!name) continue;

      // Find or create person using upsert to handle race conditions
      const [person] = await this.db
        .insert(schema.people)
        .values({ name })
        .onConflictDoUpdate({
          target: schema.people.name,
          set: { name }, // No-op update to get the existing row
        })
        .returning();

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

      // Find or create genre (case-insensitive)
      let [genre] = await this.db
        .select()
        .from(schema.genres)
        .where(sql`LOWER(${schema.genres.name}) = LOWER(${trimmedName})`)
        .limit(1);

      if (!genre) {
        const result = await this.db
          .insert(schema.genres)
          .values({ name: trimmedName })
          .onConflictDoNothing()
          .returning();
        if (result.length > 0) {
          genre = result[0];
        } else {
          [genre] = await this.db
            .select()
            .from(schema.genres)
            .where(sql`LOWER(${schema.genres.name}) = LOWER(${trimmedName})`)
            .limit(1);
        }
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

      // Find or create tag (case-insensitive)
      let [tag] = await this.db
        .select()
        .from(schema.tags)
        .where(sql`LOWER(${schema.tags.name}) = LOWER(${trimmedName})`)
        .limit(1);

      if (!tag) {
        const result = await this.db
          .insert(schema.tags)
          .values({ name: trimmedName })
          .onConflictDoNothing()
          .returning();
        if (result.length > 0) {
          tag = result[0];
        } else {
          [tag] = await this.db
            .select()
            .from(schema.tags)
            .where(sql`LOWER(${schema.tags.name}) = LOWER(${trimmedName})`)
            .limit(1);
        }
      }

      // Create relation
      await this.db.insert(schema.audiobookTags).values({
        audiobookId,
        tagId: tag.id,
      });
    }
  }

  private async updateSeries(
    audiobookId: string,
    seriesEntries: SeriesEntryDto[],
  ) {
    // Delete existing relations
    await this.db
      .delete(schema.audiobookSeries)
      .where(eq(schema.audiobookSeries.audiobookId, audiobookId));

    // Create new relations
    for (const entry of seriesEntries) {
      const name = entry.seriesName.trim();
      if (!name) continue;

      // Find or create series
      let [seriesRecord] = await this.db
        .select()
        .from(schema.series)
        .where(eq(schema.series.name, name))
        .limit(1);

      if (!seriesRecord) {
        [seriesRecord] = await this.db
          .insert(schema.series)
          .values({ name })
          .returning();
      }

      // Create relation with order
      await this.db.insert(schema.audiobookSeries).values({
        audiobookId,
        seriesId: seriesRecord.id,
        order: entry.order,
      });
    }

    await this.deleteOrphanedSeries();
  }

  private async deleteOrphanedSeries() {
    await this.db.delete(schema.series).where(
      and(
        notExists(
          this.db
            .select({ one: sql`1` })
            .from(schema.audiobookSeries)
            .where(eq(schema.audiobookSeries.seriesId, schema.series.id)),
        ),
        notExists(
          this.db
            .select({ one: sql`1` })
            .from(ebookSchema.ebookSeries)
            .where(eq(ebookSchema.ebookSeries.seriesId, schema.series.id)),
        ),
      ),
    );
  }

  async getGenres(
    search?: string,
    limit?: number,
  ): Promise<{ id: string; name: string; count: number }[]> {
    const conditions: SQL[] = [];

    if (search) {
      conditions.push(ilike(schema.genres.name, `%${search}%`));
    }

    // Only return genres that have at least one audiobook
    const baseQuery = this.db
      .select({
        id: schema.genres.id,
        name: schema.genres.name,
        count: sql<number>`count(${schema.audiobookGenres.audiobookId})::int`,
      })
      .from(schema.genres)
      .innerJoin(
        schema.audiobookGenres,
        eq(schema.genres.id, schema.audiobookGenres.genreId),
      )
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(schema.genres.id, schema.genres.name)
      .orderBy(asc(schema.genres.name));

    return limit !== undefined ? baseQuery.limit(limit) : baseQuery;
  }

  async getTags(
    search?: string,
    limit?: number,
  ): Promise<{ id: string; name: string }[]> {
    const conditions: SQL[] = [];

    if (search) {
      conditions.push(ilike(schema.tags.name, `%${search}%`));
    }

    const baseQuery = this.db
      .select({
        id: schema.tags.id,
        name: schema.tags.name,
      })
      .from(schema.tags)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(schema.tags.name));

    return limit !== undefined ? baseQuery.limit(limit) : baseQuery;
  }

  async getSeries(
    search?: string,
    limit?: number,
  ): Promise<{ id: string; name: string }[]> {
    const conditions: SQL[] = [];

    if (search) {
      conditions.push(ilike(schema.series.name, `%${search}%`));
    }

    const baseQuery = this.db
      .select({
        id: schema.series.id,
        name: schema.series.name,
      })
      .from(schema.series)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(schema.series.name));

    return limit !== undefined ? baseQuery.limit(limit) : baseQuery;
  }

  async getPublishers(search?: string, limit?: number): Promise<string[]> {
    const conditions: SQL[] = [];

    // Only get non-null publishers
    conditions.push(isNotNull(schema.audiobooks.publisher));

    if (search) {
      conditions.push(ilike(schema.audiobooks.publisher, `%${search}%`));
    }

    const baseQuery = this.db
      .selectDistinct({
        publisher: schema.audiobooks.publisher,
      })
      .from(schema.audiobooks)
      .where(and(...conditions))
      .orderBy(asc(schema.audiobooks.publisher));

    const publishers =
      limit !== undefined ? await baseQuery.limit(limit) : await baseQuery;

    return publishers.map((p) => p.publisher!);
  }

  async getAuthors(
    search?: string,
    limit?: number,
  ): Promise<{ id: string; name: string }[]> {
    const conditions: SQL[] = [];

    if (search) {
      conditions.push(ilike(schema.people.name, `%${search}%`));
    }

    // Get people who are authors (linked via audiobookAuthors)
    const baseQuery = this.db
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
      .orderBy(asc(schema.people.name));

    return limit !== undefined ? baseQuery.limit(limit) : baseQuery;
  }

  async getNarrators(
    search?: string,
    limit?: number,
  ): Promise<{ id: string; name: string }[]> {
    const conditions: SQL[] = [];

    if (search) {
      conditions.push(ilike(schema.people.name, `%${search}%`));
    }

    // Get people who are narrators (linked via audiobookNarrators)
    const baseQuery = this.db
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
      .orderBy(asc(schema.people.name));

    return limit !== undefined ? baseQuery.limit(limit) : baseQuery;
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
      // Path construction: audiobook.filePath (folder) + file.filePath (filename)
      // For root-level files, audiobook.filePath is empty string
      const absoluteFilePath = await this.resolveFilePath(
        path.join(audiobook[0].filePath, file.filePath),
      );
      const extractedChapters =
        await this.metadataProvider.extractChapters(absoluteFilePath);

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

  async importExternalChapters(
    id: string,
    asin: string,
    chapters: { title: string; startTime: number; endTime?: number }[],
  ): Promise<{ count: number }> {
    // Verify audiobook exists
    const audiobook = await this.db
      .select()
      .from(schema.audiobooks)
      .where(eq(schema.audiobooks.id, id))
      .limit(1);

    if (audiobook.length === 0) {
      throw new NotFoundException('Audiobook not found');
    }

    // Delete existing chapters
    await this.db
      .delete(schema.chapters)
      .where(eq(schema.chapters.audiobookId, id));

    // Insert new chapters with source 'external'
    if (chapters.length > 0) {
      await this.db.insert(schema.chapters).values(
        chapters.map((chap, index) => ({
          audiobookId: id,
          title: chap.title,
          startTime: chap.startTime,
          endTime: chap.endTime ?? null,
          order: index + 1,
          source: 'external' as const,
        })),
      );
    }

    // Update the audiobook's ASIN for future re-fetching
    await this.db
      .update(schema.audiobooks)
      .set({
        asin: asin.toUpperCase(),
        manualFields: [...(audiobook[0].manualFields || []), 'asin'].filter(
          (v, i, a) => a.indexOf(v) === i,
        ),
      })
      .where(eq(schema.audiobooks.id, id));

    return { count: chapters.length };
  }

  async updateCoverFromFile(
    id: string,
    buffer: Buffer,
  ): Promise<{ coverUrl: string }> {
    return this.coverService.updateCoverFromFile(
      buffer,
      this.getCoverConfig(id),
    );
  }

  async updateCoverFromUrl(
    id: string,
    url: string,
  ): Promise<{ coverUrl: string }> {
    return this.coverService.updateCoverFromUrl(url, this.getCoverConfig(id));
  }

  private getCoverConfig(id: string) {
    return {
      entityId: id,
      apiPath: 'audiobooks',
      getCoverPath: (entityId: string) =>
        this.appDataService.getAudiobookCoverPath(entityId),
      verifyExists: async (entityId: string) => {
        const audiobook = await this.db
          .select({ id: schema.audiobooks.id })
          .from(schema.audiobooks)
          .where(eq(schema.audiobooks.id, entityId))
          .limit(1);
        if (audiobook.length === 0) {
          throw new NotFoundException('Audiobook not found');
        }
      },
      updateCoverMetadata: async (entityId: string, coverUrl: string) => {
        await this.db
          .update(schema.audiobooks)
          .set({ coverUrl, coverSource: 'uploaded' })
          .where(eq(schema.audiobooks.id, entityId));
      },
      emitUpdateEvent: (entityId: string) => {
        this.appEvents.audiobookUpdated(entityId);
      },
    };
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
          if (filePath === '') {
            // Root-level audiobook: delete individual files
            const files = await this.db
              .select({ filePath: schema.audiobookFiles.filePath })
              .from(schema.audiobookFiles)
              .where(eq(schema.audiobookFiles.audiobookId, id));

            for (const file of files) {
              const absoluteFilePath = await this.resolveFilePath(
                file.filePath,
              );
              try {
                await fs.unlink(absoluteFilePath);
              } catch {
                // Continue deleting other files if one fails
              }
            }
          } else {
            // Folder-based audiobook: delete entire directory
            const absolutePath = await this.resolveFilePath(filePath);
            await fs.rm(absolutePath, { recursive: true, force: true });
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
      await this.deleteOrphanedSeries();

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

    // Check if cover is uploaded (stored in app data)
    const hasUploadedCover = ab.coverSource === 'uploaded';

    // Resolve cover path if uploaded
    let coverPath: string | undefined;
    if (hasUploadedCover && ab.coverUrl) {
      try {
        coverPath = this.appDataService.getAudiobookCoverPath(ab.id);
        // Verify file exists
        await fs.access(coverPath);
      } catch {
        coverPath = undefined; // Cover file not found, skip it
      }
    }

    // Single file with embedded cover - direct download
    if (files.length === 1 && !hasUploadedCover) {
      const file = files[0];
      // Path construction: libraryPath + audiobook.filePath (folder) + file.filePath (filename)
      // For root-level files, ab.filePath is empty string
      const absolutePath = await this.resolveFilePath(
        path.join(ab.filePath, file.filePath),
      );

      const mimeTypes: Record<string, string> = {
        mp3: 'audio/mpeg',
        m4a: 'audio/mp4',
        m4b: 'audio/mp4',
        ogg: 'audio/ogg',
        opus: 'audio/ogg',
        flac: 'audio/flac',
        wav: 'audio/wav',
        aac: 'audio/aac',
      };
      const ext = path.extname(file.filePath).toLowerCase().replace(/^\./, '');
      // Same precedence as the stream endpoint: trust metadata-derived
      // format over the disk extension so a mislabelled file still serves
      // the right Content-Type.
      const mimeType =
        this.mimeTypeForFormat(file.format) ??
        mimeTypes[ext] ??
        'application/octet-stream';

      return {
        isZip: false,
        filePath: absolutePath,
        fileName: file.fileName,
        mimeType,
        fileSize: file.sizeBytes,
      };
    }

    // Multiple files OR separate cover - ZIP download
    // Sanitize title for filename
    const sanitizedTitle = ab.title
      // eslint-disable-next-line no-control-regex
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '') // Remove invalid filename chars
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .substring(0, 200); // Limit length

    return {
      isZip: true,
      files: await Promise.all(
        files.map(async (f) => ({
          // Build the correct relative path (multi-file: folder + fileName)
          filePath: await this.resolveFilePath(
            path.join(ab.filePath, f.fileName),
          ),
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
    // Get audiobook to check if it's a single-file audiobook
    const audiobook = await this.db
      .select({ filePath: schema.audiobooks.filePath })
      .from(schema.audiobooks)
      .where(eq(schema.audiobooks.id, id))
      .limit(1);

    if (audiobook.length === 0) {
      throw new NotFoundException('Audiobook not found');
    }

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
    const clampedPosition = Math.max(
      0,
      Math.min(positionSeconds, totalDuration),
    );

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

    // Path construction: libraryPath + audiobook.filePath (folder) + file.filePath (filename)
    // For root-level files, audiobook.filePath is empty string
    const absolutePath = await this.resolveFilePath(
      path.join(audiobook[0].filePath, targetFile.filePath),
    );

    // Determine MIME type. The `format` column is populated from the metadata
    // library and is a human-readable string ("MPEG-4", "Ogg", "MPEG 1 Layer
    // 3", etc.) — it doesn't match keys like "m4b" reliably. Prefer the file
    // extension, which is deterministic, and fall back to format only when no
    // extension is present.
    const mimeTypes: Record<string, string> = {
      mp3: 'audio/mpeg',
      m4a: 'audio/mp4',
      m4b: 'audio/mp4',
      ogg: 'audio/ogg',
      opus: 'audio/ogg',
      flac: 'audio/flac',
      wav: 'audio/wav',
      aac: 'audio/aac',
    };
    const ext = path
      .extname(targetFile.filePath)
      .toLowerCase()
      .replace(/^\./, '');
    // Prefer format-derived mime when the extension lookup misses or might
    // be misleading (e.g. a file mislabelled `.ogg` whose actual container
    // is MPEG-4). iOS's local-file decoder picks codec from the extension,
    // so a wrong Content-Type here cascades into broken downloaded files.
    const mimeType =
      this.mimeTypeForFormat(targetFile.format) ??
      mimeTypes[ext] ??
      'application/octet-stream';

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

  /**
   * Normalises the `format` value returned by the metadata library
   * (e.g. "MPEG-4", "Ogg", "MPEG 1 Layer 3") to an HTTP mime type. Returns
   * undefined when the format string is empty or unrecognised so callers
   * can fall back to extension-based lookup.
   */
  private mimeTypeForFormat(
    format: string | null | undefined,
  ): string | undefined {
    if (!format) return undefined;
    const f = format.toLowerCase().trim();
    if (!f) return undefined;
    if (
      f.startsWith('mpeg-4') ||
      f.startsWith('mpeg 4') ||
      f === 'mp4' ||
      f === 'm4a' ||
      f === 'm4b' ||
      f.includes('mp4')
    ) {
      return 'audio/mp4';
    }
    if (f === 'aac' || f.includes('aac')) return 'audio/aac';
    if (
      f === 'mp3' ||
      f.includes('mpeg 1 layer 3') ||
      f.includes('mpeg-1 layer 3') ||
      (f.startsWith('mpeg') && f.includes('layer 3'))
    ) {
      return 'audio/mpeg';
    }
    if (f === 'flac' || f.includes('flac')) return 'audio/flac';
    if (f === 'wav' || f.includes('wave') || f.includes('wav'))
      return 'audio/wav';
    if (f === 'ogg' || f.includes('vorbis') || f.includes('ogg'))
      return 'audio/ogg';
    if (f === 'opus' || f.includes('opus')) return 'audio/ogg';
    return undefined;
  }
}
