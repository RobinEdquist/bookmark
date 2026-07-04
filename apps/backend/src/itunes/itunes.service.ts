import { Injectable, Logger } from '@nestjs/common';
import {
  ItunesRawResult,
  ItunesSearchResponse,
  ItunesSearchResult,
} from './types/itunes-search.types';
import { ItunesMediaType } from './dto/search-itunes.dto';

const ITUNES_API_BASE_URL = 'https://itunes.apple.com';

@Injectable()
export class ItunesService {
  private readonly logger = new Logger(ItunesService.name);
  private lastRequestTime = 0;
  private readonly MIN_REQUEST_INTERVAL = 150; // 150ms between requests

  /**
   * Rate limiting helper - ensures 150ms between requests
   */
  private async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.MIN_REQUEST_INTERVAL) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.MIN_REQUEST_INTERVAL - elapsed),
      );
    }
    this.lastRequestTime = Date.now();
  }

  /**
   * Search the iTunes Store catalog for audiobooks or ebooks
   */
  async search(
    term: string,
    media: ItunesMediaType = 'audiobook',
    country = 'US',
  ): Promise<ItunesSearchResult[]> {
    await this.throttle();

    const params = new URLSearchParams({
      term,
      media,
      entity: media,
      limit: '20',
      country,
    });

    const url = `${ITUNES_API_BASE_URL}/search?${params.toString()}`;

    try {
      this.logger.debug(`Searching iTunes: ${url}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Bookmark/1.0',
        },
      });

      if (!response.ok) {
        if (response.status === 429 || response.status === 403) {
          this.logger.warn('iTunes API rate limit reached');
          throw new Error('Rate limit exceeded. Please try again later.');
        }
        throw new Error(`iTunes API error: ${response.status}`);
      }

      const data = (await response.json()) as ItunesSearchResponse;

      return (data.results || [])
        .map((result) => this.mapResult(result, media))
        .filter((result): result is ItunesSearchResult => result !== null);
    } catch (error) {
      this.logger.error(
        `Failed to search iTunes: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  private mapResult(
    result: ItunesRawResult,
    media: ItunesMediaType,
  ): ItunesSearchResult | null {
    // Audiobooks are collections (collectionName), ebooks are tracks (trackName)
    // iTunes appends "(Unabridged)" to audiobook titles — not part of the title
    const title = (
      media === 'ebook'
        ? (result.trackName ?? result.collectionName)
        : (result.collectionName ?? result.trackName)
    )?.replace(/\s*\(unabridged\)\s*$/i, '');
    const id =
      media === 'ebook'
        ? (result.trackId ?? result.collectionId)
        : (result.collectionId ?? result.trackId);

    if (!title || id === undefined) {
      return null;
    }

    // Ebook results carry a genres array (including the generic "Books" entry);
    // audiobook results only have primaryGenreName
    const genres = (
      result.genres?.length
        ? result.genres
        : result.primaryGenreName
          ? [result.primaryGenreName]
          : []
    ).filter((genre) => genre !== 'Books');

    return {
      id,
      title,
      author: result.artistName,
      description: result.description,
      genres,
      releaseDate: result.releaseDate,
      coverUrl: this.getCoverUrl(result),
    };
  }

  /**
   * iTunes returns 100x100 thumbnails; the CDN serves larger sizes when the
   * dimension segment in the URL is rewritten
   */
  private getCoverUrl(result: ItunesRawResult): string | undefined {
    if (result.artworkUrl600) {
      return result.artworkUrl600;
    }
    if (result.artworkUrl100) {
      return result.artworkUrl100.replace('100x100bb', '600x600bb');
    }
    return undefined;
  }
}
