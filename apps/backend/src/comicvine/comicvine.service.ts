import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, asc, and, isNull, or, inArray, sql } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as appSettingsSchema from '../app-settings/schema';
import * as comicvineSchema from './schema';
import * as comicsSchema from '../comics/schema';
import { ComicVineApiClient, ComicVineApiError } from './comicvine-api.client';
import {
  pickAutoMatch,
  type LocalSeries,
  type CandidateVolume,
} from './utils/match-confidence';
import { AppEventsService } from '../events/app-events.service';
import { WsEventsService } from '../events/ws-events.service';
import type {
  CvVolumeRaw,
  CvIssueRaw,
  CachedVolume,
  CachedIssue,
  QueueItemDto,
  MatchOutcome,
} from './dto/comicvine.dto';

// ---------------------------------------------------------------------------
// Combined schema type
// ---------------------------------------------------------------------------
type CombinedSchema = typeof appSettingsSchema &
  typeof comicvineSchema &
  typeof comicsSchema;

// ---------------------------------------------------------------------------
// ComicvineService
// ---------------------------------------------------------------------------

@Injectable()
export class ComicvineService {
  private readonly logger = new Logger(ComicvineService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: NodePgDatabase<CombinedSchema>,
    private appEvents: AppEventsService,
    private wsEvents: WsEventsService,
  ) {}

  // =========================================================================
  // Client factory — override in tests by subclassing or using jest.spyOn
  // =========================================================================

  /**
   * Creates a ComicVineApiClient for the given API key.
   * Extracted into its own method so tests can override it with a fake client
   * (mirror of HardcoverService.createClient pattern).
   */
  protected createClient(apiKey: string): ComicVineApiClient {
    return new ComicVineApiClient(apiKey);
  }

  private async getClient(): Promise<ComicVineApiClient | null> {
    const apiKey = await this.getApiKey();
    if (!apiKey) return null;
    return this.createClient(apiKey);
  }

  // =========================================================================
  // Key / flags
  // =========================================================================

  async getApiKey(): Promise<string | null> {
    const settings = await this.db
      .select({
        comicvineApiKey: appSettingsSchema.appSettings.comicvineApiKey,
      })
      .from(appSettingsSchema.appSettings)
      .where(eq(appSettingsSchema.appSettings.id, 'app_settings'))
      .limit(1);

    return settings[0]?.comicvineApiKey ?? null;
  }

  async setApiKey(apiKey: string | null): Promise<void> {
    await this.db
      .update(appSettingsSchema.appSettings)
      .set({ comicvineApiKey: apiKey })
      .where(eq(appSettingsSchema.appSettings.id, 'app_settings'));
  }

  async getAutoSyncOnImport(): Promise<boolean> {
    const settings = await this.db
      .select({
        autoSyncOnImport:
          appSettingsSchema.appSettings.comicvineAutoSyncOnImport,
      })
      .from(appSettingsSchema.appSettings)
      .where(eq(appSettingsSchema.appSettings.id, 'app_settings'))
      .limit(1);

    return settings[0]?.autoSyncOnImport ?? false;
  }

  async setAutoSyncOnImport(enabled: boolean): Promise<void> {
    await this.db
      .update(appSettingsSchema.appSettings)
      .set({ comicvineAutoSyncOnImport: enabled })
      .where(eq(appSettingsSchema.appSettings.id, 'app_settings'));
  }

  /**
   * Validate an API key by making a cheap test call.
   * Error code 100 → invalid key. Rate-limit errors → returned as error.
   */
  async validateApiKey(
    apiKey: string,
  ): Promise<{ valid: boolean; error?: string }> {
    const client = this.createClient(apiKey);
    this.logger.log('Validating ComicVine API key');
    const startTime = Date.now();

    try {
      await client.searchVolumes('batman', { page: 1, limit: 1 });
      const duration = Date.now() - startTime;
      this.logger.log(`API key validation successful (${duration}ms)`);
      return { valid: true };
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      if (error instanceof ComicVineApiError) {
        if (error.code === 100) {
          this.logger.warn(
            `API key validation failed: Invalid API key (code 100) (${duration}ms)`,
          );
          return { valid: false, error: 'Invalid API key' };
        }
        if (error.rateLimited) {
          this.logger.warn(
            `API key validation failed: Rate limited (${duration}ms)`,
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
      if (error instanceof Error) {
        this.logger.error(
          `API key validation failed: ${error.message} (${duration}ms)`,
        );
        return { valid: false, error: error.message };
      }
      this.logger.error(
        `API key validation failed: Unknown error (${duration}ms)`,
      );
      return { valid: false, error: 'Failed to connect to ComicVine' };
    }
  }

  // =========================================================================
  // Cache upserts
  // =========================================================================

  /**
   * Find-or-update a comicvine_volumes row by ComicVine id.
   * Maps raw CV fields to our schema, sets syncedAt = now.
   */
  async upsertVolume(cv: CvVolumeRaw): Promise<CachedVolume> {
    const parsedYear =
      cv.start_year != null ? parseInt(String(cv.start_year), 10) : null;
    const startYear =
      parsedYear != null && !isNaN(parsedYear) ? parsedYear : null;

    // Single round-trip upsert keyed on the unique comicvine_volume_id index.
    const values = {
      name: cv.name,
      startYear,
      publisherName: cv.publisher?.name ?? null,
      countOfIssues: cv.count_of_issues ?? null,
      description: cv.description ?? null,
      imageUrl: cv.image?.medium_url ?? null,
      siteDetailUrl: cv.site_detail_url ?? null,
      syncedAt: new Date(),
    };

    const [row] = await this.db
      .insert(comicvineSchema.comicvineVolumes)
      .values({ comicvineVolumeId: cv.id, ...values })
      .onConflictDoUpdate({
        target: comicvineSchema.comicvineVolumes.comicvineVolumeId,
        set: values,
      })
      .returning();

    return row as CachedVolume;
  }

  /**
   * Find-or-update a comicvine_issues row by ComicVine id.
   */
  async upsertIssue(cv: CvIssueRaw): Promise<CachedIssue> {
    const personCredits = (cv.person_credits ?? []).map((p) => ({
      name: p.name,
      role: p.role,
    }));
    const characterCredits = (cv.character_credits ?? []).map((c) => c.name);
    const storyArcCredits = (cv.story_arc_credits ?? []).map((s) => s.name);

    // Single round-trip upsert keyed on the unique comicvine_issue_id index.
    const values = {
      comicvineVolumeId: cv.volume?.id ?? null,
      issueNumber: cv.issue_number ?? null,
      name: cv.name ?? null,
      coverDate: cv.cover_date ?? null,
      storeDate: cv.store_date ?? null,
      description: cv.description ?? null,
      imageUrl: cv.image?.medium_url ?? null,
      siteDetailUrl: cv.site_detail_url ?? null,
      personCredits,
      characterCredits,
      storyArcCredits,
      syncedAt: new Date(),
    };

    const [row] = await this.db
      .insert(comicvineSchema.comicvineIssues)
      .values({ comicvineIssueId: cv.id, ...values })
      .onConflictDoUpdate({
        target: comicvineSchema.comicvineIssues.comicvineIssueId,
        set: values,
      })
      .returning();

    return row as CachedIssue;
  }

  // =========================================================================
  // Search / browse
  // =========================================================================

  async searchVolumes(
    query: string,
    page: number = 1,
  ): Promise<{ totalResults: number; results: CvVolumeRaw[] }> {
    const client = await this.getClient();
    if (!client) {
      return { totalResults: 0, results: [] };
    }

    const result = await client.searchVolumes(query, { page, limit: 20 });
    return {
      totalResults: result.totalResults,
      results: result.results as CvVolumeRaw[],
    };
  }

  /**
   * Fetch one page of issues for a volume and upsert them into the issue cache.
   * Returns the cached rows.
   */
  async getVolumeIssuesPaged(
    comicvineVolumeId: number,
    page: number = 1,
  ): Promise<{ totalResults: number; issues: CachedIssue[] }> {
    const client = await this.getClient();
    if (!client) {
      return { totalResults: 0, issues: [] };
    }

    const result = await client.getVolumeIssues(comicvineVolumeId, {
      page,
      limit: 100,
    });

    const rawIssues = result.results as CvIssueRaw[];
    const cached = await Promise.all(rawIssues.map((i) => this.upsertIssue(i)));

    return { totalResults: result.totalResults, issues: cached };
  }

  // =========================================================================
  // Matching (conservative two-level)
  // =========================================================================

  /**
   * Match a series to a ComicVine volume.
   *
   * Strategy:
   *  1. If series.comicvineVolumeId (cvinfo pin) is set → fetch that volume
   *     directly and link it (no confidence check needed — explicit pin).
   *  2. Otherwise: searchVolumes by title, run pickAutoMatch. If a single
   *     confident candidate is found → link. Otherwise → needs_review.
   *
   * Returns a MatchOutcome so the caller (processor) can update queue status
   * without needing to re-query.
   */
  async matchSeries(seriesId: string): Promise<MatchOutcome> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      return { outcome: 'no_api_key' };
    }

    const series = await this.db
      .select()
      .from(comicsSchema.comicSeries)
      .where(eq(comicsSchema.comicSeries.id, seriesId))
      .limit(1);

    if (series.length === 0) {
      throw new NotFoundException(`Series ${seriesId} not found`);
    }

    const s = series[0];

    // --- Branch 1: cvinfo pin ---
    if (s.comicvineVolumeId != null) {
      this.logger.log(
        `Series ${seriesId} has cvinfo pin ${s.comicvineVolumeId} — fetching directly`,
      );
      const client = this.createClient(apiKey);
      const volumeResult = await client.getVolume(s.comicvineVolumeId);
      const cv = volumeResult.results as CvVolumeRaw;
      await this.linkSeriesToVolume(seriesId, cv);
      return { outcome: 'linked', cvId: cv.id };
    }

    // --- Branch 2: name + year conservative match ---
    const client = this.createClient(apiKey);
    const searchResult = await client.searchVolumes(s.title, {
      page: 1,
      limit: 20,
    });
    const candidates = searchResult.results as CvVolumeRaw[];

    const localSeries: LocalSeries = {
      title: s.title,
      startYear: s.startYear ?? null,
    };

    const candidateVolumes: CandidateVolume[] = candidates.map((c) => ({
      id: c.id,
      name: c.name,
      startYear:
        c.start_year != null ? parseInt(String(c.start_year), 10) : null,
      countOfIssues: c.count_of_issues ?? null,
    }));

    const match = pickAutoMatch(localSeries, candidateVolumes);

    if (match !== null) {
      // Recover the raw candidate by ComicVine id (not the fragile name string).
      const matchedRaw = candidates.find((c) => c.id === match.id);
      if (matchedRaw) {
        await this.linkSeriesToVolume(seriesId, matchedRaw);
        return { outcome: 'linked', cvId: matchedRaw.id };
      }
    }

    // Ambiguous or no confident match → needs_review
    const reason =
      candidates.length === 0
        ? 'No search results found'
        : `${candidates.length} candidates, none auto-linkable (ambiguous or year mismatch)`;

    this.logger.log(`Series ${seriesId} needs review: ${reason}`);
    return { outcome: 'needs_review', reason };
  }

  /**
   * Match a comic book to a ComicVine issue.
   *
   * Requires the parent series to already be linked to a volume (else needs_review).
   * Pages the linked volume's issues into cache, then matches by issue_number
   * (direct normalized comparison; cover_date as tiebreak).
   */
  async matchBook(bookId: string): Promise<MatchOutcome> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      return { outcome: 'no_api_key' };
    }

    const book = await this.db
      .select()
      .from(comicsSchema.comicBooks)
      .where(eq(comicsSchema.comicBooks.id, bookId))
      .limit(1);

    if (book.length === 0) {
      throw new NotFoundException(`Book ${bookId} not found`);
    }

    const b = book[0];

    // Check parent series is linked to a volume
    const volumeLink = await this.db
      .select({
        comicvineVolumeRowId:
          comicvineSchema.comicvineVolumeLinks.comicvineVolumeRowId,
        comicvineVolumeId: comicvineSchema.comicvineVolumes.comicvineVolumeId,
      })
      .from(comicvineSchema.comicvineVolumeLinks)
      .innerJoin(
        comicvineSchema.comicvineVolumes,
        eq(
          comicvineSchema.comicvineVolumeLinks.comicvineVolumeRowId,
          comicvineSchema.comicvineVolumes.id,
        ),
      )
      .where(eq(comicvineSchema.comicvineVolumeLinks.seriesId, b.seriesId))
      .limit(1);

    if (volumeLink.length === 0) {
      return {
        outcome: 'needs_review',
        reason: 'Parent series is not linked to a ComicVine volume',
      };
    }

    const cvVolumeId = volumeLink[0].comicvineVolumeId;

    // Page all issues for this volume into cache
    let page = 1;
    let allIssues: CachedIssue[] = [];
    let totalResults = 0;

    do {
      const { issues, totalResults: total } = await this.getVolumeIssuesPaged(
        cvVolumeId,
        page,
      );
      allIssues = allIssues.concat(issues);
      totalResults = total;
      page++;
    } while (allIssues.length < totalResults && allIssues.length < 1000);

    if (allIssues.length === 0) {
      return {
        outcome: 'needs_review',
        reason: 'No issues found in linked ComicVine volume',
      };
    }

    // Match by normalized issue number
    const normalizeIssueNumber = (n: string | null | undefined): string => {
      if (n == null) return '';
      // Strip leading zeros from numeric portion, lowercase, trim
      return n
        .trim()
        .toLowerCase()
        .replace(/^0+(\d)/, '$1');
    };

    const localNumber = normalizeIssueNumber(b.number);

    const matches = allIssues.filter(
      (i) => normalizeIssueNumber(i.issueNumber) === localNumber,
    );

    if (matches.length === 0) {
      return {
        outcome: 'needs_review',
        reason: `No issue with number "${b.number}" found in volume`,
      };
    }

    // If multiple matches (edge case), use cover_date tiebreak — pick the one
    // closest to any local coverDate, or just take the first.
    let bestMatch = matches[0];
    if (matches.length > 1 && b.coverDate != null) {
      const localDate = new Date(b.coverDate).getTime();
      bestMatch = matches.reduce((best, candidate) => {
        if (candidate.coverDate == null) return best;
        if (best.coverDate == null) return candidate;
        const bestDiff = Math.abs(
          new Date(best.coverDate).getTime() - localDate,
        );
        const candDiff = Math.abs(
          new Date(candidate.coverDate).getTime() - localDate,
        );
        return candDiff < bestDiff ? candidate : best;
      });
    }

    // Build the raw issue shape needed by linkBookToIssue
    const cvIssueRaw: CvIssueRaw = {
      id: bestMatch.comicvineIssueId,
      issue_number: bestMatch.issueNumber,
      name: bestMatch.name,
      cover_date: bestMatch.coverDate,
      store_date: bestMatch.storeDate,
      description: bestMatch.description,
      image: bestMatch.imageUrl ? { medium_url: bestMatch.imageUrl } : null,
      site_detail_url: bestMatch.siteDetailUrl,
      person_credits: bestMatch.personCredits,
      character_credits: bestMatch.characterCredits.map((name) => ({ name })),
      story_arc_credits: bestMatch.storyArcCredits.map((name) => ({ name })),
      volume: { id: cvVolumeId, name: '' },
    };

    await this.linkBookToIssue(bookId, cvIssueRaw);
    return { outcome: 'linked', cvId: bestMatch.comicvineIssueId };
  }

  // =========================================================================
  // Link / Unlink (series ↔ volume)
  // =========================================================================

  async linkSeriesToVolume(
    seriesId: string,
    cvVolume: CvVolumeRaw,
  ): Promise<CachedVolume> {
    // Upsert the volume into cache
    const cachedVolume = await this.upsertVolume(cvVolume);

    // Delete any existing link for this series (one-to-one)
    await this.db
      .delete(comicvineSchema.comicvineVolumeLinks)
      .where(eq(comicvineSchema.comicvineVolumeLinks.seriesId, seriesId));

    // Insert the new link
    await this.db.insert(comicvineSchema.comicvineVolumeLinks).values({
      seriesId,
      comicvineVolumeRowId: cachedVolume.id,
    });

    // Set the comicvineVolumeId pin on the series row
    await this.db
      .update(comicsSchema.comicSeries)
      .set({ comicvineVolumeId: cvVolume.id })
      .where(eq(comicsSchema.comicSeries.id, seriesId));

    this.appEvents.comicvineSyncCompleted('series', seriesId);

    this.logger.log(
      `Linked series ${seriesId} to ComicVine volume ${cvVolume.id} (${cvVolume.name})`,
    );

    return cachedVolume;
  }

  async unlinkSeries(seriesId: string): Promise<void> {
    await this.db
      .delete(comicvineSchema.comicvineVolumeLinks)
      .where(eq(comicvineSchema.comicvineVolumeLinks.seriesId, seriesId));

    // Clear the pin on the series row
    await this.db
      .update(comicsSchema.comicSeries)
      .set({ comicvineVolumeId: null })
      .where(eq(comicsSchema.comicSeries.id, seriesId));

    this.appEvents.comicSeriesUpdated(seriesId);

    this.logger.log(`Unlinked series ${seriesId} from ComicVine`);
  }

  async getSeriesLink(seriesId: string): Promise<CachedVolume | null> {
    const link = await this.db
      .select({ volume: comicvineSchema.comicvineVolumes })
      .from(comicvineSchema.comicvineVolumeLinks)
      .innerJoin(
        comicvineSchema.comicvineVolumes,
        eq(
          comicvineSchema.comicvineVolumeLinks.comicvineVolumeRowId,
          comicvineSchema.comicvineVolumes.id,
        ),
      )
      .where(eq(comicvineSchema.comicvineVolumeLinks.seriesId, seriesId))
      .limit(1);

    return (link[0]?.volume as CachedVolume) ?? null;
  }

  // =========================================================================
  // Link / Unlink (book ↔ issue)
  // =========================================================================

  async linkBookToIssue(
    bookId: string,
    cvIssue: CvIssueRaw,
  ): Promise<CachedIssue> {
    // Upsert the issue into cache
    const cachedIssue = await this.upsertIssue(cvIssue);

    // Delete any existing link for this book (one-to-one)
    await this.db
      .delete(comicvineSchema.comicvineIssueLinks)
      .where(eq(comicvineSchema.comicvineIssueLinks.bookId, bookId));

    // Insert the new link
    await this.db.insert(comicvineSchema.comicvineIssueLinks).values({
      bookId,
      comicvineIssueRowId: cachedIssue.id,
    });

    // Set the comicvineIssueId pin on the book row
    await this.db
      .update(comicsSchema.comicBooks)
      .set({ comicvineIssueId: cvIssue.id })
      .where(eq(comicsSchema.comicBooks.id, bookId));

    this.appEvents.comicvineSyncCompleted('book', bookId);

    this.logger.log(
      `Linked book ${bookId} to ComicVine issue ${cvIssue.id} (#${cvIssue.issue_number})`,
    );

    return cachedIssue;
  }

  async unlinkBook(bookId: string): Promise<void> {
    await this.db
      .delete(comicvineSchema.comicvineIssueLinks)
      .where(eq(comicvineSchema.comicvineIssueLinks.bookId, bookId));

    // Clear the pin on the book row
    await this.db
      .update(comicsSchema.comicBooks)
      .set({ comicvineIssueId: null })
      .where(eq(comicsSchema.comicBooks.id, bookId));

    // Symmetric with unlinkSeries: signal the detail page to refetch.
    this.wsEvents.comicBookUpdated(bookId);

    this.logger.log(`Unlinked book ${bookId} from ComicVine`);
  }

  async getBookLink(bookId: string): Promise<CachedIssue | null> {
    const link = await this.db
      .select({ issue: comicvineSchema.comicvineIssues })
      .from(comicvineSchema.comicvineIssueLinks)
      .innerJoin(
        comicvineSchema.comicvineIssues,
        eq(
          comicvineSchema.comicvineIssueLinks.comicvineIssueRowId,
          comicvineSchema.comicvineIssues.id,
        ),
      )
      .where(eq(comicvineSchema.comicvineIssueLinks.bookId, bookId))
      .limit(1);

    return (link[0]?.issue as CachedIssue) ?? null;
  }

  // =========================================================================
  // Sync Queue (mirror HardcoverService exactly, adapted for level + two IDs)
  // =========================================================================

  /**
   * Add a series or book to the sync queue.
   * Skips if: already in queue (any status) OR already linked.
   *
   * @returns `true` only when a row was actually inserted; `false` when the
   *   item was skipped (already queued/linked). Callers (e.g.
   *   queueAllUnlinkedSeries) rely on this to count only real insertions.
   */
  async addToSyncQueue(level: 'series' | 'book', id: string): Promise<boolean> {
    if (level === 'series') {
      const [existingQueue, existingLink] = await Promise.all([
        this.db
          .select({ id: comicvineSchema.comicvineSyncQueue.id })
          .from(comicvineSchema.comicvineSyncQueue)
          .where(eq(comicvineSchema.comicvineSyncQueue.seriesId, id))
          .limit(1),
        this.db
          .select({
            seriesId: comicvineSchema.comicvineVolumeLinks.seriesId,
          })
          .from(comicvineSchema.comicvineVolumeLinks)
          .where(eq(comicvineSchema.comicvineVolumeLinks.seriesId, id))
          .limit(1),
      ]);

      if (existingQueue.length > 0 || existingLink.length > 0) {
        this.logger.debug(`Series ${id} already in queue or linked, skipping`);
        return false;
      }

      await this.db.insert(comicvineSchema.comicvineSyncQueue).values({
        level: 'series',
        seriesId: id,
        status: 'pending',
      });
    } else {
      const [existingQueue, existingLink] = await Promise.all([
        this.db
          .select({ id: comicvineSchema.comicvineSyncQueue.id })
          .from(comicvineSchema.comicvineSyncQueue)
          .where(eq(comicvineSchema.comicvineSyncQueue.bookId, id))
          .limit(1),
        this.db
          .select({ bookId: comicvineSchema.comicvineIssueLinks.bookId })
          .from(comicvineSchema.comicvineIssueLinks)
          .where(eq(comicvineSchema.comicvineIssueLinks.bookId, id))
          .limit(1),
      ]);

      if (existingQueue.length > 0 || existingLink.length > 0) {
        this.logger.debug(`Book ${id} already in queue or linked, skipping`);
        return false;
      }

      await this.db.insert(comicvineSchema.comicvineSyncQueue).values({
        level: 'book',
        bookId: id,
        status: 'pending',
      });
    }

    this.logger.log(`Added ${level} ${id} to ComicVine sync queue`);
    this.emitComicvineSyncStatus();
    return true;
  }

  async getNextPending(): Promise<
    typeof comicvineSchema.comicvineSyncQueue.$inferSelect | null
  > {
    const items = await this.db
      .select()
      .from(comicvineSchema.comicvineSyncQueue)
      .where(eq(comicvineSchema.comicvineSyncQueue.status, 'pending'))
      .orderBy(asc(comicvineSchema.comicvineSyncQueue.createdAt))
      .limit(1);

    return items[0] ?? null;
  }

  async markProcessing(id: string): Promise<void> {
    await this.db
      .update(comicvineSchema.comicvineSyncQueue)
      .set({ status: 'processing' })
      .where(eq(comicvineSchema.comicvineSyncQueue.id, id));
  }

  async markFailed(id: string, errorMessage: string): Promise<void> {
    await this.db
      .update(comicvineSchema.comicvineSyncQueue)
      .set({ status: 'failed', errorMessage })
      .where(eq(comicvineSchema.comicvineSyncQueue.id, id));
  }

  async markNeedsReview(id: string, reason: string): Promise<void> {
    await this.db
      .update(comicvineSchema.comicvineSyncQueue)
      .set({ status: 'needs_review', errorMessage: reason })
      .where(eq(comicvineSchema.comicvineSyncQueue.id, id));
  }

  async removeFromQueue(id: string): Promise<void> {
    await this.db
      .delete(comicvineSchema.comicvineSyncQueue)
      .where(eq(comicvineSchema.comicvineSyncQueue.id, id));
  }

  /**
   * Returns all pending, needs_review, and failed queue items enriched with
   * the series or book title.
   */
  async getQueueItems(): Promise<QueueItemDto[]> {
    const items = await this.db
      .select({
        id: comicvineSchema.comicvineSyncQueue.id,
        level: comicvineSchema.comicvineSyncQueue.level,
        seriesId: comicvineSchema.comicvineSyncQueue.seriesId,
        bookId: comicvineSchema.comicvineSyncQueue.bookId,
        status: comicvineSchema.comicvineSyncQueue.status,
        errorMessage: comicvineSchema.comicvineSyncQueue.errorMessage,
        createdAt: comicvineSchema.comicvineSyncQueue.createdAt,
      })
      .from(comicvineSchema.comicvineSyncQueue)
      .where(
        or(
          eq(comicvineSchema.comicvineSyncQueue.status, 'pending'),
          eq(comicvineSchema.comicvineSyncQueue.status, 'needs_review'),
          eq(comicvineSchema.comicvineSyncQueue.status, 'failed'),
        ),
      )
      .orderBy(asc(comicvineSchema.comicvineSyncQueue.createdAt));

    const result = await Promise.all(
      items.map(async (item) => {
        let title: string | null = null;

        if (item.level === 'series' && item.seriesId) {
          const series = await this.db
            .select({ title: comicsSchema.comicSeries.title })
            .from(comicsSchema.comicSeries)
            .where(eq(comicsSchema.comicSeries.id, item.seriesId))
            .limit(1);

          title = series[0]?.title ?? null;
        } else if (item.level === 'book' && item.bookId) {
          const bookRow = await this.db
            .select({ title: comicsSchema.comicBooks.title })
            .from(comicsSchema.comicBooks)
            .where(eq(comicsSchema.comicBooks.id, item.bookId))
            .limit(1);

          title = bookRow[0]?.title ?? null;
        }

        return {
          id: item.id,
          level: item.level,
          seriesId: item.seriesId,
          bookId: item.bookId,
          status: item.status,
          errorMessage: item.errorMessage,
          createdAt: item.createdAt,
          title,
        };
      }),
    );

    return result;
  }

  async getPendingCount(): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(comicvineSchema.comicvineSyncQueue)
      .where(eq(comicvineSchema.comicvineSyncQueue.status, 'pending'));

    return Number(row?.count ?? 0);
  }

  async dismissItem(id: string): Promise<void> {
    await this.db
      .delete(comicvineSchema.comicvineSyncQueue)
      .where(
        and(
          eq(comicvineSchema.comicvineSyncQueue.id, id),
          or(
            eq(comicvineSchema.comicvineSyncQueue.status, 'failed'),
            eq(comicvineSchema.comicvineSyncQueue.status, 'needs_review'),
          ),
        ),
      );
  }

  /**
   * Queue all series that have no ComicVine volume link.
   * Requires an API key to be configured.
   */
  async queueAllUnlinkedSeries(): Promise<number> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new BadRequestException('ComicVine API key not configured');
    }

    const unlinked = await this.db
      .select({ id: comicsSchema.comicSeries.id })
      .from(comicsSchema.comicSeries)
      .leftJoin(
        comicvineSchema.comicvineVolumeLinks,
        eq(
          comicsSchema.comicSeries.id,
          comicvineSchema.comicvineVolumeLinks.seriesId,
        ),
      )
      .where(isNull(comicvineSchema.comicvineVolumeLinks.seriesId));

    const unlinkedIds = unlinked.map((r) => r.id);

    let queuedCount = 0;
    for (const id of unlinkedIds) {
      // addToSyncQueue returns false when it skips (already queued/linked);
      // only count the rows it actually inserted.
      const inserted = await this.addToSyncQueue('series', id);
      if (inserted) queuedCount++;
    }

    this.logger.log(`Queued ${queuedCount} unlinked series for ComicVine sync`);

    return queuedCount;
  }

  // =========================================================================
  // Cleanup
  // =========================================================================

  /**
   * Delete cache rows (volumes + issues) that have no link to any local item.
   * Returns the number of orphaned records deleted.
   */
  async cleanupOrphanedCache(): Promise<{ volumes: number; issues: number }> {
    // Orphaned volumes: comicvine_volumes with no entry in comicvine_volume_links
    const orphanedVolumes = await this.db
      .select({ id: comicvineSchema.comicvineVolumes.id })
      .from(comicvineSchema.comicvineVolumes)
      .leftJoin(
        comicvineSchema.comicvineVolumeLinks,
        eq(
          comicvineSchema.comicvineVolumes.id,
          comicvineSchema.comicvineVolumeLinks.comicvineVolumeRowId,
        ),
      )
      .where(isNull(comicvineSchema.comicvineVolumeLinks.comicvineVolumeRowId));

    let deletedVolumes = 0;
    if (orphanedVolumes.length > 0) {
      const ids = orphanedVolumes.map((r) => r.id);
      await this.db
        .delete(comicvineSchema.comicvineVolumes)
        .where(inArray(comicvineSchema.comicvineVolumes.id, ids));
      deletedVolumes = ids.length;
    }

    // Orphaned issues: comicvine_issues with no entry in comicvine_issue_links
    const orphanedIssues = await this.db
      .select({ id: comicvineSchema.comicvineIssues.id })
      .from(comicvineSchema.comicvineIssues)
      .leftJoin(
        comicvineSchema.comicvineIssueLinks,
        eq(
          comicvineSchema.comicvineIssues.id,
          comicvineSchema.comicvineIssueLinks.comicvineIssueRowId,
        ),
      )
      .where(isNull(comicvineSchema.comicvineIssueLinks.comicvineIssueRowId));

    let deletedIssues = 0;
    if (orphanedIssues.length > 0) {
      const ids = orphanedIssues.map((r) => r.id);
      await this.db
        .delete(comicvineSchema.comicvineIssues)
        .where(inArray(comicvineSchema.comicvineIssues.id, ids));
      deletedIssues = ids.length;
    }

    this.logger.log(
      `Cleanup: deleted ${deletedVolumes} orphaned volumes, ${deletedIssues} orphaned issues`,
    );

    return { volumes: deletedVolumes, issues: deletedIssues };
  }

  // =========================================================================
  // WS status emission
  // =========================================================================

  async emitComicvineSyncStatus(): Promise<void> {
    try {
      const [pendingItems, queueItems] = await Promise.all([
        this.db
          .select({ id: comicvineSchema.comicvineSyncQueue.id })
          .from(comicvineSchema.comicvineSyncQueue)
          .where(eq(comicvineSchema.comicvineSyncQueue.status, 'pending')),
        this.db
          .select({
            status: comicvineSchema.comicvineSyncQueue.status,
          })
          .from(comicvineSchema.comicvineSyncQueue)
          .where(
            or(
              eq(comicvineSchema.comicvineSyncQueue.status, 'needs_review'),
              eq(comicvineSchema.comicvineSyncQueue.status, 'failed'),
            ),
          ),
      ]);

      const needsReviewCount = queueItems.filter(
        (i) => i.status === 'needs_review',
      ).length;
      const failedCount = queueItems.filter(
        (i) => i.status === 'failed',
      ).length;

      this.wsEvents.comicvineSyncStatusUpdated({
        pendingCount: pendingItems.length,
        needsReviewCount,
        failedCount,
      });
    } catch (error) {
      this.logger.error(`Failed to emit comicvine sync status: ${error}`);
    }
  }
}
