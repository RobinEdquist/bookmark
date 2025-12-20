import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  AudibleSearchResponse,
  AudibleSearchResult,
} from './types/audible-search.types';
import {
  AudnexusChapterResponse,
  ChaptersResponse,
  ChapterData,
} from './types/audnexus-chapters.types';
import { SupportedRegion } from './dto/search-audible.dto';

const AUDNEXUS_BASE_URL = 'https://api.audnex.us';
const AUDIBLE_API_BASE_URL = 'https://api.audible.com';

// Map of regions to Audible TLDs
const REGION_TO_TLD: Record<SupportedRegion, string> = {
  us: 'com',
  ca: 'ca',
  uk: 'co.uk',
  au: 'com.au',
  fr: 'fr',
  de: 'de',
  jp: 'co.jp',
  it: 'it',
  in: 'in',
  es: 'es',
};

@Injectable()
export class AudnexusService {
  private readonly logger = new Logger(AudnexusService.name);
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
   * Search Audible catalog by title and optionally author
   */
  async searchAudible(
    title: string,
    author?: string,
    region: SupportedRegion = 'us',
  ): Promise<AudibleSearchResult[]> {
    await this.throttle();

    const tld = REGION_TO_TLD[region];
    const baseUrl =
      region === 'us' ? AUDIBLE_API_BASE_URL : `https://api.audible.${tld}`;

    const params = new URLSearchParams({
      title: title,
      num_results: '20',
      products_sort_by: 'Relevance',
      response_groups: 'product_desc,product_attrs,contributors,media',
    });

    if (author) {
      params.set('author', author);
    }

    const url = `${baseUrl}/1.0/catalog/products?${params.toString()}`;

    try {
      this.logger.debug(`Searching Audible: ${url}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Bookmark/1.0',
        },
      });

      if (!response.ok) {
        if (response.status === 429) {
          this.logger.warn('Audible API rate limit reached');
          throw new Error('Rate limit exceeded. Please try again later.');
        }
        throw new Error(`Audible API error: ${response.status}`);
      }

      const data = (await response.json()) as AudibleSearchResponse;

      return (data.products || []).map((product) => ({
        asin: product.asin,
        title: product.title,
        subtitle: product.subtitle,
        authors: product.authors?.map((a) => a.name) || [],
        narrators: product.narrators?.map((n) => n.name) || [],
        coverUrl:
          product.product_images?.['500'] || product.product_images?.['1024'],
        durationMinutes: product.runtime_length_min,
        releaseDate: product.release_date,
        language: product.language,
        publisher: product.publisher_name,
      }));
    } catch (error) {
      this.logger.error(
        `Failed to search Audible: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Fetch chapters from Audnexus by ASIN
   */
  async fetchChaptersByAsin(
    asin: string,
    region: SupportedRegion = 'us',
  ): Promise<ChaptersResponse> {
    await this.throttle();

    // ASIN must be uppercase for Audnexus
    const normalizedAsin = asin.toUpperCase();
    const url = `${AUDNEXUS_BASE_URL}/books/${normalizedAsin}/chapters?region=${region}`;

    try {
      this.logger.debug(`Fetching chapters from Audnexus: ${url}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Bookmark/1.0',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new NotFoundException(
            `No chapters found for ASIN: ${normalizedAsin}`,
          );
        }
        if (response.status === 429) {
          this.logger.warn('Audnexus API rate limit reached');
          throw new Error('Rate limit exceeded. Please try again later.');
        }
        throw new Error(`Audnexus API error: ${response.status}`);
      }

      const data = (await response.json()) as AudnexusChapterResponse;

      // Transform chapters to our format
      const chapters: ChapterData[] = data.chapters.map((chapter, index) => {
        const startTime = Math.round(chapter.startOffsetSec);
        const lengthSeconds = Math.round(chapter.lengthMs / 1000);
        const endTime = startTime + lengthSeconds;

        return {
          title: chapter.title || `Chapter ${index + 1}`,
          startTime,
          endTime,
          lengthSeconds,
        };
      });

      return {
        asin: data.asin,
        chapters,
        totalDuration: Math.round(data.runtimeLengthSec),
        isAccurate: data.isAccurate,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to fetch chapters from Audnexus: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }
}
