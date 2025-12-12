import {
  Injectable,
  Inject,
  NotFoundException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { GraphQLClient } from 'graphql-request';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as appSettingsSchema from '../app-settings/schema';
import * as audiobooksSchema from '../audiobooks/schema';
import * as ebooksSchema from '../ebooks/schema';
import * as hardcoverSchema from './schema';
import { eq, asc, and, isNull } from 'drizzle-orm';
import { AppEventsService } from '../events/app-events.service';
import { WsEventsService } from '../events/ws-events.service';

type CombinedSchema = typeof appSettingsSchema &
  typeof audiobooksSchema &
  typeof ebooksSchema &
  typeof hardcoverSchema;

export type MediaType = 'audiobook' | 'ebook';

const HARDCOVER_API_URL = 'https://api.hardcover.app/v1/graphql';

// Hardcover API Types
export interface HardcoverImage {
  color?: string;
  color_name?: string;
  height?: number;
  id?: number;
  url?: string;
  width?: number;
}

export interface HardcoverAuthor {
  id: number;
  image?: HardcoverImage;
  name: string;
  slug: string;
}

export interface HardcoverContribution {
  author: HardcoverAuthor;
  contribution: string | null;
}

export interface HardcoverFeaturedSeries {
  name?: string;
  slug?: string;
  position?: number;
}

export interface HardcoverBookDocument {
  activities_count: number;
  alternative_titles: string[];
  author_names: string[];
  compilation: boolean;
  content_warnings: string[];
  contribution_types: string[];
  contributions: HardcoverContribution[];
  description: string;
  featured_series: HardcoverFeaturedSeries;
  genres: string[];
  has_audiobook: boolean;
  has_ebook: boolean;
  id: string;
  image: HardcoverImage;
  isbns: string[];
  lists_count: number;
  moods: string[];
  prompts_count: number;
  rating: number;
  ratings_count: number;
  reviews_count: number;
  series_names: string[];
  slug: string;
  tags: string[];
  title: string;
  users_count: number;
  users_read_count: number;
}

export interface HardcoverHighlightField {
  matched_tokens: string[];
  snippet: string;
}

export interface HardcoverHighlight {
  field: string;
  indices?: number[];
  matched_tokens: string[] | string[][];
  snippet?: string;
  snippets?: string[];
}

export interface HardcoverTextMatchInfo {
  best_field_score: string;
  best_field_weight: number;
  fields_matched: number;
  num_tokens_dropped: number;
  score: string;
  tokens_matched: number;
  typo_prefix_score: number;
}

export interface HardcoverSearchHit {
  document: HardcoverBookDocument;
  highlight: {
    alternative_titles?: HardcoverHighlightField[];
    title?: HardcoverHighlightField;
  };
  highlights: HardcoverHighlight[];
  text_match: number;
  text_match_info: HardcoverTextMatchInfo;
}

export interface HardcoverSearchRequestParams {
  collection_name: string;
  first_q: string;
  per_page: number;
  q: string;
}

export interface HardcoverSearchResults {
  facet_counts: unknown[];
  found: number;
  hits: HardcoverSearchHit[];
  out_of: number;
  page: number;
  request_params: HardcoverSearchRequestParams;
  search_cutoff: boolean;
  search_time_ms: number;
}

export interface HardcoverSearchResponse {
  search: {
    results: HardcoverSearchResults;
  };
}

@Injectable()
export class HardcoverService {
  private readonly logger = new Logger(HardcoverService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: NodePgDatabase<CombinedSchema>,
    private appEvents: AppEventsService,
    private wsEvents: WsEventsService,
  ) {}

  private createClient(apiKey: string): GraphQLClient {
    return new GraphQLClient(HARDCOVER_API_URL, {
      headers: {
        authorization: apiKey,
      },
    });
  }

  async getApiKey(): Promise<string | null> {
    const settings = await this.db
      .select({
        hardcoverApiKey: appSettingsSchema.appSettings.hardcoverApiKey,
      })
      .from(appSettingsSchema.appSettings)
      .where(eq(appSettingsSchema.appSettings.id, 'app_settings'))
      .limit(1);

    return settings[0]?.hardcoverApiKey ?? null;
  }

  async setApiKey(apiKey: string | null): Promise<void> {
    await this.db
      .update(appSettingsSchema.appSettings)
      .set({ hardcoverApiKey: apiKey })
      .where(eq(appSettingsSchema.appSettings.id, 'app_settings'));
  }

  async getAutoSyncOnImport(): Promise<boolean> {
    const settings = await this.db
      .select({
        autoSyncOnImport:
          appSettingsSchema.appSettings.hardcoverAutoSyncOnImport,
      })
      .from(appSettingsSchema.appSettings)
      .where(eq(appSettingsSchema.appSettings.id, 'app_settings'))
      .limit(1);

    return settings[0]?.autoSyncOnImport ?? false;
  }

  async setAutoSyncOnImport(enabled: boolean): Promise<void> {
    await this.db
      .update(appSettingsSchema.appSettings)
      .set({ hardcoverAutoSyncOnImport: enabled })
      .where(eq(appSettingsSchema.appSettings.id, 'app_settings'));
  }

  async validateApiKey(
    apiKey: string,
  ): Promise<{ valid: boolean; error?: string }> {
    const client = this.createClient(apiKey);

    const query = `
      query {
        me {
          id
          username
        }
      }
    `;

    this.logger.log('Validating Hardcover API key');
    const startTime = Date.now();

    try {
      await client.request(query);
      const duration = Date.now() - startTime;
      this.logger.log(`API key validation successful (${duration}ms)`);
      return { valid: true };
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      if (error instanceof Error) {
        if (error.message.includes('401')) {
          this.logger.warn(
            `API key validation failed: Invalid or expired API key (${duration}ms)`,
          );
          return { valid: false, error: 'Invalid or expired API key' };
        }
        if (error.message.includes('429')) {
          this.logger.warn(
            `API key validation failed: Rate limit exceeded (${duration}ms)`,
          );
          return {
            valid: false,
            error: 'Rate limit exceeded, try again in a minute',
          };
        }
        this.logger.error(
          `API key validation failed: ${error.message} (${duration}ms)`,
        );
        return { valid: false, error: error.message };
      }
      this.logger.error(
        `API key validation failed: Unknown error (${duration}ms)`,
      );
      return { valid: false, error: 'Failed to connect to Hardcover' };
    }
  }

  async searchBooks(
    query: string,
    page: number = 1,
    perPage: number = 10,
  ): Promise<{
    success: boolean;
    data?: HardcoverSearchResponse;
    error?: string;
  }> {
    const apiKey = await this.getApiKey();

    if (!apiKey) {
      this.logger.warn('Search attempted without configured API key');
      return { success: false, error: 'Hardcover API key not configured' };
    }

    const client = this.createClient(apiKey);

    const graphqlQuery = `
      query SearchBooks($query: String!, $page: Int!, $perPage: Int!) {
        search(
          query: $query,
          query_type: "books",
          per_page: $perPage,
          page: $page
        ) {
          results
        }
      }
    `;

    this.logger.log(
      `Searching Hardcover: query="${query}", page=${page}, perPage=${perPage}`,
    );
    const startTime = Date.now();

    try {
      const data = await client.request<HardcoverSearchResponse>(graphqlQuery, {
        query,
        page,
        perPage,
      });
      const duration = Date.now() - startTime;
      const hitCount = data?.search?.results?.hits?.length ?? 0;
      const totalFound = data?.search?.results?.found ?? 0;
      this.logger.log(
        `Search successful: found ${totalFound} total, returned ${hitCount} hits (${duration}ms)`,
      );
      return { success: true, data };
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      if (error instanceof Error) {
        if (error.message.includes('401')) {
          this.logger.warn(
            `Search failed: Invalid or expired API key (${duration}ms)`,
          );
          return { success: false, error: 'Invalid or expired API key' };
        }
        if (error.message.includes('429')) {
          this.logger.warn(
            `Search failed: Rate limit exceeded (${duration}ms)`,
          );
          return {
            success: false,
            error: 'Rate limit exceeded, try again in a minute',
          };
        }
        this.logger.error(`Search failed: ${error.message} (${duration}ms)`);
        return { success: false, error: error.message };
      }
      this.logger.error(`Search failed: Unknown error (${duration}ms)`);
      return { success: false, error: 'Failed to connect to Hardcover' };
    }
  }

  /**
   * Find existing hardcover book by hardcoverId or create new one
   */
  private async findOrCreateHardcoverBook(
    hardcoverBook: HardcoverBookDocument,
  ): Promise<typeof hardcoverSchema.hardcoverBooks.$inferSelect> {
    // Check if book already exists
    const existing = await this.db
      .select()
      .from(hardcoverSchema.hardcoverBooks)
      .where(eq(hardcoverSchema.hardcoverBooks.hardcoverId, hardcoverBook.id))
      .limit(1);

    if (existing.length > 0) {
      // Update with latest data
      await this.db
        .update(hardcoverSchema.hardcoverBooks)
        .set({
          slug: hardcoverBook.slug,
          title: hardcoverBook.title,
          description: hardcoverBook.description || null,
          authorNames: hardcoverBook.author_names || [],
          contentWarnings: hardcoverBook.content_warnings || [],
          featuredSeriesName: hardcoverBook.featured_series?.name || null,
          featuredSeriesPosition: hardcoverBook.featured_series?.position
            ? String(hardcoverBook.featured_series.position)
            : null,
          genres: hardcoverBook.genres || [],
          imageUrl: hardcoverBook.image?.url || null,
          isbns: hardcoverBook.isbns || [],
          moods: hardcoverBook.moods || [],
          rating: hardcoverBook.rating ? String(hardcoverBook.rating) : null,
          ratingsCount: hardcoverBook.ratings_count || null,
          tags: hardcoverBook.tags || [],
          syncedAt: new Date(),
        })
        .where(eq(hardcoverSchema.hardcoverBooks.id, existing[0].id));

      const [updated] = await this.db
        .select()
        .from(hardcoverSchema.hardcoverBooks)
        .where(eq(hardcoverSchema.hardcoverBooks.id, existing[0].id))
        .limit(1);

      return updated;
    }

    // Create new book
    const [inserted] = await this.db
      .insert(hardcoverSchema.hardcoverBooks)
      .values({
        hardcoverId: hardcoverBook.id,
        slug: hardcoverBook.slug,
        title: hardcoverBook.title,
        description: hardcoverBook.description || null,
        authorNames: hardcoverBook.author_names || [],
        contentWarnings: hardcoverBook.content_warnings || [],
        featuredSeriesName: hardcoverBook.featured_series?.name || null,
        featuredSeriesPosition: hardcoverBook.featured_series?.position
          ? String(hardcoverBook.featured_series.position)
          : null,
        genres: hardcoverBook.genres || [],
        imageUrl: hardcoverBook.image?.url || null,
        isbns: hardcoverBook.isbns || [],
        moods: hardcoverBook.moods || [],
        rating: hardcoverBook.rating ? String(hardcoverBook.rating) : null,
        ratingsCount: hardcoverBook.ratings_count || null,
        tags: hardcoverBook.tags || [],
        syncedAt: new Date(),
      })
      .returning();

    return inserted;
  }

  async searchByAudiobookId(audiobookId: string): Promise<{
    success: boolean;
    data?: HardcoverSearchResponse;
    query?: string;
    error?: string;
  }> {
    // Fetch the audiobook with its authors
    const audiobook = await this.db
      .select({
        title: audiobooksSchema.audiobooks.title,
        subtitle: audiobooksSchema.audiobooks.subtitle,
      })
      .from(audiobooksSchema.audiobooks)
      .where(eq(audiobooksSchema.audiobooks.id, audiobookId))
      .limit(1);

    if (audiobook.length === 0) {
      throw new NotFoundException('Audiobook not found');
    }

    // Fetch authors for this audiobook
    const authors = await this.db
      .select({
        name: audiobooksSchema.people.name,
      })
      .from(audiobooksSchema.audiobookAuthors)
      .innerJoin(
        audiobooksSchema.people,
        eq(
          audiobooksSchema.audiobookAuthors.personId,
          audiobooksSchema.people.id,
        ),
      )
      .where(eq(audiobooksSchema.audiobookAuthors.audiobookId, audiobookId))
      .orderBy(asc(audiobooksSchema.audiobookAuthors.order));

    const { title, subtitle } = audiobook[0];

    const fullTitle = subtitle ? `${title}: ${subtitle}` : title;

    // Build search query: "title author1 author2"
    const authorNames = authors.map((a) => a.name).join(' ');
    const searchQuery = authorNames ? `${fullTitle} ${authorNames}` : fullTitle;

    const result = await this.searchBooks(searchQuery);

    return {
      ...result,
      query: searchQuery,
    };
  }

  async searchByAudiobookIdPaginated(
    audiobookId: string,
    page: number = 1,
    perPage: number = 10,
  ): Promise<{
    success: boolean;
    data?: HardcoverSearchResponse;
    query?: string;
    error?: string;
  }> {
    // Fetch the audiobook with its authors
    const audiobook = await this.db
      .select({
        title: audiobooksSchema.audiobooks.title,
        subtitle: audiobooksSchema.audiobooks.subtitle,
      })
      .from(audiobooksSchema.audiobooks)
      .where(eq(audiobooksSchema.audiobooks.id, audiobookId))
      .limit(1);

    if (audiobook.length === 0) {
      throw new NotFoundException('Audiobook not found');
    }

    // Fetch authors for this audiobook
    const authors = await this.db
      .select({
        name: audiobooksSchema.people.name,
      })
      .from(audiobooksSchema.audiobookAuthors)
      .innerJoin(
        audiobooksSchema.people,
        eq(
          audiobooksSchema.audiobookAuthors.personId,
          audiobooksSchema.people.id,
        ),
      )
      .where(eq(audiobooksSchema.audiobookAuthors.audiobookId, audiobookId))
      .orderBy(asc(audiobooksSchema.audiobookAuthors.order));

    const { title, subtitle } = audiobook[0];

    const fullTitle = subtitle ? `${title}: ${subtitle}` : title;

    // Build search query: "title author1 author2"
    const authorNames = authors.map((a) => a.name).join(' ');
    const searchQuery = authorNames ? `${fullTitle} ${authorNames}` : fullTitle;

    const result = await this.searchBooks(searchQuery, page, perPage);

    return {
      ...result,
      query: searchQuery,
    };
  }

  async linkMediaToHardcover(
    mediaType: MediaType,
    mediaId: string,
    hardcoverBook: HardcoverBookDocument,
  ): Promise<typeof hardcoverSchema.hardcoverBooks.$inferSelect> {
    // Verify media exists
    if (mediaType === 'audiobook') {
      const audiobook = await this.db
        .select({ id: audiobooksSchema.audiobooks.id })
        .from(audiobooksSchema.audiobooks)
        .where(eq(audiobooksSchema.audiobooks.id, mediaId))
        .limit(1);

      if (audiobook.length === 0) {
        throw new NotFoundException('Audiobook not found');
      }
    } else {
      const ebook = await this.db
        .select({ id: ebooksSchema.ebooks.id })
        .from(ebooksSchema.ebooks)
        .where(eq(ebooksSchema.ebooks.id, mediaId))
        .limit(1);

      if (ebook.length === 0) {
        throw new NotFoundException('Ebook not found');
      }
    }

    // Find or create hardcover book
    const hcBook = await this.findOrCreateHardcoverBook(hardcoverBook);

    // Create or update junction link
    if (mediaType === 'audiobook') {
      // Delete existing link if any
      await this.db
        .delete(hardcoverSchema.hardcoverAudiobookLinks)
        .where(
          eq(hardcoverSchema.hardcoverAudiobookLinks.audiobookId, mediaId),
        );

      // Create new link
      await this.db.insert(hardcoverSchema.hardcoverAudiobookLinks).values({
        audiobookId: mediaId,
        hardcoverBookId: hcBook.id,
      });

      this.appEvents.hardcoverSyncCompleted(mediaId);
    } else {
      // Delete existing link if any
      await this.db
        .delete(hardcoverSchema.hardcoverEbookLinks)
        .where(eq(hardcoverSchema.hardcoverEbookLinks.ebookId, mediaId));

      // Create new link
      await this.db.insert(hardcoverSchema.hardcoverEbookLinks).values({
        ebookId: mediaId,
        hardcoverBookId: hcBook.id,
      });

      this.appEvents.ebookUpdated(mediaId);
    }

    return hcBook;
  }

  // Keep old method as alias for backward compatibility during transition
  async linkAudiobookToHardcover(
    audiobookId: string,
    hardcoverBook: HardcoverBookDocument,
  ): Promise<typeof hardcoverSchema.hardcoverBooks.$inferSelect> {
    return this.linkMediaToHardcover('audiobook', audiobookId, hardcoverBook);
  }

  async getHardcoverLink(
    mediaType: MediaType,
    mediaId: string,
  ): Promise<typeof hardcoverSchema.hardcoverBooks.$inferSelect | null> {
    if (mediaType === 'audiobook') {
      const link = await this.db
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
        .where(eq(hardcoverSchema.hardcoverAudiobookLinks.audiobookId, mediaId))
        .limit(1);

      return link[0]?.hardcoverBook || null;
    } else {
      const link = await this.db
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
        .where(eq(hardcoverSchema.hardcoverEbookLinks.ebookId, mediaId))
        .limit(1);

      return link[0]?.hardcoverBook || null;
    }
  }

  // Keep old method as alias
  async getAudiobookHardcoverLink(
    audiobookId: string,
  ): Promise<typeof hardcoverSchema.hardcoverBooks.$inferSelect | null> {
    return this.getHardcoverLink('audiobook', audiobookId);
  }

  async unlinkMedia(mediaType: MediaType, mediaId: string): Promise<void> {
    if (mediaType === 'audiobook') {
      await this.db
        .delete(hardcoverSchema.hardcoverAudiobookLinks)
        .where(
          eq(hardcoverSchema.hardcoverAudiobookLinks.audiobookId, mediaId),
        );

      this.appEvents.audiobookUpdated(mediaId);
    } else {
      await this.db
        .delete(hardcoverSchema.hardcoverEbookLinks)
        .where(eq(hardcoverSchema.hardcoverEbookLinks.ebookId, mediaId));

      this.appEvents.ebookUpdated(mediaId);
    }

    // TODO: Could clean up orphaned hardcover_books here if desired
  }

  // Keep old method as alias
  async unlinkAudiobookFromHardcover(audiobookId: string): Promise<void> {
    return this.unlinkMedia('audiobook', audiobookId);
  }

  async searchByMediaId(
    mediaType: MediaType,
    mediaId: string,
  ): Promise<{
    success: boolean;
    data?: HardcoverSearchResponse;
    query?: string;
    error?: string;
  }> {
    let title: string;
    let subtitle: string | null;
    let authorNames: string[];

    if (mediaType === 'audiobook') {
      const audiobook = await this.db
        .select({
          title: audiobooksSchema.audiobooks.title,
          subtitle: audiobooksSchema.audiobooks.subtitle,
        })
        .from(audiobooksSchema.audiobooks)
        .where(eq(audiobooksSchema.audiobooks.id, mediaId))
        .limit(1);

      if (audiobook.length === 0) {
        throw new NotFoundException('Audiobook not found');
      }

      title = audiobook[0].title;
      subtitle = audiobook[0].subtitle;

      const authors = await this.db
        .select({ name: audiobooksSchema.people.name })
        .from(audiobooksSchema.audiobookAuthors)
        .innerJoin(
          audiobooksSchema.people,
          eq(
            audiobooksSchema.audiobookAuthors.personId,
            audiobooksSchema.people.id,
          ),
        )
        .where(eq(audiobooksSchema.audiobookAuthors.audiobookId, mediaId))
        .orderBy(asc(audiobooksSchema.audiobookAuthors.order));

      authorNames = authors.map((a) => a.name);
    } else {
      const ebook = await this.db
        .select({
          title: ebooksSchema.ebooks.title,
          subtitle: ebooksSchema.ebooks.subtitle,
        })
        .from(ebooksSchema.ebooks)
        .where(eq(ebooksSchema.ebooks.id, mediaId))
        .limit(1);

      if (ebook.length === 0) {
        throw new NotFoundException('Ebook not found');
      }

      title = ebook[0].title;
      subtitle = ebook[0].subtitle;

      const authors = await this.db
        .select({ name: audiobooksSchema.people.name })
        .from(ebooksSchema.ebookAuthors)
        .innerJoin(
          audiobooksSchema.people,
          eq(ebooksSchema.ebookAuthors.personId, audiobooksSchema.people.id),
        )
        .where(eq(ebooksSchema.ebookAuthors.ebookId, mediaId))
        .orderBy(asc(ebooksSchema.ebookAuthors.order));

      authorNames = authors.map((a) => a.name);
    }

    const fullTitle = subtitle ? `${title}: ${subtitle}` : title;
    const searchQuery =
      authorNames.length > 0
        ? `${fullTitle} ${authorNames.join(' ')}`
        : fullTitle;

    const result = await this.searchBooks(searchQuery);

    return {
      ...result,
      query: searchQuery,
    };
  }

  async searchByMediaIdPaginated(
    mediaType: MediaType,
    mediaId: string,
    page: number = 1,
    perPage: number = 10,
  ): Promise<{
    success: boolean;
    data?: HardcoverSearchResponse;
    query?: string;
    error?: string;
  }> {
    let title: string;
    let subtitle: string | null;
    let authorNames: string[];

    if (mediaType === 'audiobook') {
      const audiobook = await this.db
        .select({
          title: audiobooksSchema.audiobooks.title,
          subtitle: audiobooksSchema.audiobooks.subtitle,
        })
        .from(audiobooksSchema.audiobooks)
        .where(eq(audiobooksSchema.audiobooks.id, mediaId))
        .limit(1);

      if (audiobook.length === 0) {
        throw new NotFoundException('Audiobook not found');
      }

      title = audiobook[0].title;
      subtitle = audiobook[0].subtitle;

      const authors = await this.db
        .select({ name: audiobooksSchema.people.name })
        .from(audiobooksSchema.audiobookAuthors)
        .innerJoin(
          audiobooksSchema.people,
          eq(
            audiobooksSchema.audiobookAuthors.personId,
            audiobooksSchema.people.id,
          ),
        )
        .where(eq(audiobooksSchema.audiobookAuthors.audiobookId, mediaId))
        .orderBy(asc(audiobooksSchema.audiobookAuthors.order));

      authorNames = authors.map((a) => a.name);
    } else {
      const ebook = await this.db
        .select({
          title: ebooksSchema.ebooks.title,
          subtitle: ebooksSchema.ebooks.subtitle,
        })
        .from(ebooksSchema.ebooks)
        .where(eq(ebooksSchema.ebooks.id, mediaId))
        .limit(1);

      if (ebook.length === 0) {
        throw new NotFoundException('Ebook not found');
      }

      title = ebook[0].title;
      subtitle = ebook[0].subtitle;

      const authors = await this.db
        .select({ name: audiobooksSchema.people.name })
        .from(ebooksSchema.ebookAuthors)
        .innerJoin(
          audiobooksSchema.people,
          eq(ebooksSchema.ebookAuthors.personId, audiobooksSchema.people.id),
        )
        .where(eq(ebooksSchema.ebookAuthors.ebookId, mediaId))
        .orderBy(asc(ebooksSchema.ebookAuthors.order));

      authorNames = authors.map((a) => a.name);
    }

    const fullTitle = subtitle ? `${title}: ${subtitle}` : title;
    const searchQuery =
      authorNames.length > 0
        ? `${fullTitle} ${authorNames.join(' ')}`
        : fullTitle;

    const result = await this.searchBooks(searchQuery, page, perPage);

    return {
      ...result,
      query: searchQuery,
    };
  }

  // ============ Sync Queue Methods ============

  async addToSyncQueue(mediaType: MediaType, mediaId: string): Promise<void> {
    // Check if already in queue or already linked
    if (mediaType === 'audiobook') {
      const [existingQueue, existingLink] = await Promise.all([
        this.db
          .select({ id: hardcoverSchema.hardcoverSyncQueue.id })
          .from(hardcoverSchema.hardcoverSyncQueue)
          .where(eq(hardcoverSchema.hardcoverSyncQueue.audiobookId, mediaId))
          .limit(1),
        this.db
          .select({
            audiobookId: hardcoverSchema.hardcoverAudiobookLinks.audiobookId,
          })
          .from(hardcoverSchema.hardcoverAudiobookLinks)
          .where(
            eq(hardcoverSchema.hardcoverAudiobookLinks.audiobookId, mediaId),
          )
          .limit(1),
      ]);

      if (existingQueue.length > 0 || existingLink.length > 0) {
        this.logger.debug(
          `Audiobook ${mediaId} already in queue or linked, skipping`,
        );
        return;
      }

      await this.db.insert(hardcoverSchema.hardcoverSyncQueue).values({
        audiobookId: mediaId,
        status: 'pending',
      });
    } else {
      const [existingQueue, existingLink] = await Promise.all([
        this.db
          .select({ id: hardcoverSchema.hardcoverSyncQueue.id })
          .from(hardcoverSchema.hardcoverSyncQueue)
          .where(eq(hardcoverSchema.hardcoverSyncQueue.ebookId, mediaId))
          .limit(1),
        this.db
          .select({ ebookId: hardcoverSchema.hardcoverEbookLinks.ebookId })
          .from(hardcoverSchema.hardcoverEbookLinks)
          .where(eq(hardcoverSchema.hardcoverEbookLinks.ebookId, mediaId))
          .limit(1),
      ]);

      if (existingQueue.length > 0 || existingLink.length > 0) {
        this.logger.debug(
          `Ebook ${mediaId} already in queue or linked, skipping`,
        );
        return;
      }

      await this.db.insert(hardcoverSchema.hardcoverSyncQueue).values({
        ebookId: mediaId,
        status: 'pending',
      });
    }

    this.logger.log(`Added ${mediaType} ${mediaId} to Hardcover sync queue`);
    this.emitHardcoverSyncStatus();
  }

  /**
   * Emit current hardcover sync status to all connected WebSocket clients
   */
  private async emitHardcoverSyncStatus(): Promise<void> {
    try {
      const [pendingCount, failedItems] = await Promise.all([
        this.getPendingQueueCount(),
        this.getFailedQueueItems(),
      ]);

      this.wsEvents.hardcoverSyncStatusUpdated({
        pendingCount,
        failedCount: failedItems.length,
      });
    } catch (error) {
      this.logger.error(`Failed to emit hardcover sync status: ${error}`);
    }
  }

  async getNextPendingFromQueue(): Promise<
    typeof hardcoverSchema.hardcoverSyncQueue.$inferSelect | null
  > {
    const items = await this.db
      .select()
      .from(hardcoverSchema.hardcoverSyncQueue)
      .where(eq(hardcoverSchema.hardcoverSyncQueue.status, 'pending'))
      .orderBy(asc(hardcoverSchema.hardcoverSyncQueue.createdAt))
      .limit(1);

    return items[0] || null;
  }

  async markQueueItemProcessing(id: string): Promise<void> {
    await this.db
      .update(hardcoverSchema.hardcoverSyncQueue)
      .set({ status: 'processing' })
      .where(eq(hardcoverSchema.hardcoverSyncQueue.id, id));
  }

  async markQueueItemFailed(id: string, errorMessage: string): Promise<void> {
    await this.db
      .update(hardcoverSchema.hardcoverSyncQueue)
      .set({ status: 'failed', errorMessage })
      .where(eq(hardcoverSchema.hardcoverSyncQueue.id, id));
  }

  async removeFromQueue(id: string): Promise<void> {
    await this.db
      .delete(hardcoverSchema.hardcoverSyncQueue)
      .where(eq(hardcoverSchema.hardcoverSyncQueue.id, id));
  }

  async getFailedQueueItems(): Promise<
    {
      id: string;
      audiobookId: string | null;
      ebookId: string | null;
      errorMessage: string | null;
      createdAt: Date;
      media: {
        id: string;
        type: MediaType;
        title: string;
        subtitle: string | null;
        coverUrl: string | null;
      } | null;
    }[]
  > {
    const items = await this.db
      .select({
        id: hardcoverSchema.hardcoverSyncQueue.id,
        audiobookId: hardcoverSchema.hardcoverSyncQueue.audiobookId,
        ebookId: hardcoverSchema.hardcoverSyncQueue.ebookId,
        errorMessage: hardcoverSchema.hardcoverSyncQueue.errorMessage,
        createdAt: hardcoverSchema.hardcoverSyncQueue.createdAt,
      })
      .from(hardcoverSchema.hardcoverSyncQueue)
      .where(eq(hardcoverSchema.hardcoverSyncQueue.status, 'failed'))
      .orderBy(asc(hardcoverSchema.hardcoverSyncQueue.createdAt));

    const result = await Promise.all(
      items.map(async (item) => {
        let media: {
          id: string;
          type: MediaType;
          title: string;
          subtitle: string | null;
          coverUrl: string | null;
        } | null = null;

        if (item.audiobookId) {
          const audiobook = await this.db
            .select({
              id: audiobooksSchema.audiobooks.id,
              title: audiobooksSchema.audiobooks.title,
              subtitle: audiobooksSchema.audiobooks.subtitle,
            })
            .from(audiobooksSchema.audiobooks)
            .where(eq(audiobooksSchema.audiobooks.id, item.audiobookId))
            .limit(1);

          if (audiobook.length > 0) {
            media = {
              id: audiobook[0].id,
              type: 'audiobook',
              title: audiobook[0].title,
              subtitle: audiobook[0].subtitle,
              coverUrl: `/api/audiobooks/${audiobook[0].id}/cover`,
            };
          }
        } else if (item.ebookId) {
          const ebook = await this.db
            .select({
              id: ebooksSchema.ebooks.id,
              title: ebooksSchema.ebooks.title,
              subtitle: ebooksSchema.ebooks.subtitle,
            })
            .from(ebooksSchema.ebooks)
            .where(eq(ebooksSchema.ebooks.id, item.ebookId))
            .limit(1);

          if (ebook.length > 0) {
            media = {
              id: ebook[0].id,
              type: 'ebook',
              title: ebook[0].title,
              subtitle: ebook[0].subtitle,
              coverUrl: `/api/ebooks/${ebook[0].id}/cover`,
            };
          }
        }

        return {
          ...item,
          media,
        };
      }),
    );

    return result;
  }

  async getPendingQueueCount(): Promise<number> {
    const result = await this.db
      .select({ id: hardcoverSchema.hardcoverSyncQueue.id })
      .from(hardcoverSchema.hardcoverSyncQueue)
      .where(eq(hardcoverSchema.hardcoverSyncQueue.status, 'pending'));

    return result.length;
  }

  async dismissFailedItem(id: string): Promise<void> {
    await this.db
      .delete(hardcoverSchema.hardcoverSyncQueue)
      .where(
        and(
          eq(hardcoverSchema.hardcoverSyncQueue.id, id),
          eq(hardcoverSchema.hardcoverSyncQueue.status, 'failed'),
        ),
      );
  }

  async queueAllUnlinked(mediaType: MediaType): Promise<number> {
    // Check if API key is configured
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new BadRequestException('Hardcover API key not configured');
    }

    let unlinkedIds: string[];

    if (mediaType === 'audiobook') {
      // Find all audiobooks without a Hardcover link
      const unlinked = await this.db
        .select({ id: audiobooksSchema.audiobooks.id })
        .from(audiobooksSchema.audiobooks)
        .leftJoin(
          hardcoverSchema.hardcoverAudiobookLinks,
          eq(
            audiobooksSchema.audiobooks.id,
            hardcoverSchema.hardcoverAudiobookLinks.audiobookId,
          ),
        )
        .where(isNull(hardcoverSchema.hardcoverAudiobookLinks.audiobookId));

      unlinkedIds = unlinked.map((row) => row.id);
    } else {
      // Find all ebooks without a Hardcover link
      const unlinked = await this.db
        .select({ id: ebooksSchema.ebooks.id })
        .from(ebooksSchema.ebooks)
        .leftJoin(
          hardcoverSchema.hardcoverEbookLinks,
          eq(
            ebooksSchema.ebooks.id,
            hardcoverSchema.hardcoverEbookLinks.ebookId,
          ),
        )
        .where(isNull(hardcoverSchema.hardcoverEbookLinks.ebookId));

      unlinkedIds = unlinked.map((row) => row.id);
    }

    // Queue each unlinked item (addToSyncQueue handles duplicates)
    let queuedCount = 0;
    for (const id of unlinkedIds) {
      await this.addToSyncQueue(mediaType, id);
      queuedCount++;
    }

    this.logger.log(
      `Queued ${queuedCount} unlinked ${mediaType}s for Hardcover sync`,
    );

    return queuedCount;
  }
}
