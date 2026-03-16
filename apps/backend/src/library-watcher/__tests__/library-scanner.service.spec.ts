jest.mock('fs/promises', () => ({
  access: jest.fn(),
}));

// p-limit v7 is ESM-only and incompatible with Jest CJS transform.
// Provide a functional mock that executes the wrapped function directly.
jest.mock('p-limit', () => ({
  __esModule: true,
  default: (_concurrency: number) => {
    return <T>(fn: () => Promise<T>): Promise<T> => fn();
  },
}));

// Mock ESM-only packages that break Jest's CJS transform
jest.mock('@thallesp/nestjs-better-auth', () => ({
  AuthService: jest.fn(),
}));

import * as fs from 'fs/promises';
import * as path from 'path';
import { LibraryScannerService } from '../library-scanner.service';
import type { ScanProgress } from '../library-scanner.service';

const mockedAccess = fs.access as jest.MockedFunction<typeof fs.access>;

const LIBRARY_PATH = '/media/audiobooks';
const EBOOK_LIBRARY_PATH = '/media/ebooks';

function createMockDb() {
  const mockUpdate = jest.fn().mockReturnThis();
  const mockSet = jest.fn().mockReturnThis();
  const mockDeleteWhere = jest.fn().mockResolvedValue(undefined);
  const mockSelectWhere = jest.fn();
  const mockSelectFrom = jest.fn();
  const mockSelectLimit = jest.fn();

  // Chain: select().from() -> array (for main queries)
  // Chain: select().from().where().limit() -> for root-level file queries
  // Chain: select().from().where() -> for handlePathRemoved queries
  // Chain: update().set().where() -> for status updates
  // Chain: delete().where() -> for deletions

  const mockDb = {
    select: jest.fn().mockReturnValue({
      from: mockSelectFrom,
    }),
    update: jest.fn().mockReturnValue({
      set: mockSet,
    }),
    delete: jest.fn().mockReturnValue({
      where: mockDeleteWhere,
    }),
    // Expose internals for test setup
    _mockSelectFrom: mockSelectFrom,
    _mockSelectWhere: mockSelectWhere,
    _mockSelectLimit: mockSelectLimit,
    _mockSet: mockSet,
    _mockUpdate: mockUpdate,
    _mockDeleteWhere: mockDeleteWhere,
  };

  // Default: set().where() resolves
  mockSet.mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) });

  return mockDb;
}

function createMockMediaDetector() {
  return {
    scanLibraryForAudiobooks: jest.fn().mockResolvedValue([]),
    scanLibraryForEbooks: jest.fn().mockResolvedValue([]),
  };
}

function createMockMediaImporter() {
  return {
    importAudiobook: jest.fn().mockResolvedValue('new-id'),
    importEbook: jest.fn().mockResolvedValue('new-id'),
  };
}

function createMockAppEvents() {
  return {
    libraryScanStarted: jest.fn(),
    libraryScanCompleted: jest.fn(),
    audiobookDeleted: jest.fn(),
    audiobookUpdated: jest.fn(),
    ebookDeleted: jest.fn(),
    ebookUpdated: jest.fn(),
  };
}

function createMockWsEvents() {
  return {
    scanStatusUpdated: jest.fn(),
  };
}

/**
 * Helper to configure mockDb.select().from() to return different results
 * for sequential calls. Each entry in `results` corresponds to one call.
 */
function setupSelectFromSequence(
  mockDb: ReturnType<typeof createMockDb>,
  results: Array<
    | unknown[] // resolves directly (no .where/.limit chain)
    | {
        where: unknown[] | { limit: unknown[] };
      }
  >,
) {
  let callIndex = 0;
  mockDb._mockSelectFrom.mockImplementation(() => {
    const result = results[callIndex] ?? [];
    callIndex++;

    if (Array.isArray(result)) {
      // select().from() resolves directly to array
      // But we need it to be thenable — drizzle returns a promise-like from .from()
      return Promise.resolve(result);
    }

    // Has .where chain
    const whereResult = result.where;
    if (Array.isArray(whereResult)) {
      return {
        where: jest.fn().mockResolvedValue(whereResult),
      };
    }

    // Has .where().limit() chain
    return {
      where: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue(whereResult.limit),
      }),
    };
  });
}

describe('LibraryScannerService', () => {
  let service: LibraryScannerService;
  let mockDb: ReturnType<typeof createMockDb>;
  let mockMediaDetector: ReturnType<typeof createMockMediaDetector>;
  let mockMediaImporter: ReturnType<typeof createMockMediaImporter>;
  let mockAppEvents: ReturnType<typeof createMockAppEvents>;
  let mockWsEvents: ReturnType<typeof createMockWsEvents>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = createMockDb();
    mockMediaDetector = createMockMediaDetector();
    mockMediaImporter = createMockMediaImporter();
    mockAppEvents = createMockAppEvents();
    mockWsEvents = createMockWsEvents();

    service = new LibraryScannerService(
      mockDb as any,
      mockMediaDetector as any,
      mockMediaImporter as any,
      mockAppEvents as any,
      mockWsEvents as any,
    );
  });

  // ===== scanAudiobookLibrary =====

  describe('scanAudiobookLibrary', () => {
    it('should return zero counts for empty library', async () => {
      // No existing audiobooks in DB
      setupSelectFromSequence(mockDb, [
        [], // existing audiobooks query
      ]);

      const result = await service.scanAudiobookLibrary(LIBRARY_PATH);

      expect(result).toEqual({
        added: 0,
        missing: 0,
        restored: 0,
        deleted: 0,
        errors: [],
      });
    });

    it('should mark audiobooks as missing when folder does not exist', async () => {
      const existingAudiobooks = [
        { id: 'ab-1', filePath: 'Author/Book One', status: 'available' },
      ];

      setupSelectFromSequence(mockDb, [
        existingAudiobooks, // existing audiobooks
      ]);

      // Folder does not exist
      mockedAccess.mockRejectedValue(new Error('ENOENT'));

      const result = await service.scanAudiobookLibrary(LIBRARY_PATH);

      expect(result.missing).toBe(1);
      expect(mockDb._mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'missing' }),
      );
    });

    it('should restore audiobooks from missing when folder reappears', async () => {
      const existingAudiobooks = [
        { id: 'ab-1', filePath: 'Author/Book One', status: 'missing' },
      ];

      setupSelectFromSequence(mockDb, [
        existingAudiobooks, // existing audiobooks
      ]);

      // Folder exists again
      mockedAccess.mockResolvedValue(undefined);

      const result = await service.scanAudiobookLibrary(LIBRARY_PATH);

      expect(result.restored).toBe(1);
      expect(mockDb._mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'available', missingAt: null }),
      );
    });

    it('should delete hidden audiobooks when files are gone', async () => {
      const existingAudiobooks = [
        { id: 'ab-hidden', filePath: 'Author/Hidden Book', status: 'hidden' },
      ];

      setupSelectFromSequence(mockDb, [
        existingAudiobooks, // existing audiobooks
      ]);

      // Folder does not exist
      mockedAccess.mockRejectedValue(new Error('ENOENT'));

      const result = await service.scanAudiobookLibrary(LIBRARY_PATH);

      expect(result.deleted).toBe(1);
      expect(mockDb.delete).toHaveBeenCalled();
    });

    it('should not change status for available audiobooks that still exist', async () => {
      const existingAudiobooks = [
        { id: 'ab-1', filePath: 'Author/Good Book', status: 'available' },
      ];

      setupSelectFromSequence(mockDb, [
        existingAudiobooks, // existing audiobooks
      ]);

      // Folder exists
      mockedAccess.mockResolvedValue(undefined);

      const result = await service.scanAudiobookLibrary(LIBRARY_PATH);

      expect(result.missing).toBe(0);
      expect(result.restored).toBe(0);
      expect(result.deleted).toBe(0);
    });

    it('should detect and import new audiobooks', async () => {
      setupSelectFromSequence(mockDb, [
        [], // no existing audiobooks
      ]);

      mockMediaDetector.scanLibraryForAudiobooks.mockResolvedValue([
        {
          path: path.join(LIBRARY_PATH, 'New Author', 'New Book'),
          type: 'multi-file',
          files: [],
        },
      ]);

      const result = await service.scanAudiobookLibrary(LIBRARY_PATH);

      expect(result.added).toBe(1);
      expect(mockMediaImporter.importAudiobook).toHaveBeenCalledTimes(1);
    });

    it('should filter out existing folder-based audiobooks from import', async () => {
      const existingAudiobooks = [
        { id: 'ab-1', filePath: 'Author/Existing Book', status: 'available' },
      ];

      setupSelectFromSequence(mockDb, [
        existingAudiobooks, // existing audiobooks
      ]);

      mockedAccess.mockResolvedValue(undefined);

      mockMediaDetector.scanLibraryForAudiobooks.mockResolvedValue([
        {
          path: path.join(LIBRARY_PATH, 'Author', 'Existing Book'),
          type: 'multi-file',
          files: [],
        },
        {
          path: path.join(LIBRARY_PATH, 'Author', 'New Book'),
          type: 'multi-file',
          files: [],
        },
      ]);

      const result = await service.scanAudiobookLibrary(LIBRARY_PATH);

      expect(result.added).toBe(1);
      expect(mockMediaImporter.importAudiobook).toHaveBeenCalledTimes(1);
    });

    it('should filter out existing root-level audiobooks from import', async () => {
      const existingAudiobooks = [
        { id: 'ab-root', filePath: '', status: 'available' },
      ];

      // Call sequence:
      // 1. select existing audiobooks
      // 2. select audiobook_files for root-level (pathExists check)
      // 3. select audiobook_files for root-level (existingRootFilenames)
      setupSelectFromSequence(mockDb, [
        existingAudiobooks, // existing audiobooks
        { where: { limit: [{ filePath: 'standalone.m4b' }] } }, // audiobook_files for pathExists
        { where: [{ filePath: 'standalone.m4b' }] }, // rootFiles query
      ]);

      mockedAccess.mockResolvedValue(undefined);

      mockMediaDetector.scanLibraryForAudiobooks.mockResolvedValue([
        {
          path: path.join(LIBRARY_PATH, 'standalone.m4b'),
          type: 'single-file',
          files: [],
        },
      ]);

      const result = await service.scanAudiobookLibrary(LIBRARY_PATH);

      // The root-level file already exists so should not be imported
      expect(result.added).toBe(0);
    });

    it('should return correct ScanResult counts for mixed operations', async () => {
      const existingAudiobooks = [
        { id: 'ab-1', filePath: 'Author/Missing Book', status: 'available' },
        { id: 'ab-2', filePath: 'Author/Restored Book', status: 'missing' },
        { id: 'ab-3', filePath: 'Author/Hidden Gone', status: 'hidden' },
        { id: 'ab-4', filePath: 'Author/Still Here', status: 'available' },
      ];

      setupSelectFromSequence(mockDb, [
        existingAudiobooks, // existing audiobooks
      ]);

      // ab-1: missing (ENOENT), ab-2: restored (exists), ab-3: hidden+gone (ENOENT), ab-4: still exists
      mockedAccess.mockImplementation(async (p) => {
        const pathStr = String(p);
        if (
          pathStr.includes('Missing Book') ||
          pathStr.includes('Hidden Gone')
        ) {
          throw new Error('ENOENT');
        }
        return undefined;
      });

      mockMediaDetector.scanLibraryForAudiobooks.mockResolvedValue([
        {
          path: path.join(LIBRARY_PATH, 'Author', 'Brand New'),
          type: 'multi-file',
          files: [],
        },
      ]);

      const result = await service.scanAudiobookLibrary(LIBRARY_PATH);

      expect(result.added).toBe(1);
      expect(result.missing).toBe(1);
      expect(result.restored).toBe(1);
      expect(result.deleted).toBe(1);
      expect(result.errors).toEqual([]);
    });

    it('should record errors from failed imports', async () => {
      setupSelectFromSequence(mockDb, [
        [], // no existing audiobooks
      ]);

      mockMediaDetector.scanLibraryForAudiobooks.mockResolvedValue([
        {
          path: path.join(LIBRARY_PATH, 'Author', 'Bad Book'),
          type: 'multi-file',
          files: [],
        },
      ]);

      mockMediaImporter.importAudiobook.mockRejectedValue(
        new Error('FFprobe failed'),
      );

      const result = await service.scanAudiobookLibrary(LIBRARY_PATH);

      expect(result.added).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        path: path.join(LIBRARY_PATH, 'Author', 'Bad Book'),
        error: 'FFprobe failed',
      });
    });

    it('should emit libraryScanStarted and libraryScanCompleted events', async () => {
      setupSelectFromSequence(mockDb, [
        [], // no existing audiobooks
      ]);

      await service.scanAudiobookLibrary(LIBRARY_PATH);

      expect(mockAppEvents.libraryScanStarted).toHaveBeenCalledTimes(1);
      expect(mockAppEvents.libraryScanCompleted).toHaveBeenCalledTimes(1);
    });

    it('should not skip already-missing audiobooks when folder still missing', async () => {
      const existingAudiobooks = [
        {
          id: 'ab-already-missing',
          filePath: 'Author/Long Gone',
          status: 'missing',
        },
      ];

      setupSelectFromSequence(mockDb, [
        existingAudiobooks, // existing audiobooks
      ]);

      // Still missing
      mockedAccess.mockRejectedValue(new Error('ENOENT'));

      const result = await service.scanAudiobookLibrary(LIBRARY_PATH);

      // Should NOT increment missing count (it's already missing)
      expect(result.missing).toBe(0);
      expect(result.restored).toBe(0);
    });

    it('should not delete hidden audiobooks when files still exist', async () => {
      const existingAudiobooks = [
        {
          id: 'ab-hidden-exists',
          filePath: 'Author/Hidden But Present',
          status: 'hidden',
        },
      ];

      setupSelectFromSequence(mockDb, [
        existingAudiobooks, // existing audiobooks
      ]);

      // File exists
      mockedAccess.mockResolvedValue(undefined);

      const result = await service.scanAudiobookLibrary(LIBRARY_PATH);

      expect(result.deleted).toBe(0);
      expect(mockDb.delete).not.toHaveBeenCalled();
    });
  });

  // ===== scanEbookLibrary =====

  describe('scanEbookLibrary', () => {
    it('should return zero counts for empty library', async () => {
      setupSelectFromSequence(mockDb, [
        [], // no existing ebooks
      ]);

      const result = await service.scanEbookLibrary(EBOOK_LIBRARY_PATH);

      expect(result).toEqual({
        added: 0,
        missing: 0,
        restored: 0,
        deleted: 0,
        errors: [],
      });
    });

    it('should mark ebooks as missing when file does not exist', async () => {
      const existingEbooks = [
        { id: 'eb-1', filePath: 'Author/Book.epub', status: 'available' },
      ];

      setupSelectFromSequence(mockDb, [
        existingEbooks, // existing ebooks
      ]);

      mockedAccess.mockRejectedValue(new Error('ENOENT'));

      const result = await service.scanEbookLibrary(EBOOK_LIBRARY_PATH);

      expect(result.missing).toBe(1);
      expect(mockDb._mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'missing' }),
      );
    });

    it('should restore ebooks from missing when file reappears', async () => {
      const existingEbooks = [
        { id: 'eb-1', filePath: 'Author/Book.epub', status: 'missing' },
      ];

      setupSelectFromSequence(mockDb, [
        existingEbooks, // existing ebooks
      ]);

      mockedAccess.mockResolvedValue(undefined);

      const result = await service.scanEbookLibrary(EBOOK_LIBRARY_PATH);

      expect(result.restored).toBe(1);
      expect(mockDb._mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'available', missingAt: null }),
      );
    });

    it('should delete hidden ebooks when files are gone', async () => {
      const existingEbooks = [
        {
          id: 'eb-hidden',
          filePath: 'Author/Hidden.epub',
          status: 'hidden',
        },
      ];

      setupSelectFromSequence(mockDb, [
        existingEbooks, // existing ebooks
      ]);

      mockedAccess.mockRejectedValue(new Error('ENOENT'));

      const result = await service.scanEbookLibrary(EBOOK_LIBRARY_PATH);

      expect(result.deleted).toBe(1);
      expect(mockDb.delete).toHaveBeenCalled();
    });

    it('should detect and import new ebooks', async () => {
      setupSelectFromSequence(mockDb, [
        [], // no existing ebooks
      ]);

      mockMediaDetector.scanLibraryForEbooks.mockResolvedValue([
        {
          path: path.join(EBOOK_LIBRARY_PATH, 'Author', 'New Book.epub'),
          type: 'epub',
        },
      ]);

      const result = await service.scanEbookLibrary(EBOOK_LIBRARY_PATH);

      expect(result.added).toBe(1);
      expect(mockMediaImporter.importEbook).toHaveBeenCalledTimes(1);
    });

    it('should filter out existing ebooks from import', async () => {
      const existingEbooks = [
        { id: 'eb-1', filePath: 'Author/Existing.epub', status: 'available' },
      ];

      setupSelectFromSequence(mockDb, [
        existingEbooks, // existing ebooks
      ]);

      mockedAccess.mockResolvedValue(undefined);

      mockMediaDetector.scanLibraryForEbooks.mockResolvedValue([
        {
          path: path.join(EBOOK_LIBRARY_PATH, 'Author', 'Existing.epub'),
          type: 'epub',
        },
        {
          path: path.join(EBOOK_LIBRARY_PATH, 'Author', 'New.epub'),
          type: 'epub',
        },
      ]);

      const result = await service.scanEbookLibrary(EBOOK_LIBRARY_PATH);

      expect(result.added).toBe(1);
      expect(mockMediaImporter.importEbook).toHaveBeenCalledTimes(1);
    });

    it('should record errors from failed ebook imports', async () => {
      setupSelectFromSequence(mockDb, [
        [], // no existing ebooks
      ]);

      mockMediaDetector.scanLibraryForEbooks.mockResolvedValue([
        {
          path: path.join(EBOOK_LIBRARY_PATH, 'Author', 'Corrupt.epub'),
          type: 'epub',
        },
      ]);

      mockMediaImporter.importEbook.mockRejectedValue(new Error('Parse error'));

      const result = await service.scanEbookLibrary(EBOOK_LIBRARY_PATH);

      expect(result.added).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toBe('Parse error');
    });
  });

  // ===== handlePathRemoved =====

  describe('handlePathRemoved', () => {
    it('should mark non-hidden audiobook as missing', async () => {
      const removedPath = path.join(LIBRARY_PATH, 'Author', 'Book One');

      setupSelectFromSequence(mockDb, [
        {
          where: [
            { id: 'ab-1', filePath: 'Author/Book One', status: 'available' },
          ],
        },
      ]);

      await service.handlePathRemoved(removedPath, LIBRARY_PATH, 'audiobook');

      expect(mockDb._mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'missing' }),
      );
      expect(mockAppEvents.audiobookUpdated).toHaveBeenCalledWith('ab-1');
    });

    it('should delete hidden audiobook and emit event', async () => {
      const removedPath = path.join(LIBRARY_PATH, 'Author', 'Hidden Book');

      setupSelectFromSequence(mockDb, [
        {
          where: [
            {
              id: 'ab-hidden',
              filePath: 'Author/Hidden Book',
              status: 'hidden',
            },
          ],
        },
      ]);

      await service.handlePathRemoved(removedPath, LIBRARY_PATH, 'audiobook');

      expect(mockDb.delete).toHaveBeenCalled();
      expect(mockAppEvents.audiobookDeleted).toHaveBeenCalledWith('ab-hidden');
    });

    it('should mark non-hidden ebook as missing', async () => {
      const removedPath = path.join(EBOOK_LIBRARY_PATH, 'Author', 'Book.epub');

      setupSelectFromSequence(mockDb, [
        {
          where: [
            {
              id: 'eb-1',
              filePath: 'Author/Book.epub',
              status: 'available',
            },
          ],
        },
      ]);

      await service.handlePathRemoved(removedPath, EBOOK_LIBRARY_PATH, 'ebook');

      expect(mockDb._mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'missing' }),
      );
      expect(mockAppEvents.ebookUpdated).toHaveBeenCalledWith('eb-1');
    });

    it('should delete hidden ebook and emit event', async () => {
      const removedPath = path.join(
        EBOOK_LIBRARY_PATH,
        'Author',
        'Hidden.epub',
      );

      setupSelectFromSequence(mockDb, [
        {
          where: [
            {
              id: 'eb-hidden',
              filePath: 'Author/Hidden.epub',
              status: 'hidden',
            },
          ],
        },
      ]);

      await service.handlePathRemoved(removedPath, EBOOK_LIBRARY_PATH, 'ebook');

      expect(mockDb.delete).toHaveBeenCalled();
      expect(mockAppEvents.ebookDeleted).toHaveBeenCalledWith('eb-hidden');
    });

    it('should handle no matching audiobooks gracefully', async () => {
      const removedPath = path.join(LIBRARY_PATH, 'Author', 'Unknown');

      setupSelectFromSequence(mockDb, [
        { where: [] }, // no matches
      ]);

      await service.handlePathRemoved(removedPath, LIBRARY_PATH, 'audiobook');

      expect(mockDb.delete).not.toHaveBeenCalled();
      expect(mockDb._mockSet).not.toHaveBeenCalled();
    });
  });

  // ===== Progress tracking =====

  describe('progress tracking', () => {
    it('should return false for isScanning when no scan is active', () => {
      expect(service.isScanning()).toBe(false);
    });

    it('should return null for getProgress when no scan is active', () => {
      expect(service.getProgress()).toBeNull();
    });

    it('should invoke progress callbacks during scan', async () => {
      setupSelectFromSequence(mockDb, [
        [], // no existing audiobooks
      ]);

      const progressUpdates: ScanProgress[] = [];
      service.onProgress((progress) => {
        progressUpdates.push({ ...progress });
      });

      await service.scanAudiobookLibrary(LIBRARY_PATH);

      expect(progressUpdates.length).toBeGreaterThan(0);
      // Should have reconciling and scanning/importing phases
      const phases = new Set(progressUpdates.map((p) => p.phase));
      expect(phases.has('reconciling')).toBe(true);
      expect(phases.has('importing')).toBe(true);
    });

    it('should allow unsubscribing from progress callbacks', async () => {
      setupSelectFromSequence(mockDb, [
        [], // no existing audiobooks
      ]);

      const progressUpdates: ScanProgress[] = [];
      const unsubscribe = service.onProgress((progress) => {
        progressUpdates.push({ ...progress });
      });

      // Unsubscribe immediately
      unsubscribe();

      await service.scanAudiobookLibrary(LIBRARY_PATH);

      expect(progressUpdates).toHaveLength(0);
    });

    it('should report isScanning as false after scan completes', async () => {
      setupSelectFromSequence(mockDb, [
        [], // no existing audiobooks
      ]);

      await service.scanAudiobookLibrary(LIBRARY_PATH);

      expect(service.isScanning()).toBe(false);
      expect(service.getProgress()).toBeNull();
    });

    it('should emit scan status updates via wsEvents', async () => {
      setupSelectFromSequence(mockDb, [
        [], // no existing audiobooks
      ]);

      await service.scanAudiobookLibrary(LIBRARY_PATH);

      // Should have emitted scanning status and final non-scanning status
      expect(mockWsEvents.scanStatusUpdated).toHaveBeenCalled();

      // Last call should be isScanning: false
      const lastCall =
        mockWsEvents.scanStatusUpdated.mock.calls[
          mockWsEvents.scanStatusUpdated.mock.calls.length - 1
        ][0];
      expect(lastCall.isScanning).toBe(false);
    });
  });
});
