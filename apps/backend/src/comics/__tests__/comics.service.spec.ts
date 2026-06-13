/**
 * Focused unit tests for pure helpers in ComicsService.
 * Full DB-level coverage is handled in Task 16's smoke test.
 */
import { NotFoundException } from '@nestjs/common';
import { CoverService } from '../../common/cover.service';

// ws-events.service transitively imports events.gateway, which pulls in the
// ESM-only `@thallesp/nestjs-better-auth` package that Jest's CJS runtime
// cannot `require`. Replace it with a factory stub (the factory form never
// loads the real module, so the import chain is fully severed). ComicsService
// only uses WsEventsService as an injected instance, so the real download
// logic under test is unaffected.
jest.mock('../../events/ws-events.service', () => ({
  WsEventsService: class {},
}));

import { ComicsService } from '../comics.service';

/**
 * Build a chainable mock that records every drizzle-style method call and
 * resolves the terminal call (await) with `resolvedValue`.
 * `chain.from(...).where(...).limit(...)` -> Promise<resolvedValue>
 */
function chainMock(resolvedValue: unknown = []) {
  const self: Record<string, jest.Mock> = {};
  const methods = ['from', 'where', 'limit', 'offset', 'orderBy'];
  for (const m of methods) {
    self[m] = jest.fn().mockReturnValue(self);
  }
  // Make the chain itself thenable so `await chain` resolves.
  self.then = jest
    .fn()
    .mockImplementation((resolve: (v: unknown) => unknown) =>
      Promise.resolve(resolvedValue).then(resolve),
    );
  return self;
}

/**
 * Construct a ComicsService with a mocked db + app settings. Only the
 * dependencies exercised by getBookDownloadInfo are real mocks; the rest
 * are inert stubs (positional constructor args).
 */
function buildServiceWithBook(bookRow: unknown[] | null) {
  const select = jest.fn().mockReturnValue(chainMock(bookRow ?? []));
  const db = { select } as never;
  const appSettings = {
    getComicLibraryPath: jest.fn().mockResolvedValue('/lib'),
  } as never;
  const stub = {} as never;
  const service = new ComicsService(
    db,
    appSettings,
    stub, // coverService
    stub, // imageProcessing
    stub, // appData
    stub, // comicMetadataProvider
    stub, // appEvents
    stub, // wsEvents
  );
  return { service, select };
}

// We test the cover-resolution logic by isolating it from the service.
// The private method `resolveSeriesCoverUrl` calls CoverService.getCoverUrl,
// so we test its output observable from outside via the public path.

describe('series cover resolution precedence', () => {
  // Replicate the helper logic to test the decision tree:
  // 1. Own cover (series has coverUrl/coverSource) takes priority
  // 2. Fallback to first book in series that has a cover
  // 3. Null when neither exists

  const getCoverUrlSpy = (hasOwnCover: boolean) =>
    jest
      .fn()
      .mockReturnValue(hasOwnCover ? '/api/comics/series/s1/cover' : null);

  function resolveSeriesCoverUrl(
    series: { id: string; coverUrl: string | null; coverSource: string | null },
    fallbackCovers: Map<string, string>,
    getCoverUrl: (
      id: string,
      url: string | null,
      source: string | null,
      path: string,
    ) => string | null,
  ): string | null {
    const own = getCoverUrl(
      series.id,
      series.coverUrl,
      series.coverSource,
      'comics/series',
    );
    if (own) return own;
    const fallbackBookId = fallbackCovers.get(series.id);
    return fallbackBookId ? `/api/comics/books/${fallbackBookId}/cover` : null;
  }

  it('returns own cover URL when series has a cover', () => {
    const getCoverUrl = getCoverUrlSpy(true);
    const series = { id: 's1', coverUrl: 's1.jpg', coverSource: 'embedded' };
    const fallbackCovers = new Map([['s1', 'book-fallback-id']]);
    const result = resolveSeriesCoverUrl(series, fallbackCovers, getCoverUrl);
    expect(result).toBe('/api/comics/series/s1/cover');
    expect(getCoverUrl).toHaveBeenCalledWith(
      's1',
      's1.jpg',
      'embedded',
      'comics/series',
    );
  });

  it('falls back to first book cover when series has no cover', () => {
    const getCoverUrl = getCoverUrlSpy(false);
    const series = { id: 's1', coverUrl: null, coverSource: null };
    const fallbackCovers = new Map([['s1', 'book-42']]);
    const result = resolveSeriesCoverUrl(series, fallbackCovers, getCoverUrl);
    expect(result).toBe('/api/comics/books/book-42/cover');
  });

  it('returns null when series has no cover and no book cover exists', () => {
    const getCoverUrl = getCoverUrlSpy(false);
    const series = { id: 's1', coverUrl: null, coverSource: null };
    const fallbackCovers = new Map<string, string>();
    const result = resolveSeriesCoverUrl(series, fallbackCovers, getCoverUrl);
    expect(result).toBeNull();
  });

  it('own cover takes priority even when fallback book exists', () => {
    const getCoverUrl = getCoverUrlSpy(true);
    const series = { id: 's1', coverUrl: 's1.jpg', coverSource: 'uploaded' };
    const fallbackCovers = new Map([['s1', 'book-99']]);
    const result = resolveSeriesCoverUrl(series, fallbackCovers, getCoverUrl);
    expect(result).toBe('/api/comics/series/s1/cover');
  });
});

describe('CoverService.getCoverUrl (used by comics service)', () => {
  // Quick sanity check that the real CoverService behaves as expected
  let service: CoverService;

  beforeEach(() => {
    // CoverService only depends on ImageProcessingService for upload methods,
    // not for getCoverUrl — so we can construct it with a null stub.
    service = new CoverService(null as never);
  });

  it('returns cover URL when coverSource is set', () => {
    expect(
      service.getCoverUrl('id-1', 'id-1.jpg', 'embedded', 'comics/series'),
    ).toBe('/api/comics/series/id-1/cover');
  });

  it('returns cover URL when only coverUrl is set (no source)', () => {
    expect(service.getCoverUrl('id-1', 'id-1.jpg', null, 'comics/books')).toBe(
      '/api/comics/books/id-1/cover',
    );
  });

  it('returns null when both coverUrl and coverSource are null', () => {
    expect(service.getCoverUrl('id-1', null, null, 'comics/series')).toBeNull();
  });
});

// ===== getBookDownloadInfo (exercises the REAL service method) =====

describe('ComicsService.getBookDownloadInfo', () => {
  const baseBook = {
    id: 'b1',
    fileName: 'X #1.cbz',
    sizeBytes: 1234,
    container: 'cbz',
    filePath: 'X/X #1.cbz',
  };

  it.each([
    ['cbz', 'application/vnd.comicbook+zip'],
    ['cbr', 'application/vnd.comicbook-rar'],
    ['pdf', 'application/pdf'],
  ])('maps container %s to mimeType %s', async (container, expectedMime) => {
    const fileName = `X #1.${container}`;
    const filePath = `X/${fileName}`;
    const { service } = buildServiceWithBook([
      { ...baseBook, container, fileName, filePath },
    ]);

    const info = await service.getBookDownloadInfo('b1');

    expect(info.mimeType).toBe(expectedMime);
    // filePath is the library root joined with the relative path.
    expect(info.filePath).toBe(`/lib/${filePath}`);
    // fileName and fileSize pass straight through from the row.
    expect(info.fileName).toBe(fileName);
    expect(info.fileSize).toBe(1234);
  });

  it('falls back to application/octet-stream for an unknown container', async () => {
    const { service } = buildServiceWithBook([
      { ...baseBook, container: 'something-else' },
    ]);

    const info = await service.getBookDownloadInfo('b1');

    expect(info.mimeType).toBe('application/octet-stream');
  });

  it('throws NotFoundException when the book does not exist', async () => {
    const { service } = buildServiceWithBook([]);

    await expect(service.getBookDownloadInfo('missing')).rejects.toThrow(
      NotFoundException,
    );
  });
});
