jest.mock('fs/promises');

jest.mock('../../common/worker-pool.service', () => ({
  WorkerPoolService: jest.fn(),
  getWorkerPath: jest.fn().mockReturnValue('/mock/worker/path'),
}));

import * as fsp from 'fs/promises';
import { AbsParserService } from '../abs-parser.service';

const mockedFs = jest.mocked(fsp);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockWorkerPool(overrides: Record<string, any> = {}) {
  return {
    initializePool: jest.fn().mockResolvedValue(undefined),
    executeTask: jest.fn(),
    ...overrides,
  } as any;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AbsParserService', () => {
  let workerPool: ReturnType<typeof createMockWorkerPool>;
  let service: AbsParserService;

  beforeEach(() => {
    jest.clearAllMocks();
    workerPool = createMockWorkerPool();
    service = new AbsParserService(workerPool);
  });

  // -------------------------------------------------------------------------
  // onModuleInit
  // -------------------------------------------------------------------------

  describe('onModuleInit', () => {
    it('initializes the worker pool with correct configuration', async () => {
      await service.onModuleInit();

      expect(workerPool.initializePool).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'abs-restore',
          workerScript: '/mock/worker/path',
          minWorkers: 1,
          maxWorkers: 2,
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // parseBackupDetails
  // -------------------------------------------------------------------------

  describe('parseBackupDetails', () => {
    it('calls worker and converts Record to Map for libraryFolders', async () => {
      const workerResult = {
        details: { version: '2.0', timestamp: Date.now() },
        libraries: [{ id: 'lib-1', name: 'My Library' }],
        libraryFolders: {
          'lib-1': [{ id: 'folder-1', path: '/audiobooks' }],
          'lib-2': [
            { id: 'folder-2', path: '/podcasts' },
            { id: 'folder-3', path: '/music' },
          ],
        },
      };
      workerPool.executeTask.mockResolvedValue(workerResult);

      const result = await service.parseBackupDetails('/tmp/backup');

      expect(result.libraryFolders).toBeInstanceOf(Map);
      expect(result.libraryFolders.get('lib-1')).toEqual([
        { id: 'folder-1', path: '/audiobooks' },
      ]);
      expect(result.libraryFolders.get('lib-2')).toHaveLength(2);
      expect(result.details).toBe(workerResult.details);
      expect(result.libraries).toBe(workerResult.libraries);
    });

    it('passes extractedPath to the worker task', async () => {
      workerPool.executeTask.mockResolvedValue({
        details: { version: '1.0', timestamp: 0 },
        libraries: [],
        libraryFolders: {},
      });

      await service.parseBackupDetails('/tmp/extracted');

      expect(workerPool.executeTask).toHaveBeenCalledWith(
        'abs-restore',
        'parseBackupDetails',
        { extractedPath: '/tmp/extracted' },
      );
    });
  });

  // -------------------------------------------------------------------------
  // parseLibraryData
  // -------------------------------------------------------------------------

  describe('parseLibraryData', () => {
    it('calls worker and converts Record to Map for books', async () => {
      const workerResult = {
        libraryItems: [{ id: 'item-1' }],
        books: {
          'media-1': { id: 'book-1', title: 'Book One' },
          'media-2': { id: 'book-2', title: 'Book Two' },
        },
        authors: [{ id: 'a-1', name: 'Author' }],
        bookAuthors: [],
        series: [],
        bookSeries: [],
        users: [],
        mediaProgresses: [],
      };
      workerPool.executeTask.mockResolvedValue(workerResult);

      const result = await service.parseLibraryData('/tmp/backup', 'lib-1');

      expect(result.books).toBeInstanceOf(Map);
      expect(result.books.get('media-1')).toEqual({
        id: 'book-1',
        title: 'Book One',
      });
      expect(result.books.get('media-2')).toEqual({
        id: 'book-2',
        title: 'Book Two',
      });
      expect(result.libraryItems).toBe(workerResult.libraryItems);
      expect(result.authors).toBe(workerResult.authors);
    });

    it('passes both extractedPath and libraryId to the worker task', async () => {
      workerPool.executeTask.mockResolvedValue({
        libraryItems: [],
        books: {},
        authors: [],
        bookAuthors: [],
        series: [],
        bookSeries: [],
        users: [],
        mediaProgresses: [],
      });

      await service.parseLibraryData('/tmp/backup', 'lib-42');

      expect(workerPool.executeTask).toHaveBeenCalledWith(
        'abs-restore',
        'parseLibraryData',
        { extractedPath: '/tmp/backup', libraryId: 'lib-42' },
      );
    });
  });

  // -------------------------------------------------------------------------
  // readMetadataJson
  // -------------------------------------------------------------------------

  describe('readMetadataJson', () => {
    it('delegates to the worker pool and returns the result', async () => {
      const metadata = { title: 'Test', authors: ['Author'] };
      workerPool.executeTask.mockResolvedValue(metadata);

      const result = await service.readMetadataJson('/tmp/backup', 'book-1');

      expect(workerPool.executeTask).toHaveBeenCalledWith(
        'abs-restore',
        'readMetadataJson',
        { extractedPath: '/tmp/backup', absBookId: 'book-1' },
      );
      expect(result).toBe(metadata);
    });

    it('returns null when worker returns null', async () => {
      workerPool.executeTask.mockResolvedValue(null);

      const result = await service.readMetadataJson('/tmp/backup', 'missing');

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // getCoverPath
  // -------------------------------------------------------------------------

  describe('getCoverPath', () => {
    it('returns cover.jpg path when it exists', async () => {
      mockedFs.access.mockResolvedValueOnce(undefined);

      const result = await service.getCoverPath('/tmp/backup', 'book-1');

      expect(result).toBe('/tmp/backup/metadata-items/book-1/cover.jpg');
      expect(mockedFs.access).toHaveBeenCalledTimes(1);
    });

    it('tries .png, .webp, .jpeg when cover.jpg is missing', async () => {
      mockedFs.access
        .mockRejectedValueOnce(new Error('ENOENT')) // cover.jpg
        .mockRejectedValueOnce(new Error('ENOENT')) // cover.png
        .mockResolvedValueOnce(undefined); // cover.webp exists

      const result = await service.getCoverPath('/tmp/backup', 'book-1');

      expect(result).toBe('/tmp/backup/metadata-items/book-1/cover.webp');
      expect(mockedFs.access).toHaveBeenCalledTimes(3);
    });

    it('returns null when no cover file is found', async () => {
      mockedFs.access.mockRejectedValue(new Error('ENOENT'));

      const result = await service.getCoverPath('/tmp/backup', 'book-1');

      expect(result).toBeNull();
      // 1 for cover.jpg + 3 fallback extensions
      expect(mockedFs.access).toHaveBeenCalledTimes(4);
    });
  });

  // -------------------------------------------------------------------------
  // getAuthorImagePath
  // -------------------------------------------------------------------------

  describe('getAuthorImagePath', () => {
    it('returns the path when the author image exists', async () => {
      mockedFs.access.mockResolvedValueOnce(undefined); // .jpg exists

      const result = await service.getAuthorImagePath(
        '/tmp/backup',
        'author-1',
      );

      expect(result).toBe('/tmp/backup/metadata-authors/author-1.jpg');
    });

    it('tries multiple extensions until one is found', async () => {
      mockedFs.access
        .mockRejectedValueOnce(new Error('ENOENT')) // .jpg
        .mockRejectedValueOnce(new Error('ENOENT')) // .png
        .mockRejectedValueOnce(new Error('ENOENT')) // .webp
        .mockResolvedValueOnce(undefined); // .jpeg exists

      const result = await service.getAuthorImagePath(
        '/tmp/backup',
        'author-1',
      );

      expect(result).toBe('/tmp/backup/metadata-authors/author-1.jpeg');
      expect(mockedFs.access).toHaveBeenCalledTimes(4);
    });

    it('returns null when no author image is found', async () => {
      mockedFs.access.mockRejectedValue(new Error('ENOENT'));

      const result = await service.getAuthorImagePath(
        '/tmp/backup',
        'author-1',
      );

      expect(result).toBeNull();
      expect(mockedFs.access).toHaveBeenCalledTimes(4);
    });
  });
});
