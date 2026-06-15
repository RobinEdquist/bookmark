/**
 * Focused unit tests for pure helpers in ComicsService.
 * Full DB-level coverage is handled in Task 16's smoke test.
 */
import { NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CoverService } from '../../common/cover.service';
import { UpdateComicBookDto, ComicCreatorInputDto } from '../dto/comics.dto';
import { DEFAULT_COMIC_METADATA_PRIORITY } from '../../app-settings/schema';
import type { MetadataSource } from '../../app-settings/schema';

// ws-events.service transitively imports events.gateway, which pulls in the
// ESM-only `@thallesp/nestjs-better-auth` package that Jest's CJS runtime
// cannot `require`. Replace it with a factory stub (the factory form never
// loads the real module, so the import chain is fully severed). ComicsService
// only uses WsEventsService as an injected instance, so the real download
// logic under test is unaffected.
jest.mock('../../events/ws-events.service', () => ({
  WsEventsService: class {},
}));

// Replace only `unlink` so we can assert file deletion without touching disk;
// every other fs/promises export stays real for the rest of the suite.
jest.mock('fs/promises', () => ({
  ...jest.requireActual('fs/promises'),
  unlink: jest.fn(),
}));

import * as fsPromises from 'fs/promises';

import { ComicsService } from '../comics.service';

/**
 * Build a chainable mock that records every drizzle-style method call and
 * resolves the terminal call (await) with `resolvedValue`.
 * `chain.from(...).where(...).limit(...)` -> Promise<resolvedValue>
 */
function chainMock(resolvedValue: unknown = []) {
  const self: Record<string, jest.Mock> = {};
  const methods = [
    'from',
    'where',
    'limit',
    'offset',
    'orderBy',
    'innerJoin',
    'selectDistinct',
  ];
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
    stub, // collectionsService
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

// ===== ComicsService read-time metadata merge (getSeriesById / getBookById) =====

/**
 * Minimal series row with the fields used in getSeriesById.
 */
const baseSeriesRow: {
  id: string;
  title: string;
  sortTitle: string | null;
  description: string | null;
  publisher: string | null;
  imprint: string | null;
  startYear: number | null;
  totalIssueCount: number | null;
  language: string | null;
  ageRating: string | null;
  status: string;
  folderPath: string;
  manualFields: string[];
  coverUrl: string | null;
  coverSource: string | null;
  createdAt: Date;
  updatedAt: Date;
} = {
  id: 'series-1',
  title: 'Stored Title',
  sortTitle: null,
  description: 'Stored desc',
  publisher: 'Stored Publisher',
  imprint: null,
  startYear: 1990,
  totalIssueCount: null,
  language: null,
  ageRating: null,
  status: 'available',
  folderPath: '/comics/series-1',
  manualFields: [],
  coverUrl: null,
  coverSource: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

/**
 * Build a service mock sufficient to test getSeriesById and getBookById
 * metadata-merge behaviour.
 *
 * getSeriesById call order:
 *   1. verifySeriesNotBlacklisted  → comicSeriesTags check (returns [])
 *   2. series fetch                → returns [seriesRow]
 *   3. Promise.all(6 queries):
 *        [0] comicBooks list       → returns []
 *        [1] genres join           → returns []
 *        [2] tags join             → returns []
 *        [3] creators join         → selectDistinct returns []
 *        [4] volumeLinks join      → returns volumeRows
 *        [5] seriesTagRows         → selectDistinct returns seriesTagRows
 *
 * getBookById call order:
 *   1. verifyBookNotBlacklisted → book seriesId fetch (returns [{ seriesId }])
 *   2. verifySeriesNotBlacklisted → comicSeriesTags check (returns [])
 *   3. book fetch               → returns [bookRow]
 *   4. Promise.all(4 queries):
 *        [0] series fetch        → returns [{ id, title }]
 *        [1] creators join       → returns []
 *        [2] issueLinks join     → returns issueRows
 *        [3] tagRows             → returns tagRows
 */
function buildServiceForMergeTest({
  seriesRow = baseSeriesRow,
  volumeRows = [] as unknown[],
  seriesTagRows = [] as unknown[],
  bookRow = null as unknown | null,
  issueRows = [] as unknown[],
  bookTagRows = [] as unknown[],
  priority = DEFAULT_COMIC_METADATA_PRIORITY,
}: {
  seriesRow?: typeof baseSeriesRow;
  volumeRows?: unknown[];
  seriesTagRows?: unknown[];
  bookRow?: unknown | null;
  issueRows?: unknown[];
  bookTagRows?: unknown[];
  priority?: typeof DEFAULT_COMIC_METADATA_PRIORITY;
} = {}) {
  const select = jest.fn();
  const selectDistinct = jest.fn();

  // We use mockReturnValueOnce so each select()/selectDistinct() call returns the right data.
  // Helper that makes a chainable mock ending with the given value.
  const chain = (val: unknown) => chainMock(val);

  if (bookRow !== null) {
    // getBookById call sequence:
    // call 1 (select): verifyBookNotBlacklisted — book seriesId lookup
    select.mockReturnValueOnce(
      chain([
        { seriesId: (bookRow as { seriesId?: string }).seriesId ?? 'series-1' },
      ]),
    );
    // call 2 (select): verifySeriesNotBlacklisted — comicSeriesTags innerJoin (no blacklisted tags)
    select.mockReturnValueOnce(chain([]));
    // call 3 (select): book fetch
    select.mockReturnValueOnce(chain([bookRow]));
    // Promise.all(4 queries):
    // call 4 (select, Promise.all[0]): series fetch
    select.mockReturnValueOnce(
      chain([{ id: 'series-1', title: 'Series Title' }]),
    );
    // call 5 (select, Promise.all[1]): creators join (uses select, not selectDistinct in getBookById)
    select.mockReturnValueOnce(chain([]));
    // call 6 (select, Promise.all[2]): issueLinks join
    select.mockReturnValueOnce(chain(issueRows));
    // call 7 (select, Promise.all[3]): tagRows
    select.mockReturnValueOnce(chain(bookTagRows));
  } else {
    // getSeriesById call sequence:
    // call 1 (select): verifySeriesNotBlacklisted — comicSeriesTags innerJoin (no blacklisted tags)
    select.mockReturnValueOnce(chain([]));
    // call 2 (select): series fetch
    select.mockReturnValueOnce(chain([seriesRow]));
    // Promise.all(6 queries):
    // call 3 (select, Promise.all[0]): comicBooks list
    select.mockReturnValueOnce(chain([]));
    // call 4 (select, Promise.all[1]): genres innerJoin
    select.mockReturnValueOnce(chain([]));
    // call 5 (select, Promise.all[2]): tags innerJoin
    select.mockReturnValueOnce(chain([]));
    // call 6 (selectDistinct, Promise.all[3]): creators selectDistinct+innerJoin
    selectDistinct.mockReturnValueOnce(chain([]));
    // call 7 (select, Promise.all[4]): volumeLinks innerJoin
    select.mockReturnValueOnce(chain(volumeRows));
    // call 8 (selectDistinct, Promise.all[5]): seriesTagRows selectDistinct+innerJoin
    selectDistinct.mockReturnValueOnce(chain(seriesTagRows));
  }

  // Fallback for any unexpected calls
  select.mockReturnValue(chain([]));
  selectDistinct.mockReturnValue(chain([]));

  const db = { select, selectDistinct } as never;
  const appSettings = {
    getComicLibraryPath: jest.fn().mockResolvedValue('/lib'),
    getComicMetadataPriority: jest.fn().mockResolvedValue(priority),
  } as never;
  const coverService = {
    getCoverUrl: jest.fn().mockReturnValue(null),
  } as never;
  const stub = {} as never;
  const wsEvents = {
    comicSeriesUpdated: jest.fn(),
    comicBookUpdated: jest.fn(),
  } as never;

  const collectionsService = {
    findForSeries: jest.fn().mockResolvedValue([]),
  } as never;

  const service = new ComicsService(
    db,
    appSettings,
    coverService,
    stub, // imageProcessing
    stub, // appData
    stub, // comicMetadataProvider
    stub, // appEvents
    wsEvents,
    collectionsService,
  );

  return { service, select, appSettings };
}

describe('ComicsService.getSeriesById — metadata merge', () => {
  // A volume whose name differs from the stored title — used to prove the
  // manualFields guard short-circuits even a comicvine-FIRST priority.
  const cvNameVolume = (name: string) => [
    {
      volume: {
        comicvineVolumeId: 1,
        name,
        description: null,
        publisherName: null,
        startYear: null,
        siteDetailUrl: null,
        imageUrl: null,
      },
    },
  ];

  it('manual wins over comicvine-FIRST priority when title is in manualFields', async () => {
    // Priority puts comicvine BEFORE embedded/manual, so the ONLY way the
    // stored title can win is the manualFields guard short-circuiting first.
    // Deleting the guard from resolveFieldByPriority would return 'CV Value'.
    const priority = {
      ...DEFAULT_COMIC_METADATA_PRIORITY,
      title: ['comicvine', 'manual', 'embedded'] as MetadataSource[],
    };
    const seriesRow = {
      ...baseSeriesRow,
      title: 'Manual Value',
      manualFields: ['title'],
    };

    const { service } = buildServiceForMergeTest({
      seriesRow,
      volumeRows: cvNameVolume('CV Value'),
      priority,
    });
    const result = await service.getSeriesById('series-1', 'user-1');

    expect(result.title).toBe('Manual Value');
  });

  it('counterexample: with the SAME comicvine-FIRST priority but title NOT in manualFields, comicvine wins', async () => {
    // Identical priority to the test above; only difference is manualFields.
    // This proves the guard is real and CONDITIONAL on manualFields:
    // flipping manualFields is what flips the outcome.
    const priority = {
      ...DEFAULT_COMIC_METADATA_PRIORITY,
      title: ['comicvine', 'manual', 'embedded'] as MetadataSource[],
    };
    const seriesRow = {
      ...baseSeriesRow,
      title: 'Stored',
      manualFields: ['description'], // a different key — title is NOT flagged
    };

    const { service } = buildServiceForMergeTest({
      seriesRow,
      volumeRows: cvNameVolume('CV Value'),
      priority,
    });
    const result = await service.getSeriesById('series-1', 'user-1');

    expect(result.title).toBe('CV Value');
  });

  it('ComicVine fills empty description when not in manualFields', async () => {
    const seriesRow = {
      ...baseSeriesRow,
      description: null,
      manualFields: [],
    };
    const volumeRows = [
      {
        volume: {
          comicvineVolumeId: 1,
          name: 'CV Series',
          description: 'CV Desc',
          publisherName: null,
          startYear: null,
          siteDetailUrl: null,
          imageUrl: null,
        },
      },
    ];

    const { service } = buildServiceForMergeTest({ seriesRow, volumeRows });
    const result = await service.getSeriesById('series-1', 'user-1');

    expect(result.description).toBe('CV Desc');
  });

  it('unlinked series returns stored values unchanged and comicvine.linked === false', async () => {
    const seriesRow = {
      ...baseSeriesRow,
      title: 'Stored',
      description: 'Stored desc',
      manualFields: [],
    };

    const { service } = buildServiceForMergeTest({ seriesRow, volumeRows: [] });
    const result = await service.getSeriesById('series-1', 'user-1');

    expect(result.title).toBe('Stored');
    expect(result.description).toBe('Stored desc');
    expect(result.comicvine.linked).toBe(false);
  });

  it('comicvine block exposes volume metadata when linked', async () => {
    const volumeRows = [
      {
        volume: {
          comicvineVolumeId: 42,
          name: 'X-Men',
          description: 'Mutants',
          publisherName: 'Marvel',
          startYear: 1963,
          siteDetailUrl: 'https://comicvine.gamespot.com/x-men/4050-3989/',
          imageUrl: 'https://example.com/xmen.jpg',
        },
      },
    ];

    const { service } = buildServiceForMergeTest({ volumeRows });
    const result = await service.getSeriesById('series-1', 'user-1');

    expect(result.comicvine).toEqual({
      linked: true,
      volumeId: 42,
      name: 'X-Men',
      siteDetailUrl: 'https://comicvine.gamespot.com/x-men/4050-3989/',
      imageUrl: 'https://example.com/xmen.jpg',
    });
  });
});

// ===== ComicsService.getSeriesById — missing-issue detection =====

/**
 * Build a service mock for missing-issue tests.
 * We need to pass books to getSeriesById, so we wire up call 3 (comicBooks list)
 * in the getSeriesById sequence to return the provided books.
 */
function buildServiceForMissingIssueTest({
  books = [] as unknown[],
  volumeRows = [] as unknown[],
}: {
  books?: unknown[];
  volumeRows?: unknown[];
}) {
  const select = jest.fn();
  const selectDistinct = jest.fn();
  const chain = (val: unknown) => chainMock(val);

  // getSeriesById call sequence:
  // call 1 (select): verifySeriesNotBlacklisted
  select.mockReturnValueOnce(chain([]));
  // call 2 (select): series fetch
  select.mockReturnValueOnce(chain([baseSeriesRow]));
  // Promise.all(6 queries):
  // call 3 (select, Promise.all[0]): comicBooks list — the books under test
  select.mockReturnValueOnce(chain(books));
  // call 4 (select, Promise.all[1]): genres
  select.mockReturnValueOnce(chain([]));
  // call 5 (select, Promise.all[2]): tags
  select.mockReturnValueOnce(chain([]));
  // call 6 (selectDistinct, Promise.all[3]): creators
  selectDistinct.mockReturnValueOnce(chain([]));
  // call 7 (select, Promise.all[4]): volumeLinks
  select.mockReturnValueOnce(chain(volumeRows));
  // call 8 (selectDistinct, Promise.all[5]): seriesTagRows
  selectDistinct.mockReturnValueOnce(chain([]));

  // Fallback
  select.mockReturnValue(chain([]));
  selectDistinct.mockReturnValue(chain([]));

  const db = { select, selectDistinct } as never;
  const appSettings = {
    getComicLibraryPath: jest.fn().mockResolvedValue('/lib'),
    getComicMetadataPriority: jest
      .fn()
      .mockResolvedValue(DEFAULT_COMIC_METADATA_PRIORITY),
  } as never;
  const coverService = {
    getCoverUrl: jest.fn().mockReturnValue(null),
  } as never;
  const stub = {} as never;
  const wsEvents = { comicSeriesUpdated: jest.fn() } as never;

  const collectionsService = {
    findForSeries: jest.fn().mockResolvedValue([]),
  } as never;

  const service = new ComicsService(
    db,
    appSettings,
    coverService,
    stub,
    stub,
    stub,
    stub,
    wsEvents,
    collectionsService,
  );
  return { service };
}

/** Minimal comic book row for missing-issue tests. */
function makeBook(
  number: string | null,
  format: string = 'single_issue',
  issueCountFromFile: number | null = null,
  collects: string | null = null,
): unknown {
  return {
    id: `book-${number ?? 'null'}`,
    seriesId: 'series-1',
    title: null,
    number,
    sortNumber: number,
    format,
    coverDate: null,
    pageCount: null,
    fileName: `issue-${number}.cbz`,
    sizeBytes: 1000,
    container: 'cbz',
    status: 'available',
    coverUrl: null,
    coverSource: null,
    web: null,
    ageRating: null,
    issueCountFromFile,
    collects,
    manualFields: [],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };
}

describe('ComicsService.getSeriesById — missing-issue detection', () => {
  it('reports gap 51 and tail [53, 54] for #1–#50 + #52 with countOfIssues=54', async () => {
    // Build books #1..#50 plus #52 (single issues, numbers as strings)
    const books: unknown[] = [];
    for (let i = 1; i <= 50; i++) books.push(makeBook(String(i)));
    books.push(makeBook('52'));

    const volumeRows = [
      {
        volume: {
          comicvineVolumeId: 1,
          name: 'Test',
          description: null,
          publisherName: null,
          startYear: null,
          siteDetailUrl: null,
          imageUrl: null,
          countOfIssues: 54,
        },
      },
    ];

    const { service } = buildServiceForMissingIssueTest({ books, volumeRows });
    const result = await service.getSeriesById('series-1', 'user-1');

    // Gap: #51 is below maxOwned (52) and missing.
    expect(result.gaps).toContain('51');
    expect(result.gaps).not.toContain('52');
    expect(result.gaps).toHaveLength(1);
    // Published tail: #53 and #54 are above maxOwned (52) but within CV count (54).
    expect(result.unownedPublished).toContain('53');
    expect(result.unownedPublished).toContain('54');
    expect(result.unownedPublished).toHaveLength(2);
    expect(result.publishedTotal).toBe(54);
  });

  it('returns empty gaps for contiguous #1, #2, #3 with no linked volume', async () => {
    const books = [makeBook('1'), makeBook('2'), makeBook('3')];

    const { service } = buildServiceForMissingIssueTest({
      books,
      volumeRows: [],
    });
    const result = await service.getSeriesById('series-1', 'user-1');

    expect(result.gaps).toEqual([]);
    expect(result.publishedTotal).toBeNull();
    expect(result.unownedPublished).toEqual([]);
  });

  it('ignores tpb format and non-integer number when computing gaps', async () => {
    // #1 and #3 present as single issues; #1.5 as single_issue (non-integer, ignored);
    // a TPB with number='2' (should be ignored).
    // maxOwned = 3, so gap = [2].
    const books = [
      makeBook('1'),
      makeBook('1.5'), // non-integer → ignored
      makeBook('2', 'tpb'), // tpb → ignored
      makeBook('3'),
    ];

    const { service } = buildServiceForMissingIssueTest({
      books,
      volumeRows: [],
    });
    const result = await service.getSeriesById('series-1', 'user-1');

    // Only #1 and #3 are counted as presentInts → maxOwned=3 → gap at #2.
    expect(result.gaps).toContain('2');
    // #1, #3 are present → not in gaps.
    expect(result.gaps).not.toContain('1');
    expect(result.gaps).not.toContain('3');
    // #1.5 should never appear in gaps.
    expect(result.gaps).not.toContain('1.5');
    // No CV volume → no tail.
    expect(result.publishedTotal).toBeNull();
    expect(result.unownedPublished).toEqual([]);
  });

  it('counts collected-edition contents as present (no false gaps)', async () => {
    // A single compendium collecting #1-54; no single issues.
    const books = [makeBook(null, 'tpb', null, '1-54')];

    const { service } = buildServiceForMissingIssueTest({
      books,
      volumeRows: [],
    });
    const result = await service.getSeriesById('series-1', 'user-1');

    expect(result.gaps).toEqual([]);
    expect(result.publishedTotal).toBeNull();
    expect(result.unownedPublished).toEqual([]);
  });
});

describe('ComicsService.getBookById — metadata merge', () => {
  const baseBookRow = {
    id: 'book-1',
    seriesId: 'series-1',
    title: 'Stored Book Title',
    number: '1',
    sortNumber: '1',
    format: 'single_issue',
    coverDate: '2023-01-01',
    summary: null,
    storeDate: null,
    filePath: 'series-1/book1.cbz',
    fileName: 'book1.cbz',
    sizeBytes: 5000,
    container: 'cbz',
    status: 'available',
    coverUrl: null,
    coverSource: null,
    pageCount: null,
    web: null,
    ageRating: null,
    issueCountFromFile: null,
    manualFields: [] as string[],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  // An issue whose name differs from the stored book title — used to prove
  // the manualFields guard short-circuits even a comicvine-FIRST priority.
  const cvNameIssue = (name: string) => [
    {
      issue: {
        comicvineIssueId: 100,
        issueNumber: '1',
        name,
        coverDate: '2023-01-01',
        description: null,
        siteDetailUrl: null,
        imageUrl: null,
        personCredits: [],
      },
    },
  ];

  it('manual book title wins over comicvine-FIRST priority when title is in manualFields', async () => {
    // Priority puts comicvine BEFORE embedded/manual for bookTitle, so the
    // ONLY way the stored title can win is the manualFields guard. NOTE the
    // manualFields entry is the COLUMN name 'title' (not the priority key
    // 'bookTitle'). Deleting the guard would return 'CV Issue Name'.
    const priority = {
      ...DEFAULT_COMIC_METADATA_PRIORITY,
      bookTitle: ['comicvine', 'manual', 'embedded'] as MetadataSource[],
    };
    const bookRow = {
      ...baseBookRow,
      title: 'Manual Book Title',
      manualFields: ['title'],
    };

    const { service } = buildServiceForMergeTest({
      bookRow,
      issueRows: cvNameIssue('CV Issue Name'),
      priority,
    });
    const result = await service.getBookById('book-1', 'user-1');

    expect(result.title).toBe('Manual Book Title');
  });

  it('counterexample: with the SAME comicvine-FIRST bookTitle priority but title NOT in manualFields, comicvine wins', async () => {
    // Identical priority to the test above; only manualFields differs.
    // Proves the guard is real and CONDITIONAL on manualFields.
    const priority = {
      ...DEFAULT_COMIC_METADATA_PRIORITY,
      bookTitle: ['comicvine', 'manual', 'embedded'] as MetadataSource[],
    };
    const bookRow = {
      ...baseBookRow,
      title: 'Stored',
      manualFields: [],
    };

    const { service } = buildServiceForMergeTest({
      bookRow,
      issueRows: cvNameIssue('CV Issue Name'),
      priority,
    });
    const result = await service.getBookById('book-1', 'user-1');

    expect(result.title).toBe('CV Issue Name');
  });

  it('ComicVine fills empty book summary when not in manualFields', async () => {
    const bookRow = {
      ...baseBookRow,
      summary: null,
      manualFields: [],
    };
    const issueRows = [
      {
        issue: {
          comicvineIssueId: 101,
          issueNumber: '1',
          name: null,
          coverDate: null,
          description: 'CV Summary text',
          siteDetailUrl: null,
          imageUrl: null,
          personCredits: [],
        },
      },
    ];

    const { service } = buildServiceForMergeTest({ bookRow, issueRows });
    const result = await service.getBookById('book-1', 'user-1');

    expect(result.summary).toBe('CV Summary text');
  });

  it('unlinked book returns stored values and comicvine.linked === false', async () => {
    const bookRow = { ...baseBookRow, title: 'Stored', manualFields: [] };

    const { service } = buildServiceForMergeTest({ bookRow, issueRows: [] });
    const result = await service.getBookById('book-1', 'user-1');

    expect(result.title).toBe('Stored');
    expect(result.comicvine.linked).toBe(false);
  });

  it('comicvine block exposes issue metadata and suggestedCreators when linked', async () => {
    const issueRows = [
      {
        issue: {
          comicvineIssueId: 200,
          issueNumber: '5',
          name: 'Issue Five',
          coverDate: '2023-05-01',
          description: null,
          siteDetailUrl: 'https://comicvine.gamespot.com/issue/200/',
          imageUrl: 'https://example.com/issue5.jpg',
          personCredits: [{ name: 'Jack Kirby', role: 'penciller' }],
        },
      },
    ];

    const { service } = buildServiceForMergeTest({
      bookRow: baseBookRow,
      issueRows,
    });
    const result = await service.getBookById('book-1', 'user-1');

    expect(result.comicvine).toEqual({
      linked: true,
      issueId: 200,
      name: 'Issue Five',
      issueNumber: '5',
      siteDetailUrl: 'https://comicvine.gamespot.com/issue/200/',
      imageUrl: 'https://example.com/issue5.jpg',
      suggestedCreators: [{ name: 'Jack Kirby', role: 'penciller' }],
    });
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
      stub, // collectionsService
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

// ===== getBookById — metadataTags grouping =====

describe('ComicsService.getBookById — metadataTags grouping', () => {
  const baseBookRow = {
    id: 'book-1',
    seriesId: 'series-1',
    title: 'Stored Book Title',
    number: '1',
    sortNumber: '1',
    format: 'single_issue',
    coverDate: '2023-01-01',
    summary: null,
    storeDate: null,
    filePath: 'series-1/book1.cbz',
    fileName: 'book1.cbz',
    sizeBytes: 5000,
    container: 'cbz',
    status: 'available',
    coverUrl: null,
    coverSource: null,
    pageCount: null,
    web: 'https://example.com/issue',
    ageRating: 'Teen',
    issueCountFromFile: 12,
    manualFields: [] as string[],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  it('groups tag rows by type into metadataTags object', async () => {
    const bookTagRows = [
      { type: 'story_arc', value: 'Civil War' },
      { type: 'story_arc', value: 'Secret Invasion' },
      { type: 'character', value: 'Iron Man' },
      { type: 'team', value: 'Avengers' },
      { type: 'location', value: 'New York' },
    ];

    const { service } = buildServiceForMergeTest({
      bookRow: baseBookRow,
      bookTagRows,
    });
    const result = await service.getBookById('book-1', 'user-1');

    expect(result.metadataTags).toEqual({
      storyArcs: ['Civil War', 'Secret Invasion'],
      characters: ['Iron Man'],
      teams: ['Avengers'],
      locations: ['New York'],
    });
  });

  it('returns empty arrays for all groups when book has no tags', async () => {
    const { service } = buildServiceForMergeTest({
      bookRow: baseBookRow,
      bookTagRows: [],
    });
    const result = await service.getBookById('book-1', 'user-1');

    expect(result.metadataTags).toEqual({
      storyArcs: [],
      characters: [],
      teams: [],
      locations: [],
    });
  });

  it('returns web, ageRating, and issueCountFromFile from book row', async () => {
    const { service } = buildServiceForMergeTest({
      bookRow: baseBookRow,
      bookTagRows: [],
    });
    const result = await service.getBookById('book-1', 'user-1');

    expect(result.web).toBe('https://example.com/issue');
    expect(result.ageRating).toBe('Teen');
    expect(result.issueCountFromFile).toBe(12);
  });
});

// ===== getSeriesById — aggregatedTags =====

describe('ComicsService.getSeriesById — aggregatedTags', () => {
  it('aggregates story_arc and character tags across series books', async () => {
    const seriesTagRows = [
      { type: 'story_arc', value: 'Dark Phoenix' },
      { type: 'story_arc', value: 'Age of Apocalypse' },
      { type: 'character', value: 'Wolverine' },
      { type: 'character', value: 'Cyclops' },
    ];

    const { service } = buildServiceForMergeTest({ seriesTagRows });
    const result = await service.getSeriesById('series-1', 'user-1');

    expect(result.aggregatedTags).toEqual({
      storyArcs: ['Dark Phoenix', 'Age of Apocalypse'],
      characters: ['Wolverine', 'Cyclops'],
    });
  });

  it('returns empty arrays when series has no metadata tags', async () => {
    const { service } = buildServiceForMergeTest({ seriesTagRows: [] });
    const result = await service.getSeriesById('series-1', 'user-1');

    expect(result.aggregatedTags).toEqual({
      storyArcs: [],
      characters: [],
    });
  });
});

// ===== getSeriesById — published tail with ComicVine count =====

describe('ComicsService.getSeriesById — published tail via ComicVine count', () => {
  it('no tail when no volume is linked (ongoing with unknown total)', async () => {
    // Books #1..#50 are present; no CV volume linked.
    // issueCountFromFile is no longer used as a ceiling — no tail fabricated.
    const books: unknown[] = [];
    for (let i = 1; i <= 50; i++)
      books.push(makeBook(String(i), 'single_issue', 54));

    const { service } = buildServiceForMissingIssueTest({
      books,
      volumeRows: [],
    });
    const result = await service.getSeriesById('series-1', 'user-1');

    // No CV count → publishedTotal null, no unownedPublished tail.
    expect(result.publishedTotal).toBeNull();
    expect(result.unownedPublished).toEqual([]);
    // No gaps either (contiguous 1..50).
    expect(result.gaps).toEqual([]);
  });

  it('reports tail via CV countOfIssues when linked', async () => {
    // Books #1..#50 with volume.countOfIssues: 52.
    // CV count → publishedTotal=52, unownedPublished=[51, 52].
    const books: unknown[] = [];
    for (let i = 1; i <= 50; i++)
      books.push(makeBook(String(i), 'single_issue', 54));

    const volumeRows = [
      {
        volume: {
          comicvineVolumeId: 1,
          name: 'Test',
          description: null,
          publisherName: null,
          startYear: null,
          siteDetailUrl: null,
          imageUrl: null,
          countOfIssues: 52,
        },
      },
    ];

    const { service } = buildServiceForMissingIssueTest({ books, volumeRows });
    const result = await service.getSeriesById('series-1', 'user-1');

    // CV count 52; present 1–50; tail = 51, 52.
    expect(result.publishedTotal).toBe(52);
    expect(result.unownedPublished).toContain('51');
    expect(result.unownedPublished).toContain('52');
    expect(result.unownedPublished).not.toContain('53');
    expect(result.unownedPublished).toHaveLength(2);
    // No gaps (contiguous 1..50).
    expect(result.gaps).toEqual([]);
  });
});

// ===== updateBook: ageRating field =====

describe('ComicsService.updateBook — ageRating field', () => {
  function buildServiceForAgeRating(bookRow: unknown | null) {
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
      stub, // collectionsService
    );

    return { service, updateMock };
  }

  const baseBook = {
    id: 'book-1',
    seriesId: 'series-1',
    manualFields: [] as string[],
    number: null,
    title: null,
    format: 'single_issue',
    coverDate: null,
    summary: null,
    ageRating: null,
    coverUrl: null,
    coverSource: null,
    status: 'available',
  };

  it('writes ageRating value into the DB update', async () => {
    const { service, updateMock } = buildServiceForAgeRating(baseBook);

    await service.updateBook('book-1', { ageRating: 'Teen' });

    const setCalls = updateMock.mock.results
      .map((r) => r.value)
      .map((chain) => chain.set.mock.calls[0]?.[0]);
    expect(setCalls.some((data) => data?.ageRating === 'Teen')).toBe(true);
  });

  it('records ageRating in manualFields when provided', async () => {
    const { service, updateMock } = buildServiceForAgeRating(baseBook);

    await service.updateBook('book-1', { ageRating: 'Mature' });

    const setCalls = updateMock.mock.results
      .map((r) => r.value)
      .map((chain) => chain.set.mock.calls[0]?.[0]);
    expect(
      setCalls.some((data) => data?.manualFields?.includes('ageRating')),
    ).toBe(true);
  });

  it('accepts null to clear ageRating and records it in manualFields', async () => {
    const bookWithRating = {
      ...baseBook,
      ageRating: 'Teen',
      manualFields: ['ageRating'],
    };
    const { service, updateMock } = buildServiceForAgeRating(bookWithRating);

    await service.updateBook('book-1', { ageRating: null });

    const setCalls = updateMock.mock.results
      .map((r) => r.value)
      .map((chain) => chain.set.mock.calls[0]?.[0]);
    expect(setCalls.some((data) => data?.ageRating === null)).toBe(true);
    // manualFields should still contain ageRating (deduped from Set)
    expect(
      setCalls.some((data) => data?.manualFields?.includes('ageRating')),
    ).toBe(true);
  });
});

// ===== updateBooksBatch =====

describe('ComicsService.updateBooksBatch', () => {
  function buildServiceForBatch(bookRows: { id: string }[]) {
    const updateMock = jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
    });

    // selectMock returns the matching book for each id lookup.
    // updateBook calls select once per book id — return the right row each time.
    const selectMock = jest.fn().mockImplementation(() =>
      chainMock(
        bookRows.length > 0
          ? [
              {
                id: 'any',
                seriesId: 'series-1',
                manualFields: [],
                number: null,
                title: null,
                format: 'single_issue',
                coverDate: null,
                summary: null,
                ageRating: null,
                coverUrl: null,
                coverSource: null,
                status: 'available',
              },
            ]
          : [],
      ),
    );

    const db = {
      select: selectMock,
      delete: jest
        .fn()
        .mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
      insert: jest.fn(),
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
      stub,
      stub,
      stub,
      stub,
      stub,
      wsEvents,
      stub, // collectionsService
    );

    return { service, updateMock, selectMock };
  }

  it('returns { updated: 0 } without touching the DB when data is empty', async () => {
    const { service, updateMock } = buildServiceForBatch([
      { id: 'a' },
      { id: 'b' },
    ]);

    const result = await service.updateBooksBatch(['a', 'b'], {});

    expect(result).toEqual({ updated: 0 });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('calls updateBook for each id and returns { updated: N }', async () => {
    const { service, updateMock } = buildServiceForBatch([
      { id: 'a' },
      { id: 'b' },
    ]);

    const result = await service.updateBooksBatch(['a', 'b'], {
      format: 'tpb',
    });

    expect(result).toEqual({ updated: 2 });
    // updateBook calls db.update once per book
    expect(updateMock).toHaveBeenCalledTimes(2);
  });

  it('applies format to all books in the batch', async () => {
    const { service, updateMock } = buildServiceForBatch([
      { id: 'a' },
      { id: 'b' },
    ]);

    await service.updateBooksBatch(['a', 'b'], { format: 'tpb' });

    const setCalls = updateMock.mock.results.flatMap((r) =>
      r.value.set.mock.calls.map((c: unknown[]) => c[0]),
    );
    expect(
      setCalls.every((data: Record<string, unknown>) => data?.format === 'tpb'),
    ).toBe(true);
  });

  it('applies ageRating to all books in the batch', async () => {
    const { service, updateMock } = buildServiceForBatch([
      { id: 'a' },
      { id: 'b' },
    ]);

    await service.updateBooksBatch(['a', 'b'], { ageRating: 'Mature' });

    const setCalls = updateMock.mock.results.flatMap((r) =>
      r.value.set.mock.calls.map((c: unknown[]) => c[0]),
    );
    expect(
      setCalls.every(
        (data: Record<string, unknown>) => data?.ageRating === 'Mature',
      ),
    ).toBe(true);
  });

  it('skips missing books (NotFoundException) and still updates the others', async () => {
    // First book not found (select returns []), second found
    const deleteMock = jest
      .fn()
      .mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) });
    const updateMock = jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
    });

    let selectCallCount = 0;
    const selectMock = jest.fn().mockImplementation(() => {
      selectCallCount++;
      // First call returns no book (not found), second call returns a book
      if (selectCallCount === 1) return chainMock([]);
      return chainMock([
        {
          id: 'b',
          seriesId: 'series-1',
          manualFields: [],
          number: null,
          title: null,
          format: 'single_issue',
          coverDate: null,
          summary: null,
          ageRating: null,
          coverUrl: null,
          coverSource: null,
          status: 'available',
        },
      ]);
    });

    const db = {
      select: selectMock,
      delete: deleteMock,
      insert: jest.fn(),
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
      stub,
      stub,
      stub,
      stub,
      stub,
      wsEvents,
      stub, // collectionsService
    );

    // 'a' is missing, 'b' is found — should update 1
    const result = await service.updateBooksBatch(['a', 'b'], {
      format: 'tpb',
    });

    expect(result).toEqual({ updated: 1 });
    expect(updateMock).toHaveBeenCalledTimes(1);
  });
});

// ===== findAllSeries — metadataTag filter applies exists-subquery =====

describe('ComicsService.findAllSeries — metadataTag filter', () => {
  /**
   * Build a minimal service mock for findAllSeries.
   *
   * findAllSeries calls this.db.select() for:
   *   (a) bookCount inline subquery (built before Promise.all)
   *   (b) exists() subquery for metadataTag — ONLY when tag type is valid
   *   (c) outer items query (Promise.all[0]) — returns [] → no .series.id access
   *   (d) count query (Promise.all[1]) — returns [{total}]
   *
   * `existsSubqueries` lets callers specify how many additional exists()
   * calls to account for (e.g. 1 for metadataTag with valid type, 0 for unknown).
   */
  function buildServiceForFindAll(total: number, existsSubqueries = 0) {
    // Build the queue: (a) bookCount, then N exists subqueries, then (c) items, then (d) count.
    const queue: unknown[] = [
      [], // (a) bookCount
      ...Array.from({ length: existsSubqueries }, () => []), // (b) exists calls
      [], // (c) items query — empty → seriesIds = [] → no i.series.id access
      [{ total }], // (d) count query
    ];
    const select = jest.fn().mockImplementation(() => {
      const val = queue.length > 1 ? queue.shift() : queue[0];
      return chainMock(val);
    });

    const execute = jest.fn().mockResolvedValue({ rows: [] });

    const db = { select, execute } as never;
    const appSettings = {
      getComicLibraryPath: jest.fn().mockResolvedValue('/lib'),
    } as never;
    const coverService = {
      getCoverUrl: jest.fn().mockReturnValue(null),
    } as never;
    const stub = {} as never;

    const service = new ComicsService(
      db,
      appSettings,
      coverService,
      stub, // imageProcessing
      stub, // appData
      stub, // comicMetadataProvider
      stub, // appEvents
      stub, // wsEvents
      stub, // collectionsService
    );
    return { service, select };
  }

  it('resolves without error when metadataTag filter is provided with valid type', async () => {
    // valid type "character" → 1 exists subquery added
    const { service } = buildServiceForFindAll(0, 1);

    // Exercises the code path that parses the tag and adds the exists-subquery.
    const result = await service.findAllSeries({
      metadataTag: 'character:Iron Man',
    });

    expect(result).toHaveProperty('series');
    expect(result).toHaveProperty('total');
  });

  it('resolves without error when metadataTag contains a colon in the value', async () => {
    // valid type "story_arc" → 1 exists subquery added; value has extra colons (ignored)
    const { service } = buildServiceForFindAll(0, 1);

    const result = await service.findAllSeries({
      metadataTag: 'story_arc:Civil War: The Road to Recovery',
    });

    expect(result).toHaveProperty('series');
  });

  it('resolves without error when metadataTag has an unknown type (filter skipped)', async () => {
    // invalid type → exists block skipped → 0 extra subqueries
    const { service } = buildServiceForFindAll(0, 0);

    const result = await service.findAllSeries({
      metadataTag: 'unknown_type:some value',
    });

    expect(result).toHaveProperty('series');
  });
});

// ===== findAllSeries — metadata priority resolution =====

describe('ComicsService.findAllSeries — metadata priority resolution', () => {
  /**
   * findAllSeries db.select() call sequence (with non-empty items):
   *   [0] bookCount inline subquery
   *   [1] items query (Promise.all[0])
   *   [2] count query (Promise.all[1])
   *   [3] linked ComicVine volume batch query (post-items Promise.all)
   * db.execute() is called once for fallback covers (returns { rows: [] }).
   *
   * NOTE: this positional queue assumes the no-filter path — findAllSeries({})
   * with no `userId` and no `metadataTag`. Passing either adds WHERE-clause
   * exists()/blacklist subqueries that consume extra db.select() slots and would
   * shift these indices. Extend the queue if you add such filters here.
   */
  function buildServiceForResolution({
    seriesRow,
    volumeRows = [] as unknown[],
    priority = DEFAULT_COMIC_METADATA_PRIORITY,
  }: {
    seriesRow: Record<string, unknown>;
    volumeRows?: unknown[];
    priority?: typeof DEFAULT_COMIC_METADATA_PRIORITY;
  }) {
    const items = [
      {
        series: seriesRow,
        bookCount: 1,
        comicvineLinked: volumeRows.length > 0,
      },
    ];
    const queue: unknown[] = [
      [], // [0] bookCount
      items, // [1] items
      [{ total: 1 }], // [2] count
      volumeRows, // [3] volume batch
    ];
    const select = jest.fn().mockImplementation(() => {
      const val = queue.length > 1 ? queue.shift() : queue[0];
      return chainMock(val);
    });
    const execute = jest.fn().mockResolvedValue({ rows: [] });

    const db = { select, execute } as never;
    const appSettings = {
      getComicLibraryPath: jest.fn().mockResolvedValue('/lib'),
      getComicMetadataPriority: jest.fn().mockResolvedValue(priority),
    } as never;
    const coverService = {
      getCoverUrl: jest.fn().mockReturnValue(null),
    } as never;
    const stub = {} as never;

    const service = new ComicsService(
      db,
      appSettings,
      coverService,
      stub, // imageProcessing
      stub, // appData
      stub, // comicMetadataProvider
      stub, // appEvents
      stub, // wsEvents
      stub, // collectionsService
    );
    return { service };
  }

  const baseListSeriesRow = {
    id: 'series-1',
    title: 'Maus',
    publisher: null,
    startYear: null,
    status: 'available',
    totalIssueCount: null,
    manualFields: [] as string[],
    coverUrl: null,
    coverSource: null,
    createdAt: new Date('2024-01-01'),
  };

  const cvVolume = (overrides: Record<string, unknown>) => [
    {
      seriesId: 'series-1',
      volume: {
        name: 'Maus',
        description: null,
        publisherName: null,
        startYear: null,
        ...overrides,
      },
    },
  ];

  it('fills empty publisher and startYear from the linked ComicVine volume', async () => {
    const { service } = buildServiceForResolution({
      seriesRow: { ...baseListSeriesRow, publisher: null, startYear: null },
      volumeRows: cvVolume({ publisherName: 'Pantheon', startYear: 1986 }),
    });

    const result = await service.findAllSeries({});

    expect(result.series[0].publisher).toBe('Pantheon');
    expect(result.series[0].startYear).toBe(1986);
  });

  it('keeps the stored publisher when present (embedded precedes comicvine by default)', async () => {
    const { service } = buildServiceForResolution({
      seriesRow: { ...baseListSeriesRow, publisher: 'Stored Pub' },
      volumeRows: cvVolume({ publisherName: 'CV Pub' }),
    });

    const result = await service.findAllSeries({});

    expect(result.series[0].publisher).toBe('Stored Pub');
  });

  it('manual publisher wins over a comicvine-FIRST priority via the manualFields guard', async () => {
    const priority = {
      ...DEFAULT_COMIC_METADATA_PRIORITY,
      publisher: ['comicvine', 'manual', 'embedded'] as MetadataSource[],
    };
    const { service } = buildServiceForResolution({
      seriesRow: {
        ...baseListSeriesRow,
        publisher: 'Manual Pub',
        manualFields: ['publisher'],
      },
      volumeRows: cvVolume({ publisherName: 'CV Pub' }),
      priority,
    });

    const result = await service.findAllSeries({});

    expect(result.series[0].publisher).toBe('Manual Pub');
  });
});

describe('ComicsService.deleteBook / deleteSeries — remove but keep files', () => {
  function buildServiceForDelete(row: Record<string, unknown>) {
    const updateSet = jest.fn().mockReturnValue({
      where: jest.fn().mockResolvedValue(undefined),
    });
    const updateMock = jest.fn().mockReturnValue({ set: updateSet });
    const deleteWhere = jest.fn().mockResolvedValue(undefined);
    const deleteMock = jest.fn().mockReturnValue({ where: deleteWhere });
    // Every select (book lookup, series lookup, series-books lookup) resolves
    // to a single row; that's enough for the delete paths under test.
    const selectMock = jest.fn().mockReturnValue(chainMock([row]));

    const db = {
      select: selectMock,
      update: updateMock,
      delete: deleteMock,
    } as never;

    const appSettings = {
      getComicLibraryPath: jest.fn().mockResolvedValue('/lib'),
    } as never;
    const appEvents = {
      comicSeriesUpdated: jest.fn(),
      comicSeriesDeleted: jest.fn(),
    } as never;
    const wsEvents = {
      comicSeriesUpdated: jest.fn(),
      comicSeriesDeleted: jest.fn(),
    } as never;
    const stub = {} as never;

    const service = new ComicsService(
      db,
      appSettings,
      stub, // coverService
      stub, // imageProcessing
      stub, // appData
      stub, // comicMetadataProvider
      appEvents,
      wsEvents,
      stub, // collectionsService
    );
    return { service, updateMock, updateSet, deleteMock };
  }

  const unlinkMock = fsPromises.unlink as jest.Mock;

  beforeEach(() => {
    unlinkMock.mockReset();
    unlinkMock.mockResolvedValue(undefined);
  });

  describe('deleteBook', () => {
    it('hides the book (status: hidden) instead of deleting when keeping files', async () => {
      const { service, updateMock, updateSet, deleteMock } =
        buildServiceForDelete({
          id: 'book-1',
          seriesId: 'series-1',
          filePath: 'Series/issue-1.cbz',
          status: 'available',
        });

      await service.deleteBook('book-1', false);

      // Must NOT hard-delete the row (that's what makes it reappear on rescan).
      expect(deleteMock).not.toHaveBeenCalled();
      // Must hide it so the scanner skips re-import.
      expect(updateMock).toHaveBeenCalledTimes(1);
      expect(updateSet).toHaveBeenCalledWith({ status: 'hidden' });
      // Files on disk must be left untouched.
      expect(unlinkMock).not.toHaveBeenCalled();
    });

    it('hard-deletes the row and unlinks the file when deleting files', async () => {
      const { service, updateMock, deleteMock } = buildServiceForDelete({
        id: 'book-1',
        seriesId: 'series-1',
        filePath: 'Series/issue-1.cbz',
        status: 'available',
      });

      await service.deleteBook('book-1', true);

      expect(deleteMock).toHaveBeenCalledTimes(1);
      expect(updateMock).not.toHaveBeenCalled();
      expect(unlinkMock).toHaveBeenCalledTimes(1);
    });

    it('hard-deletes (no hidden record) when the book is already missing', async () => {
      const { service, updateMock, deleteMock } = buildServiceForDelete({
        id: 'book-1',
        seriesId: 'series-1',
        filePath: 'Series/issue-1.cbz',
        status: 'missing',
      });

      await service.deleteBook('book-1', false);

      expect(deleteMock).toHaveBeenCalledTimes(1);
      expect(updateMock).not.toHaveBeenCalled();
      expect(unlinkMock).not.toHaveBeenCalled();
    });
  });

  describe('deleteSeries', () => {
    it('hides the series and its books instead of deleting when keeping files', async () => {
      const { service, updateMock, updateSet, deleteMock } =
        buildServiceForDelete({
          id: 'series-1',
          folderPath: 'Series',
          status: 'available',
        });

      await service.deleteSeries('series-1', false);

      expect(deleteMock).not.toHaveBeenCalled();
      // Series row + all its books are hidden -> two updates, both set hidden.
      expect(updateMock).toHaveBeenCalledTimes(2);
      const setArgs = updateSet.mock.calls.map((c) => c[0]);
      expect(setArgs).toEqual([{ status: 'hidden' }, { status: 'hidden' }]);
      expect(unlinkMock).not.toHaveBeenCalled();
    });

    it('hard-deletes the series when deleting files', async () => {
      const { service, updateMock, deleteMock } = buildServiceForDelete({
        id: 'series-1',
        folderPath: 'Series',
        filePath: 'Series/issue-1.cbz',
        status: 'available',
      });

      await service.deleteSeries('series-1', true);

      expect(deleteMock).toHaveBeenCalledTimes(1);
      expect(updateMock).not.toHaveBeenCalled();
    });
  });
});
