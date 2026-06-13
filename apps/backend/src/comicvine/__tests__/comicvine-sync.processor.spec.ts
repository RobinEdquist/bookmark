// ---------------------------------------------------------------------------
// ComicvineSyncProcessor — unit tests
//
// Mocking strategy (mirrors hardcover-sync.processor approach):
//   • ComicvineService — fully mocked via jest.fn(); all methods are jest.fn()
//   • ImportQueueService — mocked: only getPendingCount() used
//   • LibraryScannerService — mocked: only isScanning() used
//
// The processor constructor uses forwardRef for ImportQueueService and
// LibraryScannerService, but in unit tests we skip the NestJS DI container
// and instantiate the class directly.
// ---------------------------------------------------------------------------

import { ComicvineSyncProcessor } from '../comicvine-sync.processor';
import { ComicVineApiError } from '../comicvine-api.client';
import type { ComicvineService } from '../comicvine.service';
import type { ImportQueueService } from '../../library-watcher/import-queue.service';
import type { LibraryScannerService } from '../../library-watcher';
import type { comicvineSyncQueue } from '../schema';

// ---------------------------------------------------------------------------
// Module-level mocks to prevent heavy transitive imports
// ---------------------------------------------------------------------------

jest.mock('../../events/events.gateway', () => ({
  EventsGateway: jest.fn(),
}));
jest.mock('../../events/ws-events.service', () => ({
  WsEventsService: jest.fn(),
}));
jest.mock('../../library-watcher/import-queue.service', () => ({
  ImportQueueService: jest.fn(),
}));
jest.mock('../../library-watcher', () => ({
  LibraryScannerService: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type QueueRow = typeof comicvineSyncQueue.$inferSelect;

function buildQueueItem(overrides: Partial<QueueRow> = {}): QueueRow {
  return {
    id: 'queue-1',
    level: 'series',
    seriesId: 'series-abc',
    bookId: null,
    status: 'pending',
    errorMessage: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function createMockComicvineService(): jest.Mocked<ComicvineService> {
  return {
    getAutoSyncOnImport: jest.fn().mockResolvedValue(true),
    getApiKey: jest.fn().mockResolvedValue('test-api-key'),
    getNextPending: jest.fn().mockResolvedValue(null),
    markProcessing: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined),
    markNeedsReview: jest.fn().mockResolvedValue(undefined),
    markPending: jest.fn().mockResolvedValue(undefined),
    removeFromQueue: jest.fn().mockResolvedValue(undefined),
    matchSeries: jest.fn(),
    matchBook: jest.fn(),
    emitComicvineSyncStatus: jest.fn().mockResolvedValue(undefined),
    cleanupOrphanedCache: jest
      .fn()
      .mockResolvedValue({ volumes: 0, issues: 0 }),
    // include other methods as no-ops to satisfy the type
    addToSyncQueue: jest.fn().mockResolvedValue(true),
    getPendingCount: jest.fn().mockResolvedValue(0),
    queueAllUnlinkedSeries: jest.fn().mockResolvedValue(0),
    dismissItem: jest.fn().mockResolvedValue(undefined),
    getQueueItems: jest.fn().mockResolvedValue([]),
    searchVolumes: jest
      .fn()
      .mockResolvedValue({ totalResults: 0, results: [] }),
    getVolumeIssuesPaged: jest
      .fn()
      .mockResolvedValue({ totalResults: 0, issues: [] }),
  } as unknown as jest.Mocked<ComicvineService>;
}

function createMockImportQueueService(): jest.Mocked<ImportQueueService> {
  return {
    getPendingCount: jest.fn().mockReturnValue(0),
  } as unknown as jest.Mocked<ImportQueueService>;
}

function createMockLibraryScannerService(): jest.Mocked<LibraryScannerService> {
  return {
    isScanning: jest.fn().mockReturnValue(false),
  } as unknown as jest.Mocked<LibraryScannerService>;
}

function createProcessor(
  comicvineService?: jest.Mocked<ComicvineService>,
  importQueueService?: jest.Mocked<ImportQueueService>,
  libraryScannerService?: jest.Mocked<LibraryScannerService>,
): {
  processor: ComicvineSyncProcessor;
  svc: jest.Mocked<ComicvineService>;
  importQueue: jest.Mocked<ImportQueueService>;
  scanner: jest.Mocked<LibraryScannerService>;
} {
  const svc = comicvineService ?? createMockComicvineService();
  const importQueue = importQueueService ?? createMockImportQueueService();
  const scanner = libraryScannerService ?? createMockLibraryScannerService();

  const processor = new ComicvineSyncProcessor(svc, importQueue, scanner);

  return { processor, svc, importQueue, scanner };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ComicvineSyncProcessor', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Module init
  // ─────────────────────────────────────────────────────────────────────────

  it('logs on onModuleInit', () => {
    const { processor } = createProcessor();
    const logSpy = jest
      .spyOn(
        (processor as unknown as { logger: { log: jest.Mock } }).logger,
        'log',
      )
      .mockImplementation(() => undefined);
    processor.onModuleInit();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('initialized'));
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Empty queue — no-op
  // ─────────────────────────────────────────────────────────────────────────

  it('does nothing when queue is empty', async () => {
    const { processor, svc } = createProcessor();
    svc.getNextPending.mockResolvedValue(null);

    await processor.processQueue();

    expect(svc.matchSeries).not.toHaveBeenCalled();
    expect(svc.matchBook).not.toHaveBeenCalled();
    expect(svc.markFailed).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Deference when a scan is active
  // ─────────────────────────────────────────────────────────────────────────

  it('defers when library scan is active — no API calls', async () => {
    const { processor, svc, scanner } = createProcessor();
    scanner.isScanning.mockReturnValue(true);

    await processor.processQueue();

    expect(svc.getAutoSyncOnImport).not.toHaveBeenCalled();
    expect(svc.getNextPending).not.toHaveBeenCalled();
    expect(svc.matchSeries).not.toHaveBeenCalled();
  });

  it('defers when imports are pending — no API calls', async () => {
    const { processor, svc, importQueue } = createProcessor();
    importQueue.getPendingCount.mockReturnValue(5);

    await processor.processQueue();

    expect(svc.getNextPending).not.toHaveBeenCalled();
    expect(svc.matchSeries).not.toHaveBeenCalled();
  });

  it('defers during post-import grace period', async () => {
    const { processor, svc, importQueue } = createProcessor();

    // First tick: imports are active → stamps lastImportActiveTime
    importQueue.getPendingCount.mockReturnValue(1);
    await processor.processQueue();

    // Advance time by less than POST_IMPORT_DELAY_MS (5000ms)
    importQueue.getPendingCount.mockReturnValue(0);
    jest.advanceTimersByTime(2000);

    await processor.processQueue();

    expect(svc.getNextPending).not.toHaveBeenCalled();
  });

  it('processes after grace period has elapsed', async () => {
    const { processor, svc, importQueue } = createProcessor();
    svc.getNextPending.mockResolvedValue(null);

    // First tick: imports active
    importQueue.getPendingCount.mockReturnValue(1);
    await processor.processQueue();

    // Advance past grace period (5001ms)
    importQueue.getPendingCount.mockReturnValue(0);
    jest.advanceTimersByTime(6000);

    await processor.processQueue();

    expect(svc.getNextPending).toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Auto-sync / API key checks
  // ─────────────────────────────────────────────────────────────────────────

  it('returns early when auto-sync is disabled', async () => {
    const { processor, svc } = createProcessor();
    svc.getAutoSyncOnImport.mockResolvedValue(false);

    await processor.processQueue();

    expect(svc.getNextPending).not.toHaveBeenCalled();
  });

  it('returns early when API key is null', async () => {
    const { processor, svc } = createProcessor();
    svc.getApiKey.mockResolvedValue(null);

    await processor.processQueue();

    expect(svc.getNextPending).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Throttle
  // ─────────────────────────────────────────────────────────────────────────

  it('enforces ≥2 s throttle between API calls', async () => {
    const { processor, svc } = createProcessor();
    svc.getNextPending.mockResolvedValue(buildQueueItem());
    svc.matchSeries.mockResolvedValue({ outcome: 'linked', cvId: 1 });

    // First tick — succeeds, stamps lastProcessTime
    await processor.processQueue();
    expect(svc.matchSeries).toHaveBeenCalledTimes(1);

    // Reset: new item in queue but NOT enough time has passed (1 s < 2 s)
    svc.matchSeries.mockClear();
    jest.advanceTimersByTime(1000);

    await processor.processQueue();

    expect(svc.matchSeries).not.toHaveBeenCalled();
  });

  it('fires again after throttle window elapses', async () => {
    const { processor, svc } = createProcessor();
    svc.getNextPending.mockResolvedValue(buildQueueItem());
    svc.matchSeries.mockResolvedValue({ outcome: 'linked', cvId: 1 });

    await processor.processQueue();
    svc.matchSeries.mockClear();

    // Advance past 2 s throttle
    jest.advanceTimersByTime(2001);

    await processor.processQueue();

    expect(svc.matchSeries).toHaveBeenCalledTimes(1);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Mutex: concurrent ticks
  // ─────────────────────────────────────────────────────────────────────────

  it('mutex prevents concurrent processing — second tick is a no-op', async () => {
    const { processor, svc } = createProcessor();

    // Make matchSeries block so two ticks overlap
    let resolveMatch!: (v: { outcome: 'linked'; cvId: number }) => void;
    svc.getNextPending.mockResolvedValue(buildQueueItem());
    svc.matchSeries.mockReturnValue(
      new Promise<{ outcome: 'linked'; cvId: number }>((res) => {
        resolveMatch = res;
      }),
    );

    const tick1 = processor.processQueue();
    // Start the second tick immediately (before the first completes)
    const tick2 = processor.processQueue();

    resolveMatch({ outcome: 'linked', cvId: 1 });

    await Promise.all([tick1, tick2]);

    // matchSeries called exactly once — the second tick was gated by the mutex
    expect(svc.matchSeries).toHaveBeenCalledTimes(1);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Happy path: series item linked
  // ─────────────────────────────────────────────────────────────────────────

  it('drains a pending series item → matchSeries called → removeFromQueue', async () => {
    const item = buildQueueItem({ level: 'series', seriesId: 'series-1' });
    const { processor, svc } = createProcessor();
    svc.getNextPending.mockResolvedValue(item);
    svc.matchSeries.mockResolvedValue({ outcome: 'linked', cvId: 12345 });

    await processor.processQueue();

    expect(svc.markProcessing).toHaveBeenCalledWith('queue-1');
    expect(svc.matchSeries).toHaveBeenCalledWith('series-1');
    expect(svc.matchBook).not.toHaveBeenCalled();
    expect(svc.removeFromQueue).toHaveBeenCalledWith('queue-1');
    expect(svc.markFailed).not.toHaveBeenCalled();
    expect(svc.markNeedsReview).not.toHaveBeenCalled();
    expect(svc.emitComicvineSyncStatus).toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Happy path: book item linked
  // ─────────────────────────────────────────────────────────────────────────

  it('drains a pending book item → matchBook called → removeFromQueue', async () => {
    const item = buildQueueItem({
      id: 'queue-2',
      level: 'book',
      seriesId: null,
      bookId: 'book-99',
    });
    const { processor, svc } = createProcessor();
    svc.getNextPending.mockResolvedValue(item);
    svc.matchBook.mockResolvedValue({ outcome: 'linked', cvId: 99001 });

    await processor.processQueue();

    expect(svc.matchBook).toHaveBeenCalledWith('book-99');
    expect(svc.matchSeries).not.toHaveBeenCalled();
    expect(svc.removeFromQueue).toHaveBeenCalledWith('queue-2');
    expect(svc.markFailed).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // needs_review outcome
  // ─────────────────────────────────────────────────────────────────────────

  it('marks needs_review when matchSeries returns needs_review — NOT removed, NOT failed', async () => {
    const item = buildQueueItem({ level: 'series', seriesId: 'series-2' });
    const { processor, svc } = createProcessor();
    svc.getNextPending.mockResolvedValue(item);
    svc.matchSeries.mockResolvedValue({
      outcome: 'needs_review',
      reason: 'Ambiguous: 3 candidates',
    });

    await processor.processQueue();

    expect(svc.markNeedsReview).toHaveBeenCalledWith(
      'queue-1',
      'Ambiguous: 3 candidates',
    );
    expect(svc.removeFromQueue).not.toHaveBeenCalled();
    expect(svc.markFailed).not.toHaveBeenCalled();
    expect(svc.emitComicvineSyncStatus).toHaveBeenCalled();
  });

  it('marks needs_review when matchBook returns needs_review', async () => {
    const item = buildQueueItem({
      level: 'book',
      seriesId: null,
      bookId: 'book-7',
    });
    const { processor, svc } = createProcessor();
    svc.getNextPending.mockResolvedValue(item);
    svc.matchBook.mockResolvedValue({
      outcome: 'needs_review',
      reason: 'Parent series is not linked to a ComicVine volume',
    });

    await processor.processQueue();

    expect(svc.markNeedsReview).toHaveBeenCalledWith(
      'queue-1',
      'Parent series is not linked to a ComicVine volume',
    );
    expect(svc.removeFromQueue).not.toHaveBeenCalled();
    expect(svc.markFailed).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Rate-limit error → item stays pending, NOT markFailed
  // ─────────────────────────────────────────────────────────────────────────

  it('rate-limit error: calls markPending, NOT markFailed, trips budget', async () => {
    expect.assertions(5);

    const item = buildQueueItem({ level: 'series', seriesId: 'series-rl' });
    const { processor, svc } = createProcessor();
    svc.getNextPending.mockResolvedValue(item);
    svc.matchSeries.mockRejectedValue(
      new ComicVineApiError(0, 'rate limited', true),
    );

    await processor.processQueue();

    // Key safety assertions:
    expect(svc.markFailed).not.toHaveBeenCalled(); // rate-limit must NOT mark failed
    expect(svc.markPending).toHaveBeenCalledWith('queue-1'); // must reset to pending
    expect(svc.removeFromQueue).not.toHaveBeenCalled(); // must NOT remove

    // Budget should now be tripped — next tick should NOT call matchSeries
    svc.matchSeries.mockClear();
    svc.markPending.mockClear();

    // Advance enough to pass throttle (>2s) but NOT past the hour window
    jest.advanceTimersByTime(3000);

    await processor.processQueue();

    expect(svc.matchSeries).not.toHaveBeenCalled(); // budget paused
    expect(svc.markFailed).not.toHaveBeenCalled();
  });

  it('rate-limit: emitComicvineSyncStatus is still called via finally block', async () => {
    const item = buildQueueItem({ level: 'series', seriesId: 'series-rl2' });
    const { processor, svc } = createProcessor();
    svc.getNextPending.mockResolvedValue(item);
    svc.matchSeries.mockRejectedValue(
      new ComicVineApiError(0, 'rate limited', true),
    );

    await processor.processQueue();

    // emitComicvineSyncStatus IS called from finally
    expect(svc.emitComicvineSyncStatus).toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Generic error → markFailed
  // ─────────────────────────────────────────────────────────────────────────

  it('generic error → markFailed with error message, NOT markPending', async () => {
    expect.assertions(4);

    const item = buildQueueItem({ level: 'series', seriesId: 'series-err' });
    const { processor, svc } = createProcessor();
    svc.getNextPending.mockResolvedValue(item);
    svc.matchSeries.mockRejectedValue(new Error('Network timeout'));

    await processor.processQueue();

    expect(svc.markFailed).toHaveBeenCalledWith('queue-1', 'Network timeout');
    expect(svc.markPending).not.toHaveBeenCalled();
    expect(svc.removeFromQueue).not.toHaveBeenCalled();
    expect(svc.emitComicvineSyncStatus).toHaveBeenCalled();
  });

  it('non-rate-limit ComicVineApiError → markFailed', async () => {
    const item = buildQueueItem({ level: 'series', seriesId: 'series-err2' });
    const { processor, svc } = createProcessor();
    svc.getNextPending.mockResolvedValue(item);
    // rateLimited = false (default) → not a rate-limit error
    svc.matchSeries.mockRejectedValue(
      new ComicVineApiError(100, 'Invalid API key', false),
    );

    await processor.processQueue();

    expect(svc.markFailed).toHaveBeenCalledWith('queue-1', 'Invalid API key');
    expect(svc.markPending).not.toHaveBeenCalled();
  });

  it('unknown non-Error thrown → markFailed with "Unknown error"', async () => {
    const item = buildQueueItem({ level: 'series', seriesId: 'series-unk' });
    const { processor, svc } = createProcessor();
    svc.getNextPending.mockResolvedValue(item);

    svc.matchSeries.mockRejectedValue('some string error');

    await processor.processQueue();

    expect(svc.markFailed).toHaveBeenCalledWith('queue-1', 'Unknown error');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Hourly budget exhaustion
  // ─────────────────────────────────────────────────────────────────────────

  it('pauses when hourly budget is exhausted — no further API calls', async () => {
    const { processor, svc } = createProcessor();
    svc.getNextPending.mockResolvedValue(buildQueueItem());
    svc.matchSeries.mockResolvedValue({ outcome: 'linked', cvId: 1 });

    // Exhaust budget: run 180 ticks each 2001ms apart (>throttle, <1 hour)
    for (let i = 0; i < 180; i++) {
      // Reset the queue item mock so each tick gets a fresh pending item
      svc.getNextPending.mockResolvedValueOnce(
        buildQueueItem({ id: `queue-${i}` }),
      );
      jest.advanceTimersByTime(2001);
      await processor.processQueue();
    }

    // matchSeries should have been called 180 times (one per tick)
    expect(svc.matchSeries).toHaveBeenCalledTimes(180);

    // Now the budget is exhausted — advance time again and verify no more calls
    svc.matchSeries.mockClear();
    svc.getNextPending.mockResolvedValue(buildQueueItem({ id: 'queue-bust' }));
    jest.advanceTimersByTime(2001);
    await processor.processQueue();

    expect(svc.matchSeries).not.toHaveBeenCalled();
  });

  it('budget resets after the hour window rolls over', async () => {
    const { processor, svc } = createProcessor();

    // Trip the budget by processing 180 items
    svc.matchSeries.mockResolvedValue({ outcome: 'linked', cvId: 1 });
    for (let i = 0; i < 180; i++) {
      svc.getNextPending.mockResolvedValueOnce(
        buildQueueItem({ id: `queue-${i}` }),
      );
      jest.advanceTimersByTime(2001);
      await processor.processQueue();
    }

    // Budget exhausted: confirm no call
    svc.matchSeries.mockClear();
    jest.advanceTimersByTime(2001);
    svc.getNextPending.mockResolvedValue(buildQueueItem({ id: 'post-bust' }));
    await processor.processQueue();
    expect(svc.matchSeries).not.toHaveBeenCalled();

    // Advance past 1 hour — window should reset
    svc.matchSeries.mockClear();
    jest.advanceTimersByTime(60 * 60 * 1000 + 1);
    svc.getNextPending.mockResolvedValue(buildQueueItem({ id: 'post-reset' }));
    await processor.processQueue();

    expect(svc.matchSeries).toHaveBeenCalledTimes(1);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Missing ID fields (defensive validation)
  // ─────────────────────────────────────────────────────────────────────────

  it('marks failed when series item has no seriesId', async () => {
    const item = buildQueueItem({ level: 'series', seriesId: null });
    const { processor, svc } = createProcessor();
    svc.getNextPending.mockResolvedValue(item);

    await processor.processQueue();

    expect(svc.markFailed).toHaveBeenCalledWith(
      'queue-1',
      expect.stringContaining('seriesId'),
    );
    expect(svc.matchSeries).not.toHaveBeenCalled();
  });

  it('marks failed when book item has no bookId', async () => {
    const item = buildQueueItem({
      level: 'book',
      seriesId: null,
      bookId: null,
    });
    const { processor, svc } = createProcessor();
    svc.getNextPending.mockResolvedValue(item);

    await processor.processQueue();

    expect(svc.markFailed).toHaveBeenCalledWith(
      'queue-1',
      expect.stringContaining('bookId'),
    );
    expect(svc.matchBook).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // cleanupOrphanedCache cron
  // ─────────────────────────────────────────────────────────────────────────

  it('cleanupOrphanedCache delegates to service and logs when rows deleted', async () => {
    const { processor, svc } = createProcessor();
    svc.cleanupOrphanedCache.mockResolvedValue({ volumes: 3, issues: 7 });

    const logSpy = jest
      .spyOn(
        (processor as unknown as { logger: { log: jest.Mock } }).logger,
        'log',
      )
      .mockImplementation(() => undefined);

    await processor.cleanupOrphanedCache();

    expect(svc.cleanupOrphanedCache).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('3'));
  });

  it('cleanupOrphanedCache does NOT log when nothing deleted', async () => {
    const { processor, svc } = createProcessor();
    svc.cleanupOrphanedCache.mockResolvedValue({ volumes: 0, issues: 0 });

    const logSpy = jest
      .spyOn(
        (processor as unknown as { logger: { log: jest.Mock } }).logger,
        'log',
      )
      .mockImplementation(() => undefined);
    const errorSpy = jest
      .spyOn(
        (processor as unknown as { logger: { error: jest.Mock } }).logger,
        'error',
      )
      .mockImplementation(() => undefined);

    await processor.cleanupOrphanedCache();

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('cleanupOrphanedCache logs error when service throws', async () => {
    const { processor, svc } = createProcessor();
    svc.cleanupOrphanedCache.mockRejectedValue(new Error('DB down'));

    const errorSpy = jest
      .spyOn(
        (processor as unknown as { logger: { error: jest.Mock } }).logger,
        'error',
      )
      .mockImplementation(() => undefined);

    await processor.cleanupOrphanedCache();

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('DB down'));
  });
});
