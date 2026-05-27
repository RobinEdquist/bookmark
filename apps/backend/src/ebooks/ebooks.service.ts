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
import * as audiobookSchema from '../audiobooks/schema';
import * as hardcoverSchema from '../hardcover/schema';
import * as goodreadsSchema from '../gr-finder/schema';
import * as usersSchema from '../users/schema';
import { UpdateEbookDto, EbookSeriesEntryDto } from './dto/update-ebook.dto';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { MetadataSource, MetadataFieldPriority } from '../app-settings/schema';
import { AppEventsService } from '../events/app-events.service';
import { AppDataService } from '../app-data/app-data.service';
import { EbookMetadataProvider } from '../library-watcher/metadata/ebook-metadata.provider';
import { splitPersonNames } from '../common/utils/name.utils';
import { stripDuplicateSubtitle } from '../common/utils/title.utils';

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
  goodreadsLinked: boolean;
  goodreadsRating: number | null;
  goodreadsRatingsCount: number | null;
}

export interface EbookFilters {
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
export class EbooksService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: NodePgDatabase<typeof schema>,
    private appSettingsService: AppSettingsService,
    private appEvents: AppEventsService,
    private appDataService: AppDataService,
    private ebookMetadataProvider: EbookMetadataProvider,
    private coverService: CoverService,
  ) {}

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
   * Convert a relative file path (stored in DB) to an absolute path using the ebook library path
   */
  private async resolveFilePath(relativePath: string): Promise<string> {
    const ebookLibraryPath =
      await this.appSettingsService.getEbookLibraryPath();
    if (!ebookLibraryPath) {
      throw new Error('Ebook library path not configured');
    }
    return path.join(ebookLibraryPath, relativePath);
  }

  /**
   * Check if an ebook has any tags that are blacklisted for the given user.
   * Returns true if the ebook should be hidden from this user.
   */
  async hasBlacklistedTags(ebookId: string, userId: string): Promise<boolean> {
    const result = await this.db
      .select({ one: sql`1` })
      .from(schema.ebookTags)
      .innerJoin(
        usersSchema.userBlacklistedTags,
        and(
          eq(schema.ebookTags.tagId, usersSchema.userBlacklistedTags.tagId),
          eq(usersSchema.userBlacklistedTags.userId, userId),
        ),
      )
      .where(eq(schema.ebookTags.ebookId, ebookId))
      .limit(1);

    return result.length > 0;
  }

  /**
   * Verify that the user can access this ebook (not blacklisted).
   * Throws ForbiddenException if the ebook has blacklisted tags for this user.
   */
  async verifyNotBlacklisted(ebookId: string, userId: string): Promise<void> {
    const isBlacklisted = await this.hasBlacklistedTags(ebookId, userId);
    if (isBlacklisted) {
      throw new ForbiddenException('Access denied');
    }
  }

  async findAll(
    filters: EbookFilters = {},
    userId?: string,
  ): Promise<{ ebooks: EbookListItem[]; total: number }> {
    const {
      search,
      genreId,
      language,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      limit,
      offset = 0,
    } = filters;

    // Build where conditions
    const conditions: SQL[] = [];

    // Always exclude hidden ebooks
    conditions.push(ne(schema.ebooks.status, 'hidden'));

    // Exclude ebooks with blacklisted tags for this user
    if (userId) {
      const blacklistedTagsFilter = notExists(
        this.db
          .select({ one: sql`1` })
          .from(schema.ebookTags)
          .innerJoin(
            usersSchema.userBlacklistedTags,
            and(
              eq(schema.ebookTags.tagId, usersSchema.userBlacklistedTags.tagId),
              eq(usersSchema.userBlacklistedTags.userId, userId),
            ),
          )
          .where(eq(schema.ebookTags.ebookId, schema.ebooks.id)),
      );
      conditions.push(blacklistedTagsFilter);
    }

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
          .innerJoin(
            audiobookSchema.people,
            eq(schema.ebookAuthors.personId, audiobookSchema.people.id),
          )
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
          .innerJoin(
            audiobookSchema.series,
            eq(schema.ebookSeries.seriesId, audiobookSchema.series.id),
          )
          .where(
            and(
              eq(schema.ebookSeries.ebookId, schema.ebooks.id),
              ilike(audiobookSchema.series.name, searchPattern),
            ),
          ),
      );

      // Search in linked Goodreads book (title and author)
      const goodreadsMatch = exists(
        this.db
          .select({ one: sql`1` })
          .from(goodreadsSchema.goodreadsEbookLinks)
          .innerJoin(
            goodreadsSchema.goodreadsBooks,
            eq(
              goodreadsSchema.goodreadsEbookLinks.goodreadsBookId,
              goodreadsSchema.goodreadsBooks.id,
            ),
          )
          .where(
            and(
              eq(goodreadsSchema.goodreadsEbookLinks.ebookId, schema.ebooks.id),
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
          .from(hardcoverSchema.hardcoverEbookLinks)
          .innerJoin(
            hardcoverSchema.hardcoverBooks,
            eq(
              hardcoverSchema.hardcoverEbookLinks.hardcoverBookId,
              hardcoverSchema.hardcoverBooks.id,
            ),
          )
          .where(
            and(
              eq(hardcoverSchema.hardcoverEbookLinks.ebookId, schema.ebooks.id),
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
      conditions.push(eq(schema.ebooks.language, language));
    }

    // Filter by genre using the ebookGenres junction table
    if (genreId) {
      const genreFilter = exists(
        this.db
          .select({ one: sql`1` })
          .from(schema.ebookGenres)
          .where(
            and(
              eq(schema.ebookGenres.ebookId, schema.ebooks.id),
              eq(schema.ebookGenres.genreId, genreId),
            ),
          ),
      );
      conditions.push(genreFilter);
    }

    // Base query for ebooks
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const countResult = await this.db
      .select({ count: schema.ebooks.id })
      .from(schema.ebooks)
      .where(whereClause);
    const total = countResult.length;

    // Build order by clause based on sortBy
    let orderByClause: SQL;

    switch (sortBy) {
      case 'title':
        orderByClause =
          sortOrder === 'asc'
            ? asc(schema.ebooks.title)
            : desc(schema.ebooks.title);
        break;
      case 'createdAt':
        orderByClause =
          sortOrder === 'asc'
            ? asc(schema.ebooks.createdAt)
            : desc(schema.ebooks.createdAt);
        break;
      case 'author':
      case 'rating':
      case 'series':
        // These require post-processing, use createdAt as initial order
        orderByClause =
          sortOrder === 'asc'
            ? asc(schema.ebooks.createdAt)
            : desc(schema.ebooks.createdAt);
        break;
      default:
        orderByClause = desc(schema.ebooks.createdAt);
    }

    const baseQuery = this.db
      .select()
      .from(schema.ebooks)
      .where(whereClause)
      .orderBy(orderByClause);

    const ebooks =
      limit !== undefined
        ? await baseQuery.limit(limit).offset(offset)
        : await baseQuery;

    // Get all ebook IDs for batch fetching
    const ebookIds = ebooks.map((eb) => eb.id);

    // Batch fetch all related data in parallel
    const [
      hardcoverLinks,
      goodreadsLinks,
      allAuthors,
      allSeriesData,
      metadataPriority,
    ] = await Promise.all([
      // Hardcover data (full book info for title resolution)
      ebookIds.length > 0
        ? this.db
            .select({
              ebookId: hardcoverSchema.hardcoverEbookLinks.ebookId,
              hardcoverBook: hardcoverSchema.hardcoverBooks,
            })
            .from(hardcoverSchema.hardcoverEbookLinks)
            .innerJoin(
              hardcoverSchema.hardcoverBooks,
              eq(
                hardcoverSchema.hardcoverEbookLinks.hardcoverBookId,
                hardcoverSchema.hardcoverBooks.id,
              ),
            )
            .where(
              inArray(hardcoverSchema.hardcoverEbookLinks.ebookId, ebookIds),
            )
        : [],
      // Goodreads data (full book info for title resolution)
      ebookIds.length > 0
        ? this.db
            .select({
              ebookId: goodreadsSchema.goodreadsEbookLinks.ebookId,
              goodreadsBook: goodreadsSchema.goodreadsBooks,
            })
            .from(goodreadsSchema.goodreadsEbookLinks)
            .innerJoin(
              goodreadsSchema.goodreadsBooks,
              eq(
                goodreadsSchema.goodreadsEbookLinks.goodreadsBookId,
                goodreadsSchema.goodreadsBooks.id,
              ),
            )
            .where(
              inArray(goodreadsSchema.goodreadsEbookLinks.ebookId, ebookIds),
            )
        : [],
      // Authors for all ebooks
      ebookIds.length > 0
        ? this.db
            .select({
              ebookId: schema.ebookAuthors.ebookId,
              personId: audiobookSchema.people.id,
              personName: audiobookSchema.people.name,
              order: schema.ebookAuthors.order,
            })
            .from(schema.ebookAuthors)
            .innerJoin(
              audiobookSchema.people,
              eq(schema.ebookAuthors.personId, audiobookSchema.people.id),
            )
            .where(inArray(schema.ebookAuthors.ebookId, ebookIds))
            .orderBy(
              asc(schema.ebookAuthors.ebookId),
              asc(schema.ebookAuthors.order),
            )
        : [],
      // Series for all ebooks
      ebookIds.length > 0
        ? this.db
            .select({
              ebookId: schema.ebookSeries.ebookId,
              seriesId: audiobookSchema.series.id,
              seriesName: audiobookSchema.series.name,
              order: schema.ebookSeries.order,
            })
            .from(schema.ebookSeries)
            .innerJoin(
              audiobookSchema.series,
              eq(schema.ebookSeries.seriesId, audiobookSchema.series.id),
            )
            .where(inArray(schema.ebookSeries.ebookId, ebookIds))
        : [],
      // Metadata priority settings
      this.appSettingsService.getMetadataPriority(),
    ]);

    // Build lookup maps for O(1) access
    type HardcoverBook = typeof hardcoverSchema.hardcoverBooks.$inferSelect;
    const hardcoverDataMap = new Map<string, HardcoverBook>(
      hardcoverLinks.map(
        (l) => [l.ebookId, l.hardcoverBook] as [string, HardcoverBook],
      ),
    );

    type GoodreadsBook = typeof goodreadsSchema.goodreadsBooks.$inferSelect;
    const goodreadsDataMap = new Map<string, GoodreadsBook>(
      goodreadsLinks.map(
        (l) => [l.ebookId, l.goodreadsBook] as [string, GoodreadsBook],
      ),
    );

    // Group authors by ebook ID
    const authorsMap = new Map<string, { id: string; name: string }[]>();
    for (const author of allAuthors) {
      const existing = authorsMap.get(author.ebookId) || [];
      existing.push({ id: author.personId, name: author.personName });
      authorsMap.set(author.ebookId, existing);
    }

    // Group series by ebook ID
    const seriesMap = new Map<
      string,
      { id: string; name: string; order: string }[]
    >();
    for (const s of allSeriesData) {
      const existing = seriesMap.get(s.ebookId) || [];
      existing.push({ id: s.seriesId, name: s.seriesName, order: s.order });
      seriesMap.set(s.ebookId, existing);
    }

    // Map ebooks to list items (no async needed now)
    const result: EbookListItem[] = ebooks.map((eb) => {
      const manualFields = (eb.manualFields as string[]) || [];
      const authors = authorsMap.get(eb.id) || [];
      const seriesData = seriesMap.get(eb.id) || [];
      const hc = hardcoverDataMap.get(eb.id) || null;
      const gr = goodreadsDataMap.get(eb.id) || null;

      // Apply priority-based resolution for title.
      // Hardcover/Goodreads store the full "Title: Subtitle" in one field, so
      // strip the embedded subtitle off those external titles before resolving
      // — otherwise the subtitle would render twice (once inline in the title,
      // once on the dedicated subtitle line).
      const resolvedTitle =
        this.resolveFieldByPriority(
          'title',
          {
            manual: eb.title,
            embedded: eb.title,
            hardcover: stripDuplicateSubtitle(hc?.title, eb.subtitle),
            goodreads: stripDuplicateSubtitle(gr?.title, eb.subtitle),
          },
          metadataPriority.title,
          manualFields,
        ) || eb.title;

      // Apply priority-based resolution for subtitle.
      // External sources populate `subtitle` when their incoming title has the
      // form `"Title: Subtitle"` — see splitTitleSubtitle in title.utils.
      const resolvedSubtitle = this.resolveFieldByPriority(
        'subtitle',
        {
          manual: eb.subtitle,
          embedded: eb.subtitle,
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
        id: eb.id,
        title: resolvedTitle,
        subtitle: resolvedSubtitle,
        pageCount: eb.pageCount,
        coverUrl: this.getCoverUrl(eb.id, eb.coverUrl, eb.coverSource),
        createdAt: eb.createdAt,
        status: eb.status as 'available' | 'missing' | 'importing',
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

    // Apply client-side sorting for author, rating, and series
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

    // Fetch all related data including Hardcover, Goodreads, and metadata priority
    const [
      authors,
      seriesData,
      genres,
      tags,
      hardcoverData,
      goodreadsData,
      metadataPriority,
    ] = await Promise.all([
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
        .select({
          id: audiobookSchema.genres.id,
          name: audiobookSchema.genres.name,
        })
        .from(schema.ebookGenres)
        .innerJoin(
          audiobookSchema.genres,
          eq(schema.ebookGenres.genreId, audiobookSchema.genres.id),
        )
        .where(eq(schema.ebookGenres.ebookId, id)),
      this.db
        .select({
          id: audiobookSchema.tags.id,
          name: audiobookSchema.tags.name,
        })
        .from(schema.ebookTags)
        .innerJoin(
          audiobookSchema.tags,
          eq(schema.ebookTags.tagId, audiobookSchema.tags.id),
        )
        .where(eq(schema.ebookTags.ebookId, id)),
      this.db
        .select({
          hardcoverBook: hardcoverSchema.hardcoverBooks,
        })
        .from(hardcoverSchema.hardcoverEbookLinks)
        .innerJoin(
          hardcoverSchema.hardcoverBooks,
          eq(
            hardcoverSchema.hardcoverEbookLinks.hardcoverBookId,
            hardcoverSchema.hardcoverBooks.id,
          ),
        )
        .where(eq(hardcoverSchema.hardcoverEbookLinks.ebookId, id))
        .limit(1),
      this.db
        .select({
          goodreadsBook: goodreadsSchema.goodreadsBooks,
        })
        .from(goodreadsSchema.goodreadsEbookLinks)
        .innerJoin(
          goodreadsSchema.goodreadsBooks,
          eq(
            goodreadsSchema.goodreadsEbookLinks.goodreadsBookId,
            goodreadsSchema.goodreadsBooks.id,
          ),
        )
        .where(eq(goodreadsSchema.goodreadsEbookLinks.ebookId, id))
        .limit(1),
      this.appSettingsService.getMetadataPriority(),
    ]);

    const hc = hardcoverData[0]?.hardcoverBook || null;
    const gr = goodreadsData[0]?.goodreadsBook || null;
    const manualFields = (eb.manualFields as string[]) || [];

    // Resolve description using configured metadata priority
    const resolvedDescription = this.resolveFieldByPriority(
      'description',
      {
        manual: eb.description,
        embedded: eb.description,
        hardcover: hc?.description,
        goodreads: gr?.description,
      },
      metadataPriority.description,
      manualFields,
    );

    return {
      ...eb,
      description: resolvedDescription,
      coverUrl: this.getCoverUrl(eb.id, eb.coverUrl, eb.coverSource),
      authors,
      series: seriesData,
      genres,
      tags,
      // Include hardcover data for display
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
      // Include goodreads data for display
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
    coverSource: 'embedded' | 'uploaded' | 'filesystem' | null,
  ): string | null {
    return this.coverService.getCoverUrl(id, coverUrl, coverSource, 'ebooks');
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

    // If cover was uploaded, read from app data directory
    if (coverSource === 'uploaded' && coverUrl) {
      try {
        const coverPath = this.appDataService.getEbookCoverPath(id);
        const data = await fs.readFile(coverPath);
        // Uploaded covers are always saved as JPEG
        return { data, mimeType: 'image/jpeg' };
      } catch {
        // Fall through to try embedded
      }
    }

    // Try to extract embedded cover from the EPUB
    if (coverSource === 'embedded') {
      const coverPath = this.appDataService.getEbookCoverPath(id);

      // Check if a cached version exists on disk
      try {
        const data = await fs.readFile(coverPath);
        return { data, mimeType: 'image/jpeg' };
      } catch {
        // Not cached yet, extract from file
      }

      try {
        const absolutePath = await this.resolveFilePath(filePath);
        const result =
          await this.ebookMetadataProvider.extractCoverFromFile(absolutePath);

        // Cache to disk for future requests
        if (result) {
          fs.writeFile(coverPath, result.data).catch(() => {});
        }

        return result;
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

    // Update series if provided
    if (dto.series !== undefined) {
      await this.updateSeries(id, dto.series);
      newManualFields.add('series');
    }

    // Update manualFields for relation changes (if not already updated above)
    const relationFieldsChanged =
      dto.authorNames !== undefined ||
      dto.genreNames !== undefined ||
      dto.series !== undefined;

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

    const normalizedNames = splitPersonNames(names);

    // Create new relations
    for (let i = 0; i < normalizedNames.length; i++) {
      const name = normalizedNames[i];
      if (!name) continue;

      // Find or create person using upsert to handle race conditions
      const [person] = await this.db
        .insert(audiobookSchema.people)
        .values({ name })
        .onConflictDoUpdate({
          target: audiobookSchema.people.name,
          set: { name }, // No-op update to get the existing row
        })
        .returning();

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

      // Find or create genre (case-insensitive)
      let [genre] = await this.db
        .select()
        .from(audiobookSchema.genres)
        .where(
          sql`LOWER(${audiobookSchema.genres.name}) = LOWER(${trimmedName})`,
        )
        .limit(1);

      if (!genre) {
        const result = await this.db
          .insert(audiobookSchema.genres)
          .values({ name: trimmedName })
          .onConflictDoNothing()
          .returning();
        if (result.length > 0) {
          genre = result[0];
        } else {
          [genre] = await this.db
            .select()
            .from(audiobookSchema.genres)
            .where(
              sql`LOWER(${audiobookSchema.genres.name}) = LOWER(${trimmedName})`,
            )
            .limit(1);
        }
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

      // Find or create tag (case-insensitive)
      let [tag] = await this.db
        .select()
        .from(audiobookSchema.tags)
        .where(sql`LOWER(${audiobookSchema.tags.name}) = LOWER(${trimmedName})`)
        .limit(1);

      if (!tag) {
        const result = await this.db
          .insert(audiobookSchema.tags)
          .values({ name: trimmedName })
          .onConflictDoNothing()
          .returning();
        if (result.length > 0) {
          tag = result[0];
        } else {
          [tag] = await this.db
            .select()
            .from(audiobookSchema.tags)
            .where(
              sql`LOWER(${audiobookSchema.tags.name}) = LOWER(${trimmedName})`,
            )
            .limit(1);
        }
      }

      // Create relation
      await this.db.insert(schema.ebookTags).values({
        ebookId,
        tagId: tag.id,
      });
    }
  }

  private async updateSeries(
    ebookId: string,
    seriesEntries: EbookSeriesEntryDto[],
  ) {
    // Delete existing relations
    await this.db
      .delete(schema.ebookSeries)
      .where(eq(schema.ebookSeries.ebookId, ebookId));

    // Create new relations
    for (const entry of seriesEntries) {
      const name = entry.seriesName.trim();
      if (!name) continue;

      // Find or create series
      let [seriesRecord] = await this.db
        .select()
        .from(audiobookSchema.series)
        .where(eq(audiobookSchema.series.name, name))
        .limit(1);

      if (!seriesRecord) {
        [seriesRecord] = await this.db
          .insert(audiobookSchema.series)
          .values({ name })
          .returning();
      }

      // Create relation with order
      await this.db.insert(schema.ebookSeries).values({
        ebookId,
        seriesId: seriesRecord.id,
        order: entry.order,
      });
    }

    await this.deleteOrphanedSeries();
  }

  private async deleteOrphanedSeries() {
    await this.db.delete(audiobookSchema.series).where(
      and(
        notExists(
          this.db
            .select({ one: sql`1` })
            .from(audiobookSchema.audiobookSeries)
            .where(
              eq(
                audiobookSchema.audiobookSeries.seriesId,
                audiobookSchema.series.id,
              ),
            ),
        ),
        notExists(
          this.db
            .select({ one: sql`1` })
            .from(schema.ebookSeries)
            .where(eq(schema.ebookSeries.seriesId, audiobookSchema.series.id)),
        ),
      ),
    );
  }

  async getAuthors(
    search?: string,
    limit?: number,
  ): Promise<{ id: string; name: string }[]> {
    const conditions: SQL[] = [];

    if (search) {
      conditions.push(ilike(audiobookSchema.people.name, `%${search}%`));
    }

    // Get people who are ebook authors (linked via ebookAuthors)
    const baseQuery = this.db
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
      .orderBy(asc(audiobookSchema.people.name));

    return limit !== undefined ? baseQuery.limit(limit) : baseQuery;
  }

  async getPublishers(search?: string, limit?: number): Promise<string[]> {
    const conditions: SQL[] = [];

    // Only get non-null publishers
    conditions.push(isNotNull(schema.ebooks.publisher));

    if (search) {
      conditions.push(ilike(schema.ebooks.publisher, `%${search}%`));
    }

    const baseQuery = this.db
      .selectDistinct({
        publisher: schema.ebooks.publisher,
      })
      .from(schema.ebooks)
      .where(and(...conditions))
      .orderBy(asc(schema.ebooks.publisher));

    const publishers =
      limit !== undefined ? await baseQuery.limit(limit) : await baseQuery;

    return publishers.map((p) => p.publisher!);
  }

  async getSeries(
    search?: string,
    limit?: number,
  ): Promise<{ id: string; name: string }[]> {
    const conditions: SQL[] = [];

    if (search) {
      conditions.push(ilike(audiobookSchema.series.name, `%${search}%`));
    }

    const baseQuery = this.db
      .select({
        id: audiobookSchema.series.id,
        name: audiobookSchema.series.name,
      })
      .from(audiobookSchema.series)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(audiobookSchema.series.name));

    return limit !== undefined ? baseQuery.limit(limit) : baseQuery;
  }

  async getGenres(
    search?: string,
    limit?: number,
  ): Promise<{ id: string; name: string; count: number }[]> {
    const conditions: SQL[] = [];

    if (search) {
      conditions.push(ilike(audiobookSchema.genres.name, `%${search}%`));
    }

    // Only return genres that have at least one ebook
    const baseQuery = this.db
      .select({
        id: audiobookSchema.genres.id,
        name: audiobookSchema.genres.name,
        count: sql<number>`count(${schema.ebookGenres.ebookId})::int`,
      })
      .from(audiobookSchema.genres)
      .innerJoin(
        schema.ebookGenres,
        eq(audiobookSchema.genres.id, schema.ebookGenres.genreId),
      )
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(audiobookSchema.genres.id, audiobookSchema.genres.name)
      .orderBy(asc(audiobookSchema.genres.name));

    return limit !== undefined ? baseQuery.limit(limit) : baseQuery;
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
      apiPath: 'ebooks',
      getCoverPath: (entityId: string) =>
        this.appDataService.getEbookCoverPath(entityId),
      verifyExists: async (entityId: string) => {
        const ebook = await this.db
          .select({ id: schema.ebooks.id })
          .from(schema.ebooks)
          .where(eq(schema.ebooks.id, entityId))
          .limit(1);
        if (ebook.length === 0) {
          throw new NotFoundException('Ebook not found');
        }
      },
      updateCoverMetadata: async (entityId: string, coverUrl: string) => {
        await this.db
          .update(schema.ebooks)
          .set({ coverUrl, coverSource: 'uploaded' })
          .where(eq(schema.ebooks.id, entityId));
      },
      emitUpdateEvent: (entityId: string) => {
        this.appEvents.ebookUpdated(entityId);
      },
    };
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
      await this.deleteOrphanedSeries();

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
