import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as cheerio from 'cheerio';
import type { Browser, BrowserContext, Page } from 'playwright';

const GOODREADS_BASE_URL = 'https://www.goodreads.com';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Placeholder written when a field genuinely has no value in the source data.
 * It is NOT a parse-failure signal — a failed parse yields `null` from
 * `parseBookDetails` — but it must never be persisted over real metadata.
 */
export const UNKNOWN_PLACEHOLDER = 'Unknown';

/**
 * Present only once the real book page has rendered, so it doubles as the
 * "did the WAF challenge clear?" marker.
 */
const BOOK_TITLE_SELECTOR = 'h1.Text__title1';

/** Book-page loads to attempt before giving up on the WAF challenge. */
const BOOK_PAGE_ATTEMPTS = 3;

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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
 *
 * Clearing that challenge is the flaky part, so the browser context is shared
 * and warmed once (keeping the cookie the challenge issues) and each lookup
 * retries. When it still can't be cleared, `getBookDetails` returns null —
 * callers must treat that as a failure, never as an empty book.
 */
@Injectable()
export class GoodreadsScraperService implements OnModuleDestroy {
  private readonly logger = new Logger(GoodreadsScraperService.name);
  private browserPromise: Promise<Browser> | null = null;
  // Tracked with its owning browser so a relaunch can't leave us holding a
  // context that belongs to a dead one.
  private context: {
    browser: Browser;
    promise: Promise<BrowserContext>;
  } | null = null;

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
          (typeof entry.author === 'object' && entry.author?.name) ||
          UNKNOWN_PLACEHOLDER;

        results.push({
          title: entry.title || entry.bookTitleBare || UNKNOWN_PLACEHOLDER,
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
   * Parses a rendered Goodreads book page, or returns null if this isn't one.
   * Kept separate from the browser plumbing so it can be unit-tested against
   * HTML fixtures.
   */
  parseBookDetails(html: string): ScrapedBookDetails | null {
    const $ = cheerio.load(html);

    // No title means we were served the WAF challenge or an error shell rather
    // than a book page. Reporting that as a book whose every field is
    // "Unknown" is how failed lookups used to overwrite good metadata.
    const title = $(BOOK_TITLE_SELECTOR).first().text().trim();
    if (!title) {
      return null;
    }

    const author =
      $('span.ContributorLink__name').first().text().trim() ||
      UNKNOWN_PLACEHOLDER;
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
    const url = `${GOODREADS_BASE_URL}/book/show/${bookId}`;

    for (let attempt = 1; attempt <= BOOK_PAGE_ATTEMPTS; attempt++) {
      let page: Page | null = null;
      try {
        const context = await this.getContext();
        page = await context.newPage();
        const response = await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 30_000,
        });

        // A real 404 won't turn into a book page no matter how often we ask.
        if (response?.status() === 404) {
          this.logger.warn(`Goodreads book page does not exist: ${url}`);
          return null;
        }

        // Wait for actual book content to render after the WAF challenge.
        await page.waitForSelector(BOOK_TITLE_SELECTOR, { timeout: 20_000 });
        return await page.content();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Goodreads book page did not render (attempt ${attempt}/${BOOK_PAGE_ATTEMPTS}) for ${url}: ${message}`,
        );
        if (attempt < BOOK_PAGE_ATTEMPTS) {
          // The challenge often clears on a retry because the cookie it set is
          // kept by the shared context.
          await delay(attempt * 1_000);
        }
      } finally {
        await page?.close().catch(() => undefined);
      }
    }

    this.logger.warn(
      `Giving up on Goodreads book page after ${BOOK_PAGE_ATTEMPTS} attempts: ${url}`,
    );
    return null;
  }

  /**
   * One long-lived browser context shared by all lookups, so the cookie the
   * WAF hands out after its JS challenge is reused instead of every lookup
   * having to solve the challenge from scratch.
   */
  private async getContext(): Promise<BrowserContext> {
    const browser = await this.getBrowser();

    if (this.context && this.context.browser !== browser) {
      this.context = null;
    }

    if (!this.context) {
      const promise = (async () => {
        const context = await browser.newContext({
          userAgent: USER_AGENT,
          locale: 'en-US',
          viewport: { width: 1280, height: 800 },
        });
        context.on('close', () => this.forgetContext(promise));
        await this.warmUp(context);
        return context;
      })();
      promise.catch(() => this.forgetContext(promise));
      this.context = { browser, promise };
    }

    return this.context.promise;
  }

  private forgetContext(promise: Promise<BrowserContext>): void {
    if (this.context?.promise === promise) {
      this.context = null;
    }
  }

  /**
   * Clears the WAF challenge once on the landing page, so the first book
   * lookup after startup isn't the one that has to pay for it.
   */
  private async warmUp(context: BrowserContext): Promise<void> {
    let page: Page | null = null;
    try {
      page = await context.newPage();
      await page.goto(GOODREADS_BASE_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Goodreads warm-up navigation failed: ${message}`);
    } finally {
      await page?.close().catch(() => undefined);
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
      this.context = null;
      try {
        const browser = await pending;
        await browser.close();
      } catch {
        // Browser never launched or already gone — nothing to clean up.
      }
    }
  }
}
