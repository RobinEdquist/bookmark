import { Injectable, Logger, Inject, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import { audiobooks } from '../audiobooks/schema';
import { ebooks } from '../ebooks/schema';
import * as goodreadsSchema from './schema';
import { splitPersonNames } from '../common/utils/name.utils';

export type MediaType = 'audiobook' | 'ebook';

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

@Injectable()
export class GrFinderService {
  private readonly logger = new Logger(GrFinderService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase,
  ) {}

  isConfigured(): boolean {
    return !!process.env.GR_FINDER_URL;
  }

  private getBaseUrl(): string | null {
    const url = process.env.GR_FINDER_URL;
    if (!url) return null;
    return url.replace(/\/$/, '');
  }

  async search(query: string): Promise<GrFinderSearchResponse> {
    const baseUrl = this.getBaseUrl();
    if (!baseUrl) {
      throw new Error('GR_FINDER_URL is not configured');
    }

    const searchParams = new URLSearchParams({ q: query });
    const url = `${baseUrl}/search?${searchParams.toString()}`;

    this.logger.debug(`Searching Goodreads Finder: ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      this.logger.error(
        `Goodreads Finder search failed: ${response.status} - ${errorText}`,
      );
      throw new Error(`Search failed: ${response.statusText}`);
    }

    const data = (await response.json()) as GrFinderSearchResponse;
    return data;
  }

  async getBookDetails(goodreadsId: string): Promise<GrFinderBookDetails> {
    const baseUrl = this.getBaseUrl();
    if (!baseUrl) {
      throw new Error('GR_FINDER_URL is not configured');
    }

    const url = `${baseUrl}/book/${goodreadsId}`;

    this.logger.debug(`Fetching Goodreads book details: ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      this.logger.error(
        `Goodreads Finder book details failed: ${response.status} - ${errorText}`,
      );
      throw new Error(`Failed to fetch book details: ${response.statusText}`);
    }

    const data = await response.json();
    this.logger.debug(
      `Goodreads book details raw response: ${JSON.stringify(data)}`,
    );
    return data as GrFinderBookDetails;
  }

  async linkMediaToGoodreads(
    mediaType: MediaType,
    mediaId: string,
    goodreadsId: string,
  ) {
    // Verify gr-finder is configured
    if (!this.isConfigured()) {
      throw new Error('Goodreads Finder is not configured');
    }

    // Verify the media exists
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

    // Fetch full book details from gr-finder
    const bookDetails = await this.getBookDetails(goodreadsId);
    this.logger.debug(`Fetched details for Goodreads book ${goodreadsId}`);

    // Handle field name variations from the API:
    const ratingsCount = bookDetails.rating_count ?? null;

    this.logger.debug(
      `Goodreads rating_count: ${bookDetails.rating_count}, ratings_count: ${bookDetails.rating}, resolved: ${ratingsCount}`,
    );

    // Create the book input from fetched details
    // Use the goodreadsId parameter since the API might not return it in the response
    const bookInput: GoodreadsBookInput = {
      goodreads_id: goodreadsId,
      title: bookDetails.title,
      author: bookDetails.author,
      cover_url: bookDetails.cover_url,
      url:
        bookDetails.url ?? `https://www.goodreads.com/book/show/${goodreadsId}`,
      description: bookDetails.description,
      genres: bookDetails.genres,
      ratings_count: ratingsCount,
      rating: bookDetails.rating,
    };

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

  private async findOrCreateGoodreadsBook(book: GoodreadsBookInput) {
    const normalizedAuthor =
      splitPersonNames(book.author).join(', ') || book.author.trim();

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
          title: book.title,
          author: normalizedAuthor,
          description: book.description ?? existing.description,
          coverUrl: book.cover_url ?? existing.coverUrl,
          url: book.url,
          rating: rating?.toString() ?? existing.rating,
          ratingsCount: book.ratings_count ?? existing.ratingsCount,
          genres: book.genres ?? existing.genres,
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
        title: book.title,
        author: normalizedAuthor,
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
