import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { WsEventsService } from '../events/ws-events.service';
import {
  GrFinderService,
  type GoodreadsSearchFallback,
  type MediaType,
} from './gr-finder.service';

/** Failures kept for display before the oldest are dropped. */
const MAX_REMEMBERED_FAILURES = 20;

interface QueuedLink {
  jobId: string;
  mediaType: MediaType;
  mediaId: string;
  goodreadsId: string;
  /** What the user picked in the search dialog — used as the job's label. */
  bookTitle: string;
  searchResult?: GoodreadsSearchFallback;
}

export interface GoodreadsLinkActiveJob {
  jobId: string;
  mediaType: MediaType;
  mediaId: string;
  bookTitle: string;
}

export interface GoodreadsLinkFailure {
  jobId: string;
  mediaType: MediaType;
  mediaId: string;
  bookTitle: string;
  error: string;
}

export interface GoodreadsLinkTaskStatus {
  active: GoodreadsLinkActiveJob | null;
  pendingCount: number;
  failedCount: number;
  failures: GoodreadsLinkFailure[];
}

export interface EnqueueLinkRequest {
  mediaType: MediaType;
  mediaId: string;
  goodreadsId: string;
  searchResult?: GoodreadsSearchFallback;
}

/**
 * Runs Goodreads links in the background so picking a book stays instant.
 *
 * Reading a Goodreads book page means clearing a WAF challenge in a headless
 * browser and retrying when it doesn't clear, which can take minutes — far too
 * long to hold a request open. Jobs are processed one at a time (they share a
 * single browser context) and reported to the sidebar over WebSocket.
 *
 * The queue is in-memory: these are foreground actions the user is waiting on,
 * so a job lost to a restart is better re-triggered than silently replayed.
 */
@Injectable()
export class GoodreadsLinkQueueService {
  private readonly logger = new Logger(GoodreadsLinkQueueService.name);
  private readonly pending: QueuedLink[] = [];
  private readonly failures: GoodreadsLinkFailure[] = [];
  private active: QueuedLink | null = null;
  private draining = false;

  constructor(
    private readonly grFinderService: GrFinderService,
    private readonly wsEvents: WsEventsService,
  ) {}

  /**
   * Queues a link and returns immediately. Callers should have already
   * validated that the media exists, so the caller — not the sidebar — reports
   * a bad request.
   */
  enqueue(request: EnqueueLinkRequest): { jobId: string } {
    const jobId = randomUUID();

    // Supersede any queued link for the same media; only the latest pick wins.
    this.dropPendingFor(request.mediaType, request.mediaId);
    this.clearFailuresFor(request.mediaType, request.mediaId);

    this.pending.push({
      jobId,
      mediaType: request.mediaType,
      mediaId: request.mediaId,
      goodreadsId: request.goodreadsId,
      bookTitle: request.searchResult?.title?.trim() || request.goodreadsId,
      ...(request.searchResult ? { searchResult: request.searchResult } : {}),
    });

    this.logger.log(
      `Queued Goodreads link for ${request.mediaType} ${request.mediaId} → ${request.goodreadsId}`,
    );
    this.emitStatus();
    void this.drain();

    return { jobId };
  }

  getStatus(): GoodreadsLinkTaskStatus {
    return {
      active: this.active
        ? {
            jobId: this.active.jobId,
            mediaType: this.active.mediaType,
            mediaId: this.active.mediaId,
            bookTitle: this.active.bookTitle,
          }
        : null,
      pendingCount: this.pending.length,
      failedCount: this.failures.length,
      failures: [...this.failures],
    };
  }

  /** Clears remembered failures so the sidebar entry goes away. */
  dismissFailures(): void {
    if (this.failures.length === 0) {
      return;
    }
    this.failures.length = 0;
    this.emitStatus();
  }

  private async drain(): Promise<void> {
    if (this.draining) {
      return;
    }
    this.draining = true;

    try {
      let job = this.pending.shift();
      while (job) {
        this.active = job;
        this.emitStatus();
        await this.runJob(job);
        this.active = null;
        this.emitStatus();
        job = this.pending.shift();
      }
    } finally {
      this.active = null;
      this.draining = false;
    }
  }

  private async runJob(job: QueuedLink): Promise<void> {
    try {
      await this.grFinderService.linkMediaToGoodreads(
        job.mediaType,
        job.mediaId,
        job.goodreadsId,
        job.searchResult,
      );

      // Tell clients the media changed so its cached metadata refreshes — the
      // link request itself returned long before this point.
      if (job.mediaType === 'audiobook') {
        this.wsEvents.audiobookUpdated(job.mediaId);
      } else {
        this.wsEvents.ebookUpdated(job.mediaId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Goodreads link failed for ${job.mediaType} ${job.mediaId} → ${job.goodreadsId}: ${message}`,
      );

      this.failures.push({
        jobId: job.jobId,
        mediaType: job.mediaType,
        mediaId: job.mediaId,
        bookTitle: job.bookTitle,
        error: message,
      });
      if (this.failures.length > MAX_REMEMBERED_FAILURES) {
        this.failures.shift();
      }
    }
  }

  private dropPendingFor(mediaType: MediaType, mediaId: string): void {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const queued = this.pending[i]!;
      if (queued.mediaType === mediaType && queued.mediaId === mediaId) {
        this.pending.splice(i, 1);
      }
    }
  }

  private clearFailuresFor(mediaType: MediaType, mediaId: string): void {
    for (let i = this.failures.length - 1; i >= 0; i--) {
      const failure = this.failures[i]!;
      if (failure.mediaType === mediaType && failure.mediaId === mediaId) {
        this.failures.splice(i, 1);
      }
    }
  }

  private emitStatus(): void {
    this.wsEvents.goodreadsLinkStatusUpdated(this.getStatus());
  }
}
