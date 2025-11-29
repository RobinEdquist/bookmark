import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { HardcoverService } from './hardcover.service';

const PROCESS_INTERVAL_MS = 5000; // Check for new items every 5 seconds
const THROTTLE_DELAY_MS = 3000; // 3 second delay between API requests

@Injectable()
export class HardcoverSyncProcessor implements OnModuleInit {
  private readonly logger = new Logger(HardcoverSyncProcessor.name);
  private isProcessing = false;
  private lastProcessTime = 0;

  constructor(private readonly hardcoverService: HardcoverService) {}

  onModuleInit() {
    this.logger.log('Hardcover sync processor initialized');
  }

  @Interval(PROCESS_INTERVAL_MS)
  async processQueue() {
    // Prevent concurrent processing
    if (this.isProcessing) {
      return;
    }

    // Enforce throttle delay between API requests
    const now = Date.now();
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

    this.isProcessing = true;
    this.lastProcessTime = now;

    try {
      this.logger.log(
        `Processing sync queue item ${queueItem.id} for audiobook ${queueItem.audiobookId}`,
      );

      // Mark as processing
      await this.hardcoverService.markQueueItemProcessing(queueItem.id);

      // Search Hardcover for this audiobook
      const searchResult = await this.hardcoverService.searchByAudiobookId(
        queueItem.audiobookId,
      );

      if (!searchResult.success) {
        // API error - mark as failed
        this.logger.warn(
          `Hardcover search failed for audiobook ${queueItem.audiobookId}: ${searchResult.error}`,
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
          `No Hardcover results found for audiobook ${queueItem.audiobookId}`,
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
        `Auto-linking audiobook ${queueItem.audiobookId} to Hardcover book "${firstMatch.title}" (${firstMatch.id})`,
      );

      await this.hardcoverService.linkAudiobookToHardcover(
        queueItem.audiobookId,
        firstMatch,
      );

      // Remove from queue on success
      await this.hardcoverService.removeFromQueue(queueItem.id);

      this.logger.log(
        `Successfully synced audiobook ${queueItem.audiobookId} with Hardcover`,
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
    }
  }
}
