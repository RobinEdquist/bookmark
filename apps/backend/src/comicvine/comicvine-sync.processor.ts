import {
  Injectable,
  Logger,
  OnModuleInit,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Interval, Cron } from '@nestjs/schedule';
import { ComicvineService } from './comicvine.service';
import { ComicVineApiError } from './comicvine-api.client';
import { ImportQueueService } from '../library-watcher/import-queue.service';
import { LibraryScannerService } from '../library-watcher';

// ---------------------------------------------------------------------------
// Timing constants (mirror Hardcover processor values; CV requires ≥2 s)
// ---------------------------------------------------------------------------
const PROCESS_INTERVAL_MS = 5000; // Check for new items every 5 seconds
const THROTTLE_DELAY_MS = 2000; // ≥2 s between outbound API calls
const POST_IMPORT_DELAY_MS = 5000; // Wait 5 s after imports finish before syncing

// ---------------------------------------------------------------------------
// Hourly budget
// ---------------------------------------------------------------------------
// ComicVine advertises ~200 requests/resource/hour. We cap at 180 to leave a
// safety margin. Each processQueue() tick that actually calls the API counts
// as one budget unit. matchBook may internally page multiple API calls (one
// per 100 issues), so the real call count can be higher for large volumes.
// We accept this approximation — the budget is a safety guard, not a hard
// SLA, and the throttle (THROTTLE_DELAY_MS) is the primary rate-limiting
// mechanism at steady state.
// ---------------------------------------------------------------------------
const HOURLY_BUDGET = 180;
const HOUR_MS = 60 * 60 * 1000;

@Injectable()
export class ComicvineSyncProcessor implements OnModuleInit {
  private readonly logger = new Logger(ComicvineSyncProcessor.name);

  /**
   * Mutex flag. Checked and SET synchronously (no await between the two
   * operations) so that concurrent @Interval ticks cannot both pass the
   * guard — JavaScript's event loop guarantees atomicity here.
   */
  private isProcessing = false;

  /** Wall-clock time of the last successful API call. */
  private lastProcessTime = 0;

  /** Last time we observed an active import or scan. */
  private lastImportActiveTime = 0;

  /** Start of the current hourly budget window. */
  private hourlyWindowStart = Date.now();

  /** Number of items processed in the current hourly window. */
  private hourlyRequestCount = 0;

  /**
   * Logged-once flag so the "budget exhausted" message is only emitted once
   * per pause (not on every tick while paused).
   */
  private budgetPauseLogged = false;

  constructor(
    private readonly comicvineService: ComicvineService,
    @Inject(forwardRef(() => ImportQueueService))
    private readonly importQueueService: ImportQueueService,
    @Inject(forwardRef(() => LibraryScannerService))
    private readonly libraryScannerService: LibraryScannerService,
  ) {}

  onModuleInit() {
    this.logger.log('ComicVine sync processor initialized');
  }

  // ---------------------------------------------------------------------------
  // Main queue processor — fires every 5 seconds
  // ---------------------------------------------------------------------------

  @Interval(PROCESS_INTERVAL_MS)
  async processQueue(): Promise<void> {
    // ── Mutex: check AND set before any await ─────────────────────────────
    // This pair is synchronous (no await between them), so it is atomic in
    // Node's single-threaded event loop. Concurrent ticks both check BEFORE
    // either sets the flag, so we set it immediately on entry.
    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;

    let emitStatus = false;

    try {
      emitStatus = await this.doProcessQueue();
    } finally {
      this.isProcessing = false;
      if (emitStatus) {
        this.comicvineService
          .emitComicvineSyncStatus()
          .catch((err) =>
            this.logger.error(`Failed to emit ComicVine sync status: ${err}`),
          );
      }
    }
  }

  /**
   * Inner processing logic. Returns `true` when work was attempted (so the
   * outer method can emit a status update) and `false` for pure guard-exits
   * (scan deference, throttle, empty queue).
   */
  private async doProcessQueue(): Promise<boolean> {
    const now = Date.now();

    // ── Scan / import deference (exact mirror of HardcoverSyncProcessor) ───
    // State sources are the SAME two services the Hardcover processor uses:
    //   • importQueueService.getPendingCount() — in-flight import jobs
    //   • libraryScannerService.isScanning()   — active library scan
    const pendingImports = this.importQueueService.getPendingCount();
    const isScanning = this.libraryScannerService.isScanning();
    if (pendingImports > 0 || isScanning) {
      this.lastImportActiveTime = now;
      return false;
    }

    // Post-import grace period — let all imports settle before hitting the API
    if (
      this.lastImportActiveTime > 0 &&
      now - this.lastImportActiveTime < POST_IMPORT_DELAY_MS
    ) {
      return false;
    }

    // ── Throttle: ≥2 s between outbound API calls ─────────────────────────
    if (now - this.lastProcessTime < THROTTLE_DELAY_MS) {
      return false;
    }

    // ── Hourly budget ─────────────────────────────────────────────────────
    // Roll over the window if an hour has elapsed.
    if (now - this.hourlyWindowStart >= HOUR_MS) {
      this.hourlyWindowStart = now;
      this.hourlyRequestCount = 0;
      this.budgetPauseLogged = false;
    }

    if (this.hourlyRequestCount >= HOURLY_BUDGET) {
      if (!this.budgetPauseLogged) {
        this.logger.warn(
          `ComicVine hourly request budget (${HOURLY_BUDGET}) exhausted — ` +
            `pausing until window rolls over at ${new Date(this.hourlyWindowStart + HOUR_MS).toISOString()}`,
        );
        this.budgetPauseLogged = true;
      }
      return false;
    }

    // ── Prerequisites: auto-sync enabled + API key configured ─────────────
    const [autoSyncEnabled, apiKey] = await Promise.all([
      this.comicvineService.getAutoSyncOnImport(),
      this.comicvineService.getApiKey(),
    ]);

    if (!autoSyncEnabled || !apiKey) {
      return false;
    }

    // ── Pull next pending item ─────────────────────────────────────────────
    const queueItem = await this.comicvineService.getNextPending();
    if (!queueItem) {
      return false;
    }

    // Stamp throttle and count against budget
    this.lastProcessTime = now;
    this.hourlyRequestCount++;

    this.logger.log(
      `Processing ComicVine sync queue item ${queueItem.id} ` +
        `(level=${queueItem.level}, ` +
        `id=${queueItem.level === 'series' ? queueItem.seriesId : queueItem.bookId})`,
    );

    // Mark as processing in DB
    await this.comicvineService.markProcessing(queueItem.id);

    try {
      // ── Validate ID fields ──────────────────────────────────────────────
      if (queueItem.level === 'series' && !queueItem.seriesId) {
        this.logger.error(
          `Queue item ${queueItem.id} is level=series but has no seriesId`,
        );
        await this.comicvineService.markFailed(
          queueItem.id,
          'Queue item missing seriesId',
        );
        return true;
      }

      if (queueItem.level === 'book' && !queueItem.bookId) {
        this.logger.error(
          `Queue item ${queueItem.id} is level=book but has no bookId`,
        );
        await this.comicvineService.markFailed(
          queueItem.id,
          'Queue item missing bookId',
        );
        return true;
      }

      // ── Dispatch on level ───────────────────────────────────────────────
      const outcome =
        queueItem.level === 'series'
          ? await this.comicvineService.matchSeries(queueItem.seriesId!)
          : await this.comicvineService.matchBook(queueItem.bookId!);

      // ── Handle outcome ──────────────────────────────────────────────────
      if (outcome.outcome === 'linked') {
        this.logger.log(
          `Successfully linked queue item ${queueItem.id} to ComicVine id ${outcome.cvId}`,
        );
        await this.comicvineService.removeFromQueue(queueItem.id);
      } else if (outcome.outcome === 'needs_review') {
        this.logger.log(
          `Queue item ${queueItem.id} needs review: ${outcome.reason}`,
        );
        await this.comicvineService.markNeedsReview(
          queueItem.id,
          outcome.reason,
        );
      } else {
        // outcome === 'no_api_key' — should not reach here because we checked
        // above, but handle defensively.
        this.logger.warn(
          `Queue item ${queueItem.id} returned no_api_key — marking failed`,
        );
        await this.comicvineService.markFailed(
          queueItem.id,
          'API key not configured',
        );
      }
    } catch (error) {
      // ── Rate-limit: leave item retryable, do NOT mark failed ─────────────
      // A transient ComicVine rate-limit must be retryable. We:
      //   1. Reset the item from 'processing' back to 'pending' via markPending
      //      so it will be picked up again after the hourly window resets.
      //   2. Trip the hourly budget counter to HOURLY_BUDGET so subsequent
      //      ticks skip API calls until the window rolls over.
      // markFailed is explicitly NOT called — rate-limit errors are not failures.
      if (error instanceof ComicVineApiError && error.rateLimited) {
        this.logger.warn(
          `ComicVine rate limit hit processing queue item ${queueItem.id} — ` +
            `leaving item pending; tripping hourly budget pause`,
        );
        await this.comicvineService.markPending(queueItem.id);

        // Trip budget to pause this window
        this.hourlyRequestCount = HOURLY_BUDGET;
        this.budgetPauseLogged = false; // allow the "budget exhausted" log on next tick
        return true;
      }

      // ── Generic error → markFailed ────────────────────────────────────────
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Error processing ComicVine sync queue item ${queueItem.id}: ${message}`,
      );
      await this.comicvineService.markFailed(queueItem.id, message);
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // Daily orphan cleanup — mirrors Hardcover's @Cron('0 3 * * *')
  // ---------------------------------------------------------------------------

  @Cron('0 3 * * *')
  async cleanupOrphanedCache(): Promise<void> {
    try {
      const { volumes, issues } =
        await this.comicvineService.cleanupOrphanedCache();
      if (volumes > 0 || issues > 0) {
        this.logger.log(
          `Cleaned up ${volumes} orphaned ComicVine volume cache records and ${issues} orphaned issue cache records`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to cleanup orphaned ComicVine cache: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
