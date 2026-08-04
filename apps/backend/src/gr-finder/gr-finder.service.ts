import {
  Injectable,
  Logger,
  Inject,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import { audiobooks } from '../audiobooks/schema';
import { ebooks } from '../ebooks/schema';
import * as goodreadsSchema from './schema';
import {
  GoodreadsScraperService,
  UNKNOWN_PLACEHOLDER,
} from './goodreads-scraper.service';
import type { ScrapedBookDetails } from './goodreads-scraper.service';
import { splitPersonNames } from '../common/utils/name.utils';
import { splitTitleSubtitle } from '../common/utils/title.utils';

export type MediaType = 'audiobook' | 'ebook';

/**
 * Treats blank values and the `Unknown` placeholder as "no data", so neither
 * can be written over metadata we already hold.
 */
function meaningful(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === UNKNOWN_PLACEHOLDER) {
    return null;
  }
  return trimmed;
}

export interface GrFinderSearchResult {
  title: string;
  author: string;
  goodreads_id: string;
  cover_url: string | null;
  avg_rating: string | null;
  url: string;
}

export interface GrFinderSearchResponse {
  query: string;
  count: number;
  results: GrFinderSearchResult[];
}

export interface GrFinderBookDetails {
  title: string;
  author: string;
  goodreads_id?: string;
  cover_url: string | null;
  rating?: number | null;
  url?: string;
  description: string | null;
  genres: string[];
  rating_count?: number | null;
  series?: string | null;
  series_number?: string | null;
}

export interface GoodreadsBookInput {
  goodreads_id: string;
  title: string;
  author: string;
  cover_url?: string | null;
  url: string;
  description?: string | null;
  genres?: string[];
  rating?: number | null;
  ratings_count?: number | null;
}

/**
 * The search-result fields the client already had on screen, used to complete
 * a link when the book page itself can't be read.
 */
export interface GoodreadsSearchFallback {
  title?: string;
  author?: string;
  cover_url?: string | null;
  avg_rating?: string | null;
}

@Injectable()
export class GrFinderService {
  private readonly logger = new Logger(GrFinderService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase,
    private readonly scraper: GoodreadsScraperService,
  ) {}

  async search(query: string): Promise<GrFinderSearchResponse> {
    this.logger.debug(`Searching Goodreads: ${query}`);

    const results = await this.scraper.searchBooks(query);

    return {
      query,
      count: results.length,
      results,
    };
  }

  async searchByMediaId(
    mediaType: MediaType,
    mediaId: string,
    customQuery?: string,
  ): Promise<GrFinderSearchResponse & { query: string }> {
    let searchQuery: string;

    if (customQuery) {
      searchQuery = customQuery;
    } else {
      let title: string;
      let subtitle: string | null;

      if (mediaType === 'audiobook') {
        const [audiobook] = await this.db
          .select({
            title: audiobooks.title,
            subtitle: audiobooks.subtitle,
          })
          .from(audiobooks)
          .where(eq(audiobooks.id, mediaId))
          .limit(1);

        if (!audiobook) {
          throw new NotFoundException('Audiobook not found');
        }

        title = audiobook.title;
        subtitle = audiobook.subtitle;
      } else {
        const [ebook] = await this.db
          .select({
            title: ebooks.title,
            subtitle: ebooks.subtitle,
          })
          .from(ebooks)
          .where(eq(ebooks.id, mediaId))
          .limit(1);

        if (!ebook) {
          throw new NotFoundException('Ebook not found');
        }

        title = ebook.title;
        subtitle = ebook.subtitle;
      }

      searchQuery = subtitle ? `${title}: ${subtitle}` : title;
    }

    const result = await this.search(searchQuery);

    return {
      ...result,
      query: searchQuery,
    };
  }

  async getBookDetails(goodreadsId: string): Promise<GrFinderBookDetails> {
    this.logger.debug(`Fetching Goodreads book details: ${goodreadsId}`);

    const details = await this.scraper.getBookDetails(goodreadsId);
    if (!details) {
      // Usually the WAF challenge rather than a missing book, and either way
      // retrying is the useful advice — so not a 404.
      throw new ServiceUnavailableException(
        'Could not read the Goodreads book page. Please try again.',
      );
    }

    return {
      ...details,
      goodreads_id: goodreadsId,
      url: `https://www.goodreads.com/book/show/${goodreadsId}`,
    };
  }

  /**
   * Throws NotFoundException unless the media exists. Called before a link is
   * queued so an unknown id fails the request itself rather than surfacing
   * later as a background job failure.
   */
  async assertMediaExists(
    mediaType: MediaType,
    mediaId: string,
  ): Promise<void> {
    if (mediaType === 'audiobook') {
      const [audiobook] = await this.db
        .select({ id: audiobooks.id })
        .from(audiobooks)
        .where(eq(audiobooks.id, mediaId))
        .limit(1);

      if (!audiobook) {
        throw new NotFoundException('Audiobook not found');
      }
    } else {
      const [ebook] = await this.db
        .select({ id: ebooks.id })
        .from(ebooks)
        .where(eq(ebooks.id, mediaId))
        .limit(1);

      if (!ebook) {
        throw new NotFoundException('Ebook not found');
      }
    }
  }

  async linkMediaToGoodreads(
    mediaType: MediaType,
    mediaId: string,
    goodreadsId: string,
    searchResult?: GoodreadsSearchFallback,
  ) {
    await this.assertMediaExists(mediaType, mediaId);

    const bookInput = await this.buildBookInput(goodreadsId, searchResult);

    // Find or create the Goodreads book record
    const goodreadsBookRecord = await this.findOrCreateGoodreadsBook(bookInput);

    // Delete any existing link for this media
    if (mediaType === 'audiobook') {
      await this.db
        .delete(goodreadsSchema.goodreadsAudiobookLinks)
        .where(
          eq(goodreadsSchema.goodreadsAudiobookLinks.audiobookId, mediaId),
        );
    } else {
      await this.db
        .delete(goodreadsSchema.goodreadsEbookLinks)
        .where(eq(goodreadsSchema.goodreadsEbookLinks.ebookId, mediaId));
    }

    // Create new link
    if (mediaType === 'audiobook') {
      await this.db.insert(goodreadsSchema.goodreadsAudiobookLinks).values({
        audiobookId: mediaId,
        goodreadsBookId: goodreadsBookRecord.id,
      });
    } else {
      await this.db.insert(goodreadsSchema.goodreadsEbookLinks).values({
        ebookId: mediaId,
        goodreadsBookId: goodreadsBookRecord.id,
      });
    }

    this.logger.log(
      `Linked ${mediaType} ${mediaId} to Goodreads book ${goodreadsId}`,
    );

    return goodreadsBookRecord;
  }

  /**
   * Builds the record to persist from the Goodreads book page, falling back to
   * the search-result data the client already had when that page can't be
   * read. Fields only the book page carries are left unset in that case so an
   * existing record keeps them rather than having them blanked.
   */
  private async buildBookInput(
    goodreadsId: string,
    searchResult?: GoodreadsSearchFallback,
  ): Promise<GoodreadsBookInput> {
    const url = `https://www.goodreads.com/book/show/${goodreadsId}`;

    let details: ScrapedBookDetails | null = null;
    try {
      details = await this.scraper.getBookDetails(goodreadsId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Goodreads detail lookup failed for ${goodreadsId}: ${message}`,
      );
    }

    if (details) {
      return {
        goodreads_id: goodreadsId,
        title: details.title,
        author: details.author,
        cover_url: details.cover_url,
        url,
        description: details.description,
        genres: details.genres,
        rating: details.rating,
        ratings_count: details.rating_count,
      };
    }

    const fallbackTitle = meaningful(searchResult?.title);
    if (!fallbackTitle) {
      throw new ServiceUnavailableException(
        'Could not read the Goodreads book page. Please try again.',
      );
    }

    this.logger.warn(
      `Goodreads book page unavailable for ${goodreadsId}; linking with search-result metadata instead`,
    );

    const avgRating = Number.parseFloat(searchResult?.avg_rating ?? '');

    return {
      goodreads_id: goodreadsId,
      title: fallbackTitle,
      author: meaningful(searchResult?.author) ?? UNKNOWN_PLACEHOLDER,
      cover_url: searchResult?.cover_url ?? null,
      url,
      rating: Number.isNaN(avgRating) ? null : avgRating,
    };
  }

  private async findOrCreateGoodreadsBook(book: GoodreadsBookInput) {
    const knownTitle = meaningful(book.title);
    const knownAuthor = meaningful(book.author);
    const normalizedAuthor = knownAuthor
      ? splitPersonNames(knownAuthor).join(', ') || knownAuthor
      : null;
    // Goodreads stores `"Title: Subtitle"` in a single field; split into our
    // separate columns so the subtitle isn't baked into the title.
    const { title: splitTitle, subtitle: splitSubtitle } = splitTitleSubtitle(
      book.title,
    );

    // Check if book already exists
    const [existing] = await this.db
      .select()
      .from(goodreadsSchema.goodreadsBooks)
      .where(eq(goodreadsSchema.goodreadsBooks.goodreadsId, book.goodreads_id))
      .limit(1);

    const rating = book.rating ?? null;

    if (existing) {
      // Update existing record
      const [updated] = await this.db
        .update(goodreadsSchema.goodreadsBooks)
        .set({
          // Every field falls back to what we already stored: a lookup that
          // came back thin must never downgrade a record that was complete.
          title: knownTitle ? (splitTitle ?? book.title) : existing.title,
          subtitle: knownTitle ? splitSubtitle : existing.subtitle,
          author: normalizedAuthor ?? existing.author,
          description: book.description ?? existing.description,
          coverUrl: book.cover_url ?? existing.coverUrl,
          url: book.url,
          rating: rating?.toString() ?? existing.rating,
          ratingsCount: book.ratings_count ?? existing.ratingsCount,
          // An empty list means "none parsed", not "this book has no genres".
          genres: book.genres?.length ? book.genres : existing.genres,
          syncedAt: new Date(),
        })
        .where(eq(goodreadsSchema.goodreadsBooks.id, existing.id))
        .returning();

      return updated;
    }

    // Create new record
    const [created] = await this.db
      .insert(goodreadsSchema.goodreadsBooks)
      .values({
        goodreadsId: book.goodreads_id,
        title: splitTitle ?? book.title,
        subtitle: splitSubtitle,
        author: normalizedAuthor ?? book.author,
        description: book.description ?? null,
        coverUrl: book.cover_url ?? null,
        url: book.url,
        rating: rating?.toString() ?? null,
        ratingsCount: book.ratings_count ?? null,
        genres: book.genres ?? [],
      })
      .returning();

    return created;
  }

  async getGoodreadsLink(mediaType: MediaType, mediaId: string) {
    if (mediaType === 'audiobook') {
      const [result] = await this.db
        .select({
          id: goodreadsSchema.goodreadsBooks.id,
          goodreadsId: goodreadsSchema.goodreadsBooks.goodreadsId,
          title: goodreadsSchema.goodreadsBooks.title,
          author: goodreadsSchema.goodreadsBooks.author,
          description: goodreadsSchema.goodreadsBooks.description,
          coverUrl: goodreadsSchema.goodreadsBooks.coverUrl,
          url: goodreadsSchema.goodreadsBooks.url,
          rating: goodreadsSchema.goodreadsBooks.rating,
          ratingsCount: goodreadsSchema.goodreadsBooks.ratingsCount,
          genres: goodreadsSchema.goodreadsBooks.genres,
          syncedAt: goodreadsSchema.goodreadsBooks.syncedAt,
          createdAt: goodreadsSchema.goodreadsBooks.createdAt,
          updatedAt: goodreadsSchema.goodreadsBooks.updatedAt,
        })
        .from(goodreadsSchema.goodreadsAudiobookLinks)
        .innerJoin(
          goodreadsSchema.goodreadsBooks,
          eq(
            goodreadsSchema.goodreadsAudiobookLinks.goodreadsBookId,
            goodreadsSchema.goodreadsBooks.id,
          ),
        )
        .where(eq(goodreadsSchema.goodreadsAudiobookLinks.audiobookId, mediaId))
        .limit(1);

      return result ?? null;
    } else {
      const [result] = await this.db
        .select({
          id: goodreadsSchema.goodreadsBooks.id,
          goodreadsId: goodreadsSchema.goodreadsBooks.goodreadsId,
          title: goodreadsSchema.goodreadsBooks.title,
          author: goodreadsSchema.goodreadsBooks.author,
          description: goodreadsSchema.goodreadsBooks.description,
          coverUrl: goodreadsSchema.goodreadsBooks.coverUrl,
          url: goodreadsSchema.goodreadsBooks.url,
          rating: goodreadsSchema.goodreadsBooks.rating,
          ratingsCount: goodreadsSchema.goodreadsBooks.ratingsCount,
          genres: goodreadsSchema.goodreadsBooks.genres,
          syncedAt: goodreadsSchema.goodreadsBooks.syncedAt,
          createdAt: goodreadsSchema.goodreadsBooks.createdAt,
          updatedAt: goodreadsSchema.goodreadsBooks.updatedAt,
        })
        .from(goodreadsSchema.goodreadsEbookLinks)
        .innerJoin(
          goodreadsSchema.goodreadsBooks,
          eq(
            goodreadsSchema.goodreadsEbookLinks.goodreadsBookId,
            goodreadsSchema.goodreadsBooks.id,
          ),
        )
        .where(eq(goodreadsSchema.goodreadsEbookLinks.ebookId, mediaId))
        .limit(1);

      return result ?? null;
    }
  }

  async unlinkMedia(mediaType: MediaType, mediaId: string) {
    if (mediaType === 'audiobook') {
      await this.db
        .delete(goodreadsSchema.goodreadsAudiobookLinks)
        .where(
          eq(goodreadsSchema.goodreadsAudiobookLinks.audiobookId, mediaId),
        );
    } else {
      await this.db
        .delete(goodreadsSchema.goodreadsEbookLinks)
        .where(eq(goodreadsSchema.goodreadsEbookLinks.ebookId, mediaId));
    }

    this.logger.log(`Unlinked ${mediaType} ${mediaId} from Goodreads`);
  }
}
