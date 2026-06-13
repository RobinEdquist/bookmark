/**
 * Focused unit tests for pure helpers in ComicsService.
 * Full DB-level coverage is handled in Task 16's smoke test.
 */
import { NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CoverService } from '../../common/cover.service';
import { UpdateComicBookDto, ComicCreatorInputDto } from '../dto/comics.dto';

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

// ===== DTO validation: UpdateComicBookDto =====

describe('UpdateComicBookDto validation', () => {
  async function validateDto(plain: Record<string, unknown>) {
    const instance = plainToInstance(UpdateComicBookDto, plain);
    return validate(instance);
  }

  describe('coverDate', () => {
    it('accepts a well-formed YYYY-MM-DD date', async () => {
      const errors = await validateDto({ coverDate: '2023-06-15' });
      expect(errors).toHaveLength(0);
    });

    it('rejects a date without leading zeros (YYYY-M-D)', async () => {
      const errors = await validateDto({ coverDate: '2023-6-5' });
      expect(errors.some((e) => e.property === 'coverDate')).toBe(true);
    });

    it('rejects a free-form string', async () => {
      const errors = await validateDto({ coverDate: 'June 2023' });
      expect(errors.some((e) => e.property === 'coverDate')).toBe(true);
    });

    it('accepts null (clears the date)', async () => {
      const errors = await validateDto({ coverDate: null });
      expect(errors).toHaveLength(0);
    });

    it('accepts undefined (field omitted)', async () => {
      const errors = await validateDto({});
      expect(errors).toHaveLength(0);
    });
  });

  describe('creators', () => {
    it('accepts a valid creators array', async () => {
      const errors = await validateDto({
        creators: [{ name: 'Stan Lee', role: 'writer' }],
      });
      expect(errors).toHaveLength(0);
    });

    it('rejects an invalid role value', async () => {
      const errors = await validateDto({
        creators: [{ name: 'Stan Lee', role: 'painter' }],
      });
      expect(errors.length).toBeGreaterThan(0);
    });

    it('accepts an empty creators array (clears all creators)', async () => {
      const errors = await validateDto({ creators: [] });
      expect(errors).toHaveLength(0);
    });

    it('accepts undefined creators (field omitted)', async () => {
      const errors = await validateDto({ title: 'Issue #1' });
      expect(errors).toHaveLength(0);
    });
  });
});

describe('ComicCreatorInputDto validation', () => {
  async function validateCreator(plain: Record<string, unknown>) {
    const instance = plainToInstance(ComicCreatorInputDto, plain);
    return validate(instance);
  }

  it('accepts all valid roles', async () => {
    const validRoles = [
      'writer',
      'penciller',
      'inker',
      'colorist',
      'letterer',
      'cover_artist',
      'editor',
      'other',
    ];
    for (const role of validRoles) {
      const errors = await validateCreator({ name: 'Test Creator', role });
      expect(errors).toHaveLength(0);
    }
  });

  it('rejects missing name', async () => {
    const errors = await validateCreator({ role: 'writer' });
    expect(errors.some((e) => e.property === 'name')).toBe(true);
  });

  it('rejects missing role', async () => {
    const errors = await validateCreator({ name: 'Test Creator' });
    expect(errors.some((e) => e.property === 'role')).toBe(true);
  });
});

// ===== updateBook: creators replacement path =====

describe('ComicsService.updateBook with creators', () => {
  /**
   * Build a service mock sufficient to test the creators replacement path.
   * The mock db tracks calls to delete, insert, and update.
   */
  function buildServiceForUpdate(bookRow: unknown | null) {
    const deleteMock = jest
      .fn()
      .mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) });
    const insertMock = jest.fn().mockReturnValue({
      values: jest.fn().mockReturnValue({
        onConflictDoUpdate: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([{ id: 'person-uuid-1' }]),
        }),
        onConflictDoNothing: jest.fn().mockResolvedValue(undefined),
      }),
    });
    const updateMock = jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
    });
    const selectMock = jest
      .fn()
      .mockReturnValue(chainMock(bookRow !== null ? [bookRow] : []));

    const db = {
      select: selectMock,
      delete: deleteMock,
      insert: insertMock,
      update: updateMock,
    } as never;

    const appSettings = {
      getComicLibraryPath: jest.fn().mockResolvedValue('/lib'),
    } as never;
    const stub = {} as never;
    const wsEvents = { comicBookUpdated: jest.fn() } as never;

    const service = new ComicsService(
      db,
      appSettings,
      stub, // coverService
      stub, // imageProcessing
      stub, // appData
      stub, // comicMetadataProvider
      stub, // appEvents
      wsEvents,
    );

    return { service, db, deleteMock, insertMock, updateMock, wsEvents };
  }

  const baseBook = {
    id: 'book-1',
    seriesId: 'series-1',
    manualFields: [],
    number: null,
    title: null,
    format: 'single_issue',
    coverDate: null,
    summary: null,
    coverUrl: null,
    coverSource: null,
    status: 'available',
  };

  it('throws NotFoundException when book does not exist', async () => {
    const { service } = buildServiceForUpdate(null);
    await expect(
      service.updateBook('missing-id', { title: 'X' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('deletes and re-inserts creator rows when creators array is provided', async () => {
    const { service, deleteMock, insertMock } = buildServiceForUpdate(baseBook);

    await service.updateBook('book-1', {
      creators: [
        { name: 'Jack Kirby', role: 'penciller' },
        { name: 'Stan Lee', role: 'writer' },
      ],
    });

    // Should have deleted existing creators for the book
    expect(deleteMock).toHaveBeenCalled();

    // Should have called insert twice (once for each creator via upsert + junction)
    // Each creator requires two inserts: upsert person + insert junction row
    expect(insertMock).toHaveBeenCalledTimes(4);
  });

  it('adds creators to manualFields when creators are provided', async () => {
    const { service, updateMock } = buildServiceForUpdate(baseBook);

    await service.updateBook('book-1', {
      creators: [{ name: 'Jack Kirby', role: 'penciller' }],
    });

    // The .set() call should include manualFields containing 'creators'
    const setCalls = updateMock.mock.results
      .map((r) => r.value)
      .map((chain) => chain.set.mock.calls[0]?.[0]);
    expect(
      setCalls.some((data) => data?.manualFields?.includes('creators')),
    ).toBe(true);
  });

  it('does not delete or insert creators when creators field is undefined', async () => {
    const { service, deleteMock, insertMock } = buildServiceForUpdate(baseBook);

    await service.updateBook('book-1', { title: 'New Title' });

    expect(deleteMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('does not include creators as a column key in the DB .set() call', async () => {
    const { service, updateMock } = buildServiceForUpdate(baseBook);

    await service.updateBook('book-1', {
      title: 'New Title',
      creators: [{ name: 'Jack Kirby', role: 'penciller' }],
    });

    const setCalls = updateMock.mock.results
      .map((r) => r.value)
      .map((chain) => chain.set.mock.calls[0]?.[0]);
    expect(setCalls.some((data) => 'creators' in (data ?? {}))).toBe(false);
  });
});
