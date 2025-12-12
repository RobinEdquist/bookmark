import { Injectable, Logger, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { HardcoverService, MediaType } from './hardcover.service';
import { WsEventsService } from '../events/ws-events.service';
import { ImportQueueService } from '../library-watcher/import-queue.service';
import { LibraryScannerService } from '../library-watcher/library-scanner.service';

const PROCESS_INTERVAL_MS = 5000; // Check for new items every 5 seconds
const THROTTLE_DELAY_MS = 3000; // 3 second delay between API requests
const POST_IMPORT_DELAY_MS = 5000; // Wait 5 seconds after imports finish before syncing

@Injectable()
export class HardcoverSyncProcessor implements OnModuleInit {
  private readonly logger = new Logger(HardcoverSyncProcessor.name);
  private isProcessing = false;
  private lastProcessTime = 0;
  private lastImportActiveTime = 0;

  constructor(
    private readonly hardcoverService: HardcoverService,
    private readonly wsEvents: WsEventsService,
    @Inject(forwardRef(() => ImportQueueService))
    private readonly importQueueService: ImportQueueService,
    @Inject(forwardRef(() => LibraryScannerService))
    private readonly libraryScannerService: LibraryScannerService,
  ) {}

  onModuleInit() {
    this.logger.log('Hardcover sync processor initialized');
  }

  @Interval(PROCESS_INTERVAL_MS)
  async processQueue() {
    // Prevent concurrent processing
    if (this.isProcessing) {
      return;
    }

    const now = Date.now();

    // Check if imports are in progress or a library scan is running - wait for them to complete
    const pendingImports = this.importQueueService.getPendingCount();
    const isScanning = this.libraryScannerService.isScanning();
    if (pendingImports > 0 || isScanning) {
      this.lastImportActiveTime = now;
      return;
    }

    // Wait for a grace period after imports finish before starting Hardcover sync
    // This ensures all imports are fully processed before we start API calls
    if (this.lastImportActiveTime > 0 && now - this.lastImportActiveTime < POST_IMPORT_DELAY_MS) {
      return;
    }

    // Enforce throttle delay between API requests
    if (now - this.lastProcessTime < THROTTLE_DELAY_MS) {
      return;
    }

    // Check if auto-sync is enabled and API key is configured
    const [autoSyncEnabled, apiKey] = await Promise.all([
      this.hardcoverService.getAutoSyncOnImport(),
      this.hardcoverService.getApiKey(),
    ]);

    if (!autoSyncEnabled || !apiKey) {
      return;
    }

    // Get next pending item
    const queueItem = await this.hardcoverService.getNextPendingFromQueue();
    if (!queueItem) {
      return;
    }

    // Determine media type from queue item
    const mediaType: MediaType = queueItem.audiobookId ? 'audiobook' : 'ebook';
    const mediaId = queueItem.audiobookId || queueItem.ebookId;

    if (!mediaId) {
      this.logger.error(
        `Queue item ${queueItem.id} has no audiobookId or ebookId`,
      );
      await this.hardcoverService.removeFromQueue(queueItem.id);
      return;
    }

    this.isProcessing = true;
    this.lastProcessTime = now;

    try {
      this.logger.log(
        `Processing sync queue item ${queueItem.id} for ${mediaType} ${mediaId}`,
      );

      // Mark as processing
      await this.hardcoverService.markQueueItemProcessing(queueItem.id);

      // Search Hardcover for this media
      const searchResult = await this.hardcoverService.searchByMediaId(
        mediaType,
        mediaId,
      );

      if (!searchResult.success) {
        // API error - mark as failed
        this.logger.warn(
          `Hardcover search failed for ${mediaType} ${mediaId}: ${searchResult.error}`,
        );
        await this.hardcoverService.markQueueItemFailed(
          queueItem.id,
          searchResult.error || 'Search failed',
        );
        return;
      }

      const hits = searchResult.data?.search?.results?.hits || [];

      if (hits.length === 0) {
        // No results found - mark as failed
        this.logger.log(
          `No Hardcover results found for ${mediaType} ${mediaId}`,
        );
        await this.hardcoverService.markQueueItemFailed(
          queueItem.id,
          'No matching books found on Hardcover',
        );
        return;
      }

      // Auto-link first result
      const firstMatch = hits[0].document;
      this.logger.log(
        `Auto-linking ${mediaType} ${mediaId} to Hardcover book "${firstMatch.title}" (${firstMatch.id})`,
      );

      await this.hardcoverService.linkMediaToHardcover(
        mediaType,
        mediaId,
        firstMatch,
      );

      // Remove from queue on success
      await this.hardcoverService.removeFromQueue(queueItem.id);

      this.logger.log(
        `Successfully synced ${mediaType} ${mediaId} with Hardcover`,
      );
    } catch (error) {
      this.logger.error(
        `Error processing sync queue item ${queueItem.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      await this.hardcoverService.markQueueItemFailed(
        queueItem.id,
        error instanceof Error ? error.message : 'Unknown error',
      );
    } finally {
      this.isProcessing = false;
      // Emit hardcover status after processing
      this.emitHardcoverStatus().catch((err) =>
        this.logger.error(`Failed to emit hardcover status: ${err}`),
      );
    }
  }

  /**
   * Emit current hardcover sync status to all connected WebSocket clients
   */
  private async emitHardcoverStatus(): Promise<void> {
    const [pendingCount, failedItems] = await Promise.all([
      this.hardcoverService.getPendingQueueCount(),
      this.hardcoverService.getFailedQueueItems(),
    ]);

    this.wsEvents.hardcoverSyncStatusUpdated({
      pendingCount,
      failedCount: failedItems.length,
    });
  }
}
