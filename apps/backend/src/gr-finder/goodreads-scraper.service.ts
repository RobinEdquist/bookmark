import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as cheerio from 'cheerio';
import type { Browser } from 'playwright';

const GOODREADS_BASE_URL = 'https://www.goodreads.com';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface ScrapedSearchResult {
  title: string;
  author: string;
  goodreads_id: string;
  cover_url: string | null;
  avg_rating: string | null;
  url: string;
}

export interface ScrapedBookDetails {
  title: string;
  author: string;
  cover_url: string | null;
  rating: number | null;
  rating_count: number | null;
  genres: string[];
  description: string | null;
  series: string | null;
  series_number: string | null;
}

interface AutoCompleteEntry {
  title?: string;
  bookTitleBare?: string;
  bookUrl?: string;
  bookId?: string | number;
  author?: { name?: string } | null;
  imageUrl?: string;
  avgRating?: string | number;
}

/**
 * Scrapes book data directly from Goodreads.
 *
 * Search uses the auto_complete JSON endpoint (the same one powering the
 * site's search box) — it is not behind the AWS WAF challenge that blocks
 * the HTML /search page. Book detail pages ARE behind the WAF JS challenge,
 * so they are rendered in a shared headless Chromium (Playwright) before
 * being parsed with cheerio.
 */
@Injectable()
export class GoodreadsScraperService implements OnModuleDestroy {
  private readonly logger = new Logger(GoodreadsScraperService.name);
  private browserPromise: Promise<Browser> | null = null;

  async searchBooks(query: string): Promise<ScrapedSearchResult[]> {
    const params = new URLSearchParams({ format: 'json', q: query });
    const response = await fetch(
      `${GOODREADS_BASE_URL}/book/auto_complete?${params.toString()}`,
      {
        // The AWS WAF in front of Goodreads answers plain requests to this
        // endpoint with an empty 202 challenge; it only serves JSON when the
        // request looks like the site's own search-box XHR.
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
          Referer: `${GOODREADS_BASE_URL}/`,
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(30_000),
      },
    );

    // 202 is the WAF challenge (empty body), not a real result set — treat
    // anything but a plain 200 as a failed search instead of "0 results".
    if (response.status !== 200) {
      throw new Error(`Goodreads search failed with status ${response.status}`);
    }

    let entries: unknown;
    try {
      entries = await response.json();
    } catch {
      this.logger.warn(
        `Goodreads auto_complete returned a non-JSON body for query "${query}"`,
      );
      return [];
    }

    if (!Array.isArray(entries)) {
      return [];
    }

    const results: ScrapedSearchResult[] = [];
    for (const entry of entries as AutoCompleteEntry[]) {
      try {
        const bookUrl = entry.bookUrl ?? '';
        let goodreadsId = '';
        if (bookUrl.includes('/book/show/')) {
          goodreadsId = bookUrl.split('/book/show/')[1]!.split('?')[0]!;
        } else if (entry.bookId) {
          goodreadsId = String(entry.bookId);
        }

        const authorName =
          (typeof entry.author === 'object' && entry.author?.name) || 'Unknown';

        results.push({
          title: entry.title || entry.bookTitleBare || 'Unknown',
          author: authorName,
          goodreads_id: goodreadsId,
          cover_url: entry.imageUrl ?? null,
          avg_rating:
            entry.avgRating !== undefined && entry.avgRating !== null
              ? String(entry.avgRating)
              : null,
          url: bookUrl.startsWith('/')
            ? `${GOODREADS_BASE_URL}${bookUrl}`
            : bookUrl || '',
        });
      } catch {
        continue;
      }
    }

    return results;
  }

  async getBookDetails(bookId: string): Promise<ScrapedBookDetails | null> {
    const html = await this.fetchBookHtml(bookId);
    if (!html) {
      return null;
    }
    return this.parseBookDetails(html);
  }

  /**
   * Parses a rendered Goodreads book page. Kept separate from the browser
   * plumbing so it can be unit-tested against HTML fixtures.
   */
  parseBookDetails(html: string): ScrapedBookDetails {
    const $ = cheerio.load(html);

    const title = $('h1.Text__title1').first().text().trim() || 'Unknown';
    const author =
      $('span.ContributorLink__name').first().text().trim() || 'Unknown';
    const coverUrl = $('img.ResponsiveImage').first().attr('src') ?? null;

    let rating: number | null = null;
    const ratingText = $('div.RatingStatistics__rating').first().text().trim();
    if (ratingText) {
      const parsed = Number.parseFloat(ratingText);
      if (!Number.isNaN(parsed)) {
        rating = parsed;
      }
    }

    let ratingCount: number | null = null;
    const ratingCountText = $("span[data-testid='ratingsCount']")
      .first()
      .text()
      .trim();
    const countMatch = ratingCountText.match(/([\d,]+)/);
    if (countMatch) {
      const parsed = Number.parseInt(countMatch[1]!.replace(/,/g, ''), 10);
      if (!Number.isNaN(parsed)) {
        ratingCount = parsed;
      }
    }

    const genres: string[] = [];
    $('span.BookPageMetadataSection__genreButton a.Button--tag').each(
      (_, el) => {
        const genreText = $(el).text().trim();
        if (genreText) {
          genres.push(genreText);
        }
      },
    );

    if (genres.length === 0) {
      const seen = new Set<string>();
      $("a[href*='/genres/']").each((_, el) => {
        const genreText = $(el).text().trim();
        if (genreText && !seen.has(genreText) && genreText.length < 50) {
          genres.push(genreText);
          seen.add(genreText);
        }
      });
    }

    const descriptionText = $(
      'div.DetailsLayoutRightParagraph__widthConstrained span.Formatted',
    )
      .first()
      .text()
      .trim();
    const description = descriptionText || null;

    let series: string | null = null;
    let seriesNumber: string | null = null;
    const seriesText = $("a[href*='/series/']").first().text().trim();
    if (seriesText) {
      const hashIndex = seriesText.indexOf('#');
      if (hashIndex !== -1) {
        series = seriesText.slice(0, hashIndex).trim() || null;
        seriesNumber = seriesText.slice(hashIndex + 1).trim() || null;
      } else {
        series = seriesText;
      }
    }

    return {
      title,
      author,
      cover_url: coverUrl,
      rating,
      rating_count: ratingCount,
      genres: genres.slice(0, 10),
      description,
      series,
      series_number: seriesNumber,
    };
  }

  private async fetchBookHtml(bookId: string): Promise<string | null> {
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      locale: 'en-US',
      viewport: { width: 1280, height: 800 },
    });
    try {
      const page = await context.newPage();
      const url = `${GOODREADS_BASE_URL}/book/show/${bookId}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      // Wait for actual book content to render after the WAF challenge.
      try {
        await page.waitForSelector('h1.Text__title1', { timeout: 20_000 });
      } catch {
        // Fall through with whatever HTML we have; parsing will detect failure.
      }
      return await page.content();
    } finally {
      await context.close();
    }
  }

  private getBrowser(): Promise<Browser> {
    // Relaunch if a previous browser died (e.g. Chromium crashed).
    this.browserPromise ??= (async () => {
      const { chromium } = await import('playwright');
      try {
        return await chromium.launch({ headless: true });
      } catch (error) {
        this.browserPromise = null;
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to launch headless Chromium: ${message}`);
        throw new Error(
          'Failed to launch the headless browser used for Goodreads lookups. ' +
            'If running outside Docker, install it with ' +
            '"pnpm exec playwright install chromium".',
          { cause: error },
        );
      }
    })();

    return this.browserPromise.then((browser) => {
      if (!browser.isConnected()) {
        this.browserPromise = null;
        return this.getBrowser();
      }
      return browser;
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.browserPromise) {
      const pending = this.browserPromise;
      this.browserPromise = null;
      try {
        const browser = await pending;
        await browser.close();
      } catch {
        // Browser never launched or already gone — nothing to clean up.
      }
    }
  }
}
