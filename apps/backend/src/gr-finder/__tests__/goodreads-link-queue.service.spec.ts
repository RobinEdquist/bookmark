// The real service pulls in the socket.io gateway (and its ESM auth dep).
jest.mock('../../events/ws-events.service', () => ({
  WsEventsService: jest.fn(),
}));

import { GoodreadsLinkQueueService } from '../goodreads-link-queue.service';
import type { GrFinderService } from '../gr-finder.service';
import type { WsEventsService } from '../../events/ws-events.service';

/** Resolves once every queued microtask has run. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('GoodreadsLinkQueueService', () => {
  // Loosely typed: the queue only cares that the link resolves or rejects, not
  // what the persisted row looks like.
  let grFinder: { linkMediaToGoodreads: jest.Mock };
  let wsEvents: jest.Mocked<
    Pick<
      WsEventsService,
      'goodreadsLinkStatusUpdated' | 'audiobookUpdated' | 'ebookUpdated'
    >
  >;
  let queue: GoodreadsLinkQueueService;

  beforeEach(() => {
    grFinder = { linkMediaToGoodreads: jest.fn().mockResolvedValue({}) };
    wsEvents = {
      goodreadsLinkStatusUpdated: jest.fn(),
      audiobookUpdated: jest.fn(),
      ebookUpdated: jest.fn(),
    };
    queue = new GoodreadsLinkQueueService(
      grFinder as unknown as GrFinderService,
      wsEvents as unknown as WsEventsService,
    );
  });

  it('returns a job id without waiting for the link to finish', async () => {
    let release: (() => void) | undefined;
    grFinder.linkMediaToGoodreads.mockReturnValue(
      new Promise<never>((_, reject) => {
        release = () => reject(new Error('cancelled'));
      }),
    );

    const { jobId } = queue.enqueue({
      mediaType: 'ebook',
      mediaId: 'ebook-1',
      goodreadsId: 'gr-1',
      searchResult: { title: 'The Chilango Burrito Bible' },
    });

    expect(jobId).toBeTruthy();
    await flush();

    // Still in flight — the caller was never blocked on it.
    const status = queue.getStatus();
    expect(status.active).toMatchObject({
      jobId,
      mediaType: 'ebook',
      mediaId: 'ebook-1',
      bookTitle: 'The Chilango Burrito Bible',
    });

    release?.();
    await flush();
  });

  it('labels a job with the goodreads id when no search result was sent', async () => {
    grFinder.linkMediaToGoodreads.mockImplementation(
      () => new Promise(() => undefined),
    );

    queue.enqueue({
      mediaType: 'ebook',
      mediaId: 'ebook-1',
      goodreadsId: '45431622-the-chilango-burrito-bible',
    });
    await flush();

    expect(queue.getStatus().active?.bookTitle).toBe(
      '45431622-the-chilango-burrito-bible',
    );
  });

  it('runs the link and announces the media change on success', async () => {
    queue.enqueue({
      mediaType: 'ebook',
      mediaId: 'ebook-1',
      goodreadsId: 'gr-1',
      searchResult: { title: 'Gatsby' },
    });
    await flush();

    expect(grFinder.linkMediaToGoodreads).toHaveBeenCalledWith(
      'ebook',
      'ebook-1',
      'gr-1',
      { title: 'Gatsby' },
    );
    // Drives cache invalidation on clients now that the response is long gone.
    expect(wsEvents.ebookUpdated).toHaveBeenCalledWith('ebook-1');
    expect(queue.getStatus()).toEqual({
      active: null,
      pendingCount: 0,
      failedCount: 0,
      failures: [],
    });
  });

  it('announces audiobook changes for audiobook links', async () => {
    queue.enqueue({
      mediaType: 'audiobook',
      mediaId: 'audio-1',
      goodreadsId: 'gr-1',
    });
    await flush();

    expect(wsEvents.audiobookUpdated).toHaveBeenCalledWith('audio-1');
  });

  it('records a failure instead of throwing, and keeps draining', async () => {
    grFinder.linkMediaToGoodreads
      .mockRejectedValueOnce(
        new Error('Could not read the Goodreads book page'),
      )
      .mockResolvedValueOnce({});

    queue.enqueue({
      mediaType: 'ebook',
      mediaId: 'ebook-1',
      goodreadsId: 'gr-1',
      searchResult: { title: 'Doomed Book' },
    });
    queue.enqueue({
      mediaType: 'ebook',
      mediaId: 'ebook-2',
      goodreadsId: 'gr-2',
      searchResult: { title: 'Fine Book' },
    });
    await flush();
    await flush();

    const status = queue.getStatus();
    expect(status.active).toBeNull();
    expect(status.pendingCount).toBe(0);
    expect(status.failures).toEqual([
      expect.objectContaining({
        mediaId: 'ebook-1',
        bookTitle: 'Doomed Book',
        error: 'Could not read the Goodreads book page',
      }),
    ]);
    // The second job still ran despite the first one failing.
    expect(wsEvents.ebookUpdated).toHaveBeenCalledWith('ebook-2');
  });

  it('supersedes a queued link for the same media', async () => {
    // The blocker is claimed as the active job straight away, so both ebook-1
    // enqueues land in the pending list behind it.
    queue.enqueue({
      mediaType: 'ebook',
      mediaId: 'blocker',
      goodreadsId: 'gr-blocker',
    });
    queue.enqueue({
      mediaType: 'ebook',
      mediaId: 'ebook-1',
      goodreadsId: 'gr-first',
    });
    queue.enqueue({
      mediaType: 'ebook',
      mediaId: 'ebook-1',
      goodreadsId: 'gr-second',
    });

    expect(queue.getStatus().active?.mediaId).toBe('blocker');
    // Only the latest pick for ebook-1 survives — re-picking replaces.
    expect(queue.getStatus().pendingCount).toBe(1);

    await flush();
    await flush();

    expect(grFinder.linkMediaToGoodreads).toHaveBeenCalledTimes(2);
    expect(grFinder.linkMediaToGoodreads).toHaveBeenLastCalledWith(
      'ebook',
      'ebook-1',
      'gr-second',
      undefined,
    );
  });

  it('clears earlier failures for media that is linked again', async () => {
    grFinder.linkMediaToGoodreads.mockRejectedValueOnce(new Error('boom'));

    queue.enqueue({
      mediaType: 'ebook',
      mediaId: 'ebook-1',
      goodreadsId: 'gr-1',
    });
    await flush();
    expect(queue.getStatus().failedCount).toBe(1);

    queue.enqueue({
      mediaType: 'ebook',
      mediaId: 'ebook-1',
      goodreadsId: 'gr-2',
    });
    expect(queue.getStatus().failedCount).toBe(0);
  });

  it('dismisses failures on request', async () => {
    grFinder.linkMediaToGoodreads.mockRejectedValueOnce(new Error('boom'));

    queue.enqueue({
      mediaType: 'ebook',
      mediaId: 'ebook-1',
      goodreadsId: 'gr-1',
    });
    await flush();

    queue.dismissFailures();

    expect(queue.getStatus().failedCount).toBe(0);
  });

  it('pushes status over the websocket as jobs move through', async () => {
    queue.enqueue({
      mediaType: 'ebook',
      mediaId: 'ebook-1',
      goodreadsId: 'gr-1',
    });
    await flush();

    // Queued, started, finished.
    expect(
      wsEvents.goodreadsLinkStatusUpdated.mock.calls.length,
    ).toBeGreaterThanOrEqual(3);
    expect(wsEvents.goodreadsLinkStatusUpdated.mock.calls.at(-1)?.[0]).toEqual({
      active: null,
      pendingCount: 0,
      failedCount: 0,
      failures: [],
    });
  });
});
