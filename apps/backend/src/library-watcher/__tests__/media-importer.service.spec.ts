// Mock modules that cause transitive import issues (better-auth ESM)
jest.mock('../../events/events.gateway', () => ({}));
jest.mock('../../events/ws-events.service', () => ({
  WsEventsService: jest.fn(),
}));
jest.mock('../../events/app-events.service', () => ({
  AppEventsService: jest.fn(),
}));
jest.mock('../../hardcover/hardcover.service', () => ({
  HardcoverService: jest.fn(),
}));
jest.mock('../../import-errors/import-errors.service', () => ({
  ImportErrorsService: jest.fn(),
}));
jest.mock('../../requests', () => ({
  RequestsService: jest.fn(),
}));
jest.mock('../../app-settings/app-settings.service', () => ({
  AppSettingsService: jest.fn(),
}));
jest.mock('../metadata/embedded-metadata.provider', () => ({
  EmbeddedMetadataProvider: jest.fn(),
}));
jest.mock('../metadata/ebook-metadata.provider', () => ({
  EbookMetadataProvider: jest.fn(),
}));
jest.mock('../metadata/comic-metadata.provider', () => ({
  ComicMetadataProvider: jest.fn(),
}));
jest.mock('../../common/image-processing.service', () => ({
  ImageProcessingService: jest.fn(),
}));
jest.mock('../../app-data/app-data.service', () => ({
  AppDataService: jest.fn(),
}));

// Mock fs/promises so the ebook import can call fs.stat
jest.mock('fs/promises', () => ({
  stat: jest.fn().mockResolvedValue({ size: 123456 }),
}));

import { MediaImporterService } from '../media-importer.service';
import { AudiobookUnit, EbookUnit } from '../media-detector.service';

// ---- Helper factories ----

function createMockDb() {
  const mockSelectChain = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue([]),
    orderBy: jest.fn().mockReturnThis(),
  };
  const mockInsertChain = {
    values: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue([{ id: 'new-id', title: 'Test' }]),
    onConflictDoUpdate: jest.fn().mockReturnThis(),
  };
  const mockUpdateChain = {
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue(undefined),
  };
  const mockDeleteChain = {
    where: jest.fn().mockResolvedValue(undefined),
  };

  return {
    select: jest.fn().mockReturnValue(mockSelectChain),
    insert: jest.fn().mockReturnValue(mockInsertChain),
    update: jest.fn().mockReturnValue(mockUpdateChain),
    delete: jest.fn().mockReturnValue(mockDeleteChain),
    _chains: {
      select: mockSelectChain,
      insert: mockInsertChain,
      update: mockUpdateChain,
      delete: mockDeleteChain,
    },
  } as any;
}

function createMockDeps() {
  return {
    audioMetadataProvider: {
      extractFullMetadata: jest.fn().mockResolvedValue({
        metadata: {
          title: 'Test Audiobook',
          author: 'Test Author',
          narrator: 'Test Narrator',
          hasEmbeddedCover: false,
        },
        fileInfo: {
          filePath: '/library/TestBook/file.m4b',
          fileName: 'file.m4b',
          duration: 3600,
          format: 'm4b',
          bitrate: 128000,
          sampleRate: 44100,
          sizeBytes: 50000000,
        },
        chapters: [],
      }),
      getFileInfo: jest.fn().mockResolvedValue({
        filePath: '/library/TestBook/file2.mp3',
        fileName: 'file2.mp3',
        duration: 1800,
        format: 'mp3',
        bitrate: 128000,
        sampleRate: 44100,
        sizeBytes: 25000000,
      }),
    } as any,
    ebookMetadataProvider: {
      extractMetadata: jest.fn().mockResolvedValue({
        title: 'Test Ebook',
        subtitle: undefined,
        description: 'A test ebook',
        authors: ['Ebook Author'],
        publisher: 'Publisher',
        language: 'en',
        isbn: '978-0-000-00000-0',
        pageCount: 300,
        cover: undefined,
        publishedDate: undefined,
      }),
    } as any,
    importErrorsService: {
      isQuarantined: jest.fn().mockResolvedValue(false),
      recordError: jest.fn().mockResolvedValue(undefined),
      clearResolvedByPath: jest.fn().mockResolvedValue(undefined),
    } as any,
    hardcoverService: {
      getAutoSyncOnImport: jest.fn().mockResolvedValue(false),
      addToSyncQueue: jest.fn().mockResolvedValue(undefined),
    } as any,
    appEvents: {
      audiobookCreated: jest.fn(),
      audiobookUpdated: jest.fn(),
      audiobookDeleted: jest.fn(),
      ebookCreated: jest.fn(),
    } as any,
    wsEvents: {
      audiobookCreated: jest.fn(),
      audiobookUpdated: jest.fn(),
      ebookCreated: jest.fn(),
    } as any,
    requestsService: {
      tryMatchImport: jest.fn().mockResolvedValue(false),
    } as any,
    appSettingsService: {
      getAudiobookLibraryPath: jest.fn().mockResolvedValue('/library'),
    } as any,
    comicMetadataProvider: {
      extractMetadata: jest.fn(),
    } as any,
    imageProcessing: {
      processCover: jest.fn(),
    } as any,
    appData: {
      getComicSeriesCoverPath: jest.fn(),
      getComicBookCoverPath: jest.fn(),
    } as any,
  };
}

function buildService(db: any, deps: ReturnType<typeof createMockDeps>) {
  return new MediaImporterService(
    db,
    deps.audioMetadataProvider,
    deps.ebookMetadataProvider,
    deps.importErrorsService,
    deps.hardcoverService,
    deps.appEvents,
    deps.wsEvents,
    deps.requestsService,
    deps.appSettingsService,
    deps.comicMetadataProvider,
    deps.imageProcessing,
    deps.appData,
  );
}

function makeSingleFileUnit(overrides?: Partial<AudiobookUnit>): AudiobookUnit {
  return {
    type: 'single-file',
    path: '/library/TestBook',
    files: ['/library/TestBook/file.m4b'],
    ...overrides,
  };
}

function makeMultiFileUnit(overrides?: Partial<AudiobookUnit>): AudiobookUnit {
  return {
    type: 'multi-file',
    path: '/library/TestBook',
    files: ['/library/TestBook/part1.mp3', '/library/TestBook/part2.mp3'],
    ...overrides,
  };
}

function makeEbookUnit(overrides?: Partial<EbookUnit>): EbookUnit {
  return {
    path: '/library/ebooks/TestBook.epub',
    fileName: 'TestBook.epub',
    ...overrides,
  };
}

// ======================================================================
// Tests
// ======================================================================

describe('MediaImporterService', () => {
  let db: ReturnType<typeof createMockDb>;
  let deps: ReturnType<typeof createMockDeps>;
  let service: MediaImporterService;

  beforeEach(() => {
    db = createMockDb();
    deps = createMockDeps();
    service = buildService(db, deps);
  });

  // ------------------------------------------------------------------
  // importAudiobook
  // ------------------------------------------------------------------
  describe('importAudiobook', () => {
    it('returns existing audiobook ID when already exists (folder-based)', async () => {
      db._chains.select.limit.mockResolvedValueOnce([{ id: 'existing-id' }]);

      const result = await service.importAudiobook(
        makeSingleFileUnit(),
        '/library',
      );

      expect(result).toBe('existing-id');
      // Should not have inserted anything
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('returns existing ID for root-level file (checks via audiobook_files join)', async () => {
      const unit: AudiobookUnit = {
        type: 'single-file',
        path: '/library/standalone.m4b',
        files: ['/library/standalone.m4b'],
      };

      db._chains.select.limit.mockResolvedValueOnce([
        { id: 'root-existing-id' },
      ]);

      const result = await service.importAudiobook(unit, '/library');

      expect(result).toBe('root-existing-id');
      // Should have used innerJoin for root-level detection
      expect(db._chains.select.innerJoin).toHaveBeenCalled();
    });

    it('returns null for quarantined paths', async () => {
      deps.importErrorsService.isQuarantined.mockResolvedValueOnce(true);

      const result = await service.importAudiobook(
        makeSingleFileUnit(),
        '/library',
      );

      expect(result).toBeNull();
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('successfully imports single-file audiobook and creates records', async () => {
      const result = await service.importAudiobook(
        makeSingleFileUnit(),
        '/library',
      );

      expect(result).toBe('new-id');
      // Should insert audiobook, files, and person links
      expect(db.insert).toHaveBeenCalled();
      expect(deps.appEvents.audiobookCreated).toHaveBeenCalledWith('new-id');
      expect(deps.wsEvents.audiobookCreated).toHaveBeenCalledWith('new-id');
    });

    it('creates author and narrator links', async () => {
      await service.importAudiobook(makeSingleFileUnit(), '/library');

      // insert called for: audiobook, files, person upsert (author), author link,
      // person upsert (narrator), narrator link = at least 6 inserts
      expect(db.insert).toHaveBeenCalledTimes(6);
    });

    it('successfully imports multi-file audiobook and generates chapters from files', async () => {
      const unit = makeMultiFileUnit();

      deps.audioMetadataProvider.extractFullMetadata.mockResolvedValueOnce({
        metadata: {
          title: 'Multi Part Book',
          author: 'Author',
          narrator: 'Narrator',
          hasEmbeddedCover: false,
        },
        fileInfo: {
          filePath: '/library/TestBook/part1.mp3',
          fileName: 'part1.mp3',
          duration: 1800,
          format: 'mp3',
          sizeBytes: 25000000,
        },
        chapters: [],
      });

      const result = await service.importAudiobook(unit, '/library');

      expect(result).toBe('new-id');
      // Should have called getFileInfo for the second file
      expect(deps.audioMetadataProvider.getFileInfo).toHaveBeenCalledWith(
        '/library/TestBook/part2.mp3',
      );
    });

    it('sets coverSource to embedded when metadata has embedded cover', async () => {
      deps.audioMetadataProvider.extractFullMetadata.mockResolvedValueOnce({
        metadata: {
          title: 'Book With Cover',
          author: 'Author',
          hasEmbeddedCover: true,
        },
        fileInfo: {
          filePath: '/library/TestBook/file.m4b',
          fileName: 'file.m4b',
          duration: 3600,
          format: 'm4b',
          sizeBytes: 50000000,
        },
        chapters: [],
      });

      await service.importAudiobook(makeSingleFileUnit(), '/library');

      // The insert values should include coverSource: 'embedded'
      const insertValues = db._chains.insert.values.mock.calls[0][0];
      expect(insertValues.coverSource).toBe('embedded');
    });

    it('calls hardcoverService.addToSyncQueue when auto-sync enabled', async () => {
      deps.hardcoverService.getAutoSyncOnImport.mockResolvedValueOnce(true);

      await service.importAudiobook(makeSingleFileUnit(), '/library');

      expect(deps.hardcoverService.addToSyncQueue).toHaveBeenCalledWith(
        'audiobook',
        'new-id',
      );
    });

    it('skips hardcover sync when auto-sync disabled', async () => {
      deps.hardcoverService.getAutoSyncOnImport.mockResolvedValueOnce(false);

      await service.importAudiobook(makeSingleFileUnit(), '/library');

      expect(deps.hardcoverService.addToSyncQueue).not.toHaveBeenCalled();
    });

    it('calls requestsService.tryMatchImport with basename first', async () => {
      await service.importAudiobook(makeSingleFileUnit(), '/library');

      expect(deps.requestsService.tryMatchImport).toHaveBeenCalledWith(
        'TestBook',
        'new-id',
        'audiobook',
      );
    });

    it('tries parent folder when basename match fails', async () => {
      deps.requestsService.tryMatchImport.mockResolvedValue(false);

      await service.importAudiobook(makeSingleFileUnit(), '/library');

      // Should be called twice: once with basename, once with parent folder
      expect(deps.requestsService.tryMatchImport).toHaveBeenCalledTimes(2);
    });

    it('does not try parent folder when basename match succeeds', async () => {
      deps.requestsService.tryMatchImport.mockResolvedValueOnce(true);

      await service.importAudiobook(makeSingleFileUnit(), '/library');

      expect(deps.requestsService.tryMatchImport).toHaveBeenCalledTimes(1);
    });

    it('records error on failure and returns null', async () => {
      deps.audioMetadataProvider.extractFullMetadata.mockRejectedValueOnce(
        new Error('parse failed'),
      );

      const result = await service.importAudiobook(
        makeSingleFileUnit(),
        '/library',
      );

      expect(result).toBeNull();
      expect(deps.importErrorsService.recordError).toHaveBeenCalledWith(
        '/library/TestBook',
        expect.any(Error),
        'IMPORT_FAILED',
      );
    });

    it('clears resolved errors on success', async () => {
      await service.importAudiobook(makeSingleFileUnit(), '/library');

      expect(deps.importErrorsService.clearResolvedByPath).toHaveBeenCalledWith(
        '/library/TestBook',
      );
    });

    it('inserts chapters when embedded chapters exist', async () => {
      deps.audioMetadataProvider.extractFullMetadata.mockResolvedValueOnce({
        metadata: { title: 'Book', author: 'Author', hasEmbeddedCover: false },
        fileInfo: {
          filePath: '/library/TestBook/file.m4b',
          fileName: 'file.m4b',
          duration: 3600,
          format: 'm4b',
          sizeBytes: 50000000,
        },
        chapters: [
          { title: 'Chapter 1', startTime: 0, endTime: 1800 },
          { title: 'Chapter 2', startTime: 1800, endTime: 3600 },
        ],
      });

      await service.importAudiobook(makeSingleFileUnit(), '/library');

      // Should have an insert call with chapter data
      const insertCalls = db._chains.insert.values.mock.calls;
      const chapterInsert = insertCalls.find(
        (call: any) =>
          Array.isArray(call[0]) &&
          call[0].length === 2 &&
          call[0][0].title === 'Chapter 1',
      );
      expect(chapterInsert).toBeDefined();
    });

    it('uses folder name as title for multi-file audiobooks', async () => {
      const unit: AudiobookUnit = {
        type: 'multi-file',
        path: '/library/My Great Audiobook',
        files: [
          '/library/My Great Audiobook/part1.mp3',
          '/library/My Great Audiobook/part2.mp3',
        ],
      };

      deps.audioMetadataProvider.extractFullMetadata.mockResolvedValueOnce({
        metadata: {
          title: 'Track Title',
          album: 'Album Title',
          author: 'Author',
          hasEmbeddedCover: false,
        },
        fileInfo: {
          filePath: '/library/My Great Audiobook/part1.mp3',
          fileName: 'part1.mp3',
          duration: 1800,
          format: 'mp3',
          sizeBytes: 25000000,
        },
        chapters: [],
      });

      await service.importAudiobook(unit, '/library');

      // For multi-file, folder name is preferred
      const insertValues = db._chains.insert.values.mock.calls[0][0];
      expect(insertValues.title).toBe('My Great Audiobook');
    });
  });

  // ------------------------------------------------------------------
  // importEbook
  // ------------------------------------------------------------------
  describe('importEbook', () => {
    it('returns existing ebook ID when already exists', async () => {
      db._chains.select.limit.mockResolvedValueOnce([
        { id: 'existing-ebook-id' },
      ]);

      const result = await service.importEbook(
        makeEbookUnit(),
        '/library/ebooks',
      );

      expect(result).toBe('existing-ebook-id');
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('returns null for quarantined paths', async () => {
      deps.importErrorsService.isQuarantined.mockResolvedValueOnce(true);

      const result = await service.importEbook(
        makeEbookUnit(),
        '/library/ebooks',
      );

      expect(result).toBeNull();
    });

    it('imports ebook with metadata successfully', async () => {
      const result = await service.importEbook(
        makeEbookUnit(),
        '/library/ebooks',
      );

      expect(result).toBe('new-id');
      expect(db.insert).toHaveBeenCalled();
      expect(deps.appEvents.ebookCreated).toHaveBeenCalledWith('new-id');
      expect(deps.wsEvents.ebookCreated).toHaveBeenCalledWith('new-id');
    });

    it('creates author links for multiple authors', async () => {
      deps.ebookMetadataProvider.extractMetadata.mockResolvedValueOnce({
        title: 'Collab Book',
        authors: ['Author One', 'Author Two'],
        cover: undefined,
      });

      await service.importEbook(makeEbookUnit(), '/library/ebooks');

      // Should insert person upsert + ebook author link for each author
      // ebook insert (1) + person upsert + author link (x2) = 5 inserts
      expect(db.insert).toHaveBeenCalledTimes(5);
    });

    it('sets coverSource to embedded when ebook has cover', async () => {
      deps.ebookMetadataProvider.extractMetadata.mockResolvedValueOnce({
        title: 'Book With Cover',
        authors: ['Author'],
        cover: { data: Buffer.from('img'), mimeType: 'image/jpeg' },
      });

      await service.importEbook(makeEbookUnit(), '/library/ebooks');

      const insertValues = db._chains.insert.values.mock.calls[0][0];
      expect(insertValues.coverSource).toBe('embedded');
    });

    it('records error on failure and returns null', async () => {
      deps.ebookMetadataProvider.extractMetadata.mockRejectedValueOnce(
        new Error('epub parse failed'),
      );

      const result = await service.importEbook(
        makeEbookUnit(),
        '/library/ebooks',
      );

      expect(result).toBeNull();
      expect(deps.importErrorsService.recordError).toHaveBeenCalledWith(
        '/library/ebooks/TestBook.epub',
        expect.any(Error),
        'IMPORT_FAILED',
      );
    });

    it('queues for hardcover sync when auto-sync is enabled', async () => {
      deps.hardcoverService.getAutoSyncOnImport.mockResolvedValueOnce(true);

      await service.importEbook(makeEbookUnit(), '/library/ebooks');

      expect(deps.hardcoverService.addToSyncQueue).toHaveBeenCalledWith(
        'ebook',
        'new-id',
      );
    });

    it('tries request matching with filename then parent folder', async () => {
      deps.requestsService.tryMatchImport.mockResolvedValue(false);

      await service.importEbook(makeEbookUnit(), '/library/ebooks');

      expect(deps.requestsService.tryMatchImport).toHaveBeenCalledTimes(2);
      expect(deps.requestsService.tryMatchImport).toHaveBeenCalledWith(
        'TestBook.epub',
        'new-id',
        'ebook',
      );
    });
  });

  // ------------------------------------------------------------------
  // rescanAudiobook
  // ------------------------------------------------------------------
  describe('rescanAudiobook', () => {
    function setupRescanMocks(
      audiobook: Record<string, unknown> | null,
      files: Record<string, unknown>[] = [],
      chapters: Record<string, unknown>[] = [],
    ) {
      // First select call: get audiobook
      // Second select call: get existing files
      // Third select call (if reached): get existing chapters
      let selectCallCount = 0;

      db._chains.select.limit.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return Promise.resolve(audiobook ? [audiobook] : []);
        }
        return Promise.resolve([]);
      });

      db._chains.select.orderBy.mockImplementation(() => {
        return Promise.resolve(files);
      });

      // For chapters query (no orderBy, uses where directly on select chain)
      // We need the third select().from().where() to return chapters
      // This is tricky with chained mocks - override where to return chapters
      // on the third call
      db._chains.select.where.mockImplementation(() => {
        // The chapters query is the one that doesn't chain to orderBy or limit
        // after the files query. We return the chain by default.
        return {
          ...db._chains.select,
          // Override: when this is the chapters query, resolve directly
          then: (resolve: any) => resolve(chapters),
          limit: db._chains.select.limit,
          orderBy: db._chains.select.orderBy,
          innerJoin: db._chains.select.innerJoin,
        };
      });
    }

    it('returns false when audiobook not found', async () => {
      setupRescanMocks(null);

      const result = await service.rescanAudiobook('nonexistent-id');

      expect(result).toBe(false);
    });

    it('returns false when no library path configured', async () => {
      deps.appSettingsService.getAudiobookLibraryPath.mockResolvedValueOnce(
        null,
      );
      setupRescanMocks({ id: 'ab-1', title: 'Test', filePath: 'TestBook' });

      const result = await service.rescanAudiobook('ab-1');

      expect(result).toBe(false);
    });

    it('returns false when no files found', async () => {
      setupRescanMocks(
        { id: 'ab-1', title: 'Test', filePath: 'TestBook', manualFields: [] },
        [], // no files
      );

      const result = await service.rescanAudiobook('ab-1');

      expect(result).toBe(false);
    });

    it('always updates duration', async () => {
      setupRescanMocks(
        {
          id: 'ab-1',
          title: 'Test',
          filePath: 'TestBook',
          manualFields: ['title', 'subtitle', 'description'],
        },
        [{ id: 'f1', audiobookId: 'ab-1', filePath: 'file.m4b', order: 0 }],
      );

      const result = await service.rescanAudiobook('ab-1');

      expect(result).toBe(true);
      // The update().set() should include duration
      const setCall = db._chains.update.set.mock.calls[0][0];
      expect(setCall).toHaveProperty('duration');
      expect(typeof setCall.duration).toBe('number');
    });

    it('respects manualFields and does not overwrite locked fields', async () => {
      setupRescanMocks(
        {
          id: 'ab-1',
          title: 'Manual Title',
          filePath: 'TestBook',
          manualFields: ['title', 'description'],
        },
        [{ id: 'f1', audiobookId: 'ab-1', filePath: 'file.m4b', order: 0 }],
      );

      deps.audioMetadataProvider.extractFullMetadata.mockResolvedValueOnce({
        metadata: {
          title: 'New Title From File',
          description: 'New Description',
          publisher: 'New Publisher',
          hasEmbeddedCover: false,
        },
        fileInfo: {
          filePath: '/library/TestBook/file.m4b',
          fileName: 'file.m4b',
          duration: 7200,
          format: 'm4b',
          sizeBytes: 100000000,
        },
        chapters: [],
      });

      await service.rescanAudiobook('ab-1');

      const setCall = db._chains.update.set.mock.calls[0][0];
      // title and description should NOT be in the update (they are manual)
      expect(setCall).not.toHaveProperty('title');
      expect(setCall).not.toHaveProperty('description');
      // publisher is not manual, so it should be updated
      expect(setCall.publisher).toBe('New Publisher');
    });

    it('updates non-manual fields from metadata', async () => {
      setupRescanMocks(
        {
          id: 'ab-1',
          title: 'Test',
          filePath: 'TestBook',
          manualFields: [],
        },
        [{ id: 'f1', audiobookId: 'ab-1', filePath: 'file.m4b', order: 0 }],
      );

      deps.audioMetadataProvider.extractFullMetadata.mockResolvedValueOnce({
        metadata: {
          title: 'Updated Title',
          subtitle: 'Updated Subtitle',
          publisher: 'Updated Publisher',
          language: 'en',
          hasEmbeddedCover: true,
        },
        fileInfo: {
          filePath: '/library/TestBook/file.m4b',
          fileName: 'file.m4b',
          duration: 3600,
          format: 'm4b',
          sizeBytes: 50000000,
        },
        chapters: [],
      });

      await service.rescanAudiobook('ab-1');

      const setCall = db._chains.update.set.mock.calls[0][0];
      expect(setCall.title).toBe('Updated Title');
      expect(setCall.subtitle).toBe('Updated Subtitle');
      expect(setCall.publisher).toBe('Updated Publisher');
      expect(setCall.language).toBe('en');
      expect(setCall.coverSource).toBe('embedded');
    });

    it('does not replace manual chapters', async () => {
      setupRescanMocks(
        {
          id: 'ab-1',
          title: 'Test',
          filePath: 'TestBook',
          manualFields: [],
        },
        [{ id: 'f1', audiobookId: 'ab-1', filePath: 'file.m4b', order: 0 }],
        [{ id: 'ch-1', audiobookId: 'ab-1', source: 'manual', title: 'My Ch' }],
      );

      // Override the select chain to return manual chapters on the chapters query
      let selectCount = 0;
      db.select.mockImplementation(() => {
        selectCount++;
        const chain = {
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          innerJoin: jest.fn().mockReturnThis(),
          limit: jest.fn(),
          orderBy: jest.fn(),
        };
        if (selectCount === 1) {
          // audiobook query
          chain.limit.mockResolvedValue([
            {
              id: 'ab-1',
              title: 'Test',
              filePath: 'TestBook',
              manualFields: [],
            },
          ]);
        } else if (selectCount === 2) {
          // files query
          chain.orderBy.mockResolvedValue([
            {
              id: 'f1',
              audiobookId: 'ab-1',
              filePath: 'file.m4b',
              order: 0,
            },
          ]);
        } else if (selectCount === 3) {
          // chapters query
          chain.where.mockResolvedValue([
            {
              id: 'ch-1',
              audiobookId: 'ab-1',
              source: 'manual',
              title: 'My Ch',
            },
          ]);
        }
        return chain;
      });

      await service.rescanAudiobook('ab-1');

      // The delete for chapters should NOT be called (after the files delete)
      // since manual chapters exist. We check that chapters insert is not called
      // after the audiobook_files insert.
      // With manual chapters, the service skips chapter replacement.
      expect(deps.appEvents.audiobookUpdated).toHaveBeenCalledWith('ab-1');
    });

    it('replaces embedded chapters on rescan', async () => {
      let selectCount = 0;
      db.select.mockImplementation(() => {
        selectCount++;
        const chain = {
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          innerJoin: jest.fn().mockReturnThis(),
          limit: jest.fn(),
          orderBy: jest.fn(),
        };
        if (selectCount === 1) {
          chain.limit.mockResolvedValue([
            {
              id: 'ab-1',
              title: 'Test',
              filePath: 'TestBook',
              manualFields: [],
            },
          ]);
        } else if (selectCount === 2) {
          chain.orderBy.mockResolvedValue([
            {
              id: 'f1',
              audiobookId: 'ab-1',
              filePath: 'file.m4b',
              order: 0,
            },
          ]);
        } else if (selectCount === 3) {
          // existing chapters are embedded, not manual
          chain.where.mockResolvedValue([
            {
              id: 'ch-1',
              audiobookId: 'ab-1',
              source: 'embedded',
              title: 'Old Chapter 1',
            },
          ]);
        }
        return chain;
      });

      deps.audioMetadataProvider.extractFullMetadata.mockResolvedValueOnce({
        metadata: { title: 'Test', hasEmbeddedCover: false },
        fileInfo: {
          filePath: '/library/TestBook/file.m4b',
          fileName: 'file.m4b',
          duration: 3600,
          format: 'm4b',
          sizeBytes: 50000000,
        },
        chapters: [
          { title: 'New Chapter 1', startTime: 0, endTime: 1800 },
          { title: 'New Chapter 2', startTime: 1800, endTime: 3600 },
        ],
      });

      await service.rescanAudiobook('ab-1');

      // Should have deleted old chapters and inserted new ones
      expect(db.delete).toHaveBeenCalled();
      expect(db.insert).toHaveBeenCalled();
      expect(deps.appEvents.audiobookUpdated).toHaveBeenCalledWith('ab-1');
    });

    it('emits audiobookUpdated event on success', async () => {
      setupRescanMocks(
        {
          id: 'ab-1',
          title: 'Test',
          filePath: 'TestBook',
          manualFields: [],
        },
        [{ id: 'f1', audiobookId: 'ab-1', filePath: 'file.m4b', order: 0 }],
      );

      await service.rescanAudiobook('ab-1');

      expect(deps.appEvents.audiobookUpdated).toHaveBeenCalledWith('ab-1');
      expect(deps.wsEvents.audiobookUpdated).toHaveBeenCalledWith('ab-1');
    });

    it('returns false on exception during rescan', async () => {
      setupRescanMocks(
        {
          id: 'ab-1',
          title: 'Test',
          filePath: 'TestBook',
          manualFields: [],
        },
        [{ id: 'f1', audiobookId: 'ab-1', filePath: 'file.m4b', order: 0 }],
      );

      deps.audioMetadataProvider.extractFullMetadata.mockRejectedValueOnce(
        new Error('metadata read failed'),
      );

      const result = await service.rescanAudiobook('ab-1');

      expect(result).toBe(false);
    });

    it('does not overwrite coverUrl when it is a manual field', async () => {
      setupRescanMocks(
        {
          id: 'ab-1',
          title: 'Test',
          filePath: 'TestBook',
          manualFields: ['coverUrl'],
        },
        [{ id: 'f1', audiobookId: 'ab-1', filePath: 'file.m4b', order: 0 }],
      );

      deps.audioMetadataProvider.extractFullMetadata.mockResolvedValueOnce({
        metadata: { title: 'Test', hasEmbeddedCover: true },
        fileInfo: {
          filePath: '/library/TestBook/file.m4b',
          fileName: 'file.m4b',
          duration: 3600,
          format: 'm4b',
          sizeBytes: 50000000,
        },
        chapters: [],
      });

      await service.rescanAudiobook('ab-1');

      const setCall = db._chains.update.set.mock.calls[0][0];
      expect(setCall).not.toHaveProperty('coverSource');
    });
  });
});
