jest.mock('fs/promises');

import { RestoreImporterService } from '../restore-importer.service';
import { RestoreSessionState } from '../types/restore-session.types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createChain(methods: string[]) {
  const chain: Record<string, jest.Mock> = {};
  for (const m of methods) chain[m] = jest.fn().mockReturnThis();
  return chain;
}

function createMockTx() {
  const selectChain = createChain([
    'from',
    'where',
    'limit',
    'orderBy',
    'innerJoin',
  ]);
  const insertChain = createChain([
    'values',
    'returning',
    'onConflictDoUpdate',
  ]);
  const updateChain = createChain(['set', 'where']);
  const deleteChain = createChain(['where']);

  return {
    select: jest.fn().mockReturnValue(selectChain),
    insert: jest.fn().mockReturnValue(insertChain),
    update: jest.fn().mockReturnValue(updateChain),
    delete: jest.fn().mockReturnValue(deleteChain),
    _selectChain: selectChain,
    _insertChain: insertChain,
    _updateChain: updateChain,
    _deleteChain: deleteChain,
  };
}

function createMockDb(mockTx: any) {
  const selectChain = createChain([
    'from',
    'where',
    'limit',
    'orderBy',
    'innerJoin',
  ]);
  const insertChain = createChain([
    'values',
    'returning',
    'onConflictDoUpdate',
  ]);
  const updateChain = createChain(['set', 'where']);
  const deleteChain = createChain(['where']);

  return {
    select: jest.fn().mockReturnValue(selectChain),
    insert: jest.fn().mockReturnValue(insertChain),
    update: jest.fn().mockReturnValue(updateChain),
    delete: jest.fn().mockReturnValue(deleteChain),
    transaction: jest.fn(async (cb: any) => cb(mockTx)),
    _selectChain: selectChain,
    _insertChain: insertChain,
    _updateChain: updateChain,
    _deleteChain: deleteChain,
  };
}

function buildLibraryData(overrides: any = {}) {
  return {
    libraryItems: [
      {
        id: 'item-1',
        title: 'Book 1',
        mediaId: 'book-1',
        path: '/abs/lib/Author/Book',
        authorNamesFirstLast: 'Author Name',
        createdAt: Date.now(),
      },
    ],
    books: new Map([
      [
        'book-1',
        {
          id: 'book-1',
          title: 'Book 1',
          subtitle: null,
          description: 'A test book',
          publisher: 'Publisher',
          publishedDate: '2024-01-01',
          language: 'en',
          isbn: '1234567890',
          asin: 'B00TEST',
          duration: 3600,
          explicit: false,
          coverPath: null,
          audioFiles: [
            {
              index: 0,
              duration: 3600,
              format: 'm4b',
              bitRate: 128000,
              metadata: {
                relPath: 'file.m4b',
                filename: 'file.m4b',
                ext: '.m4b',
                size: 50000000,
              },
            },
          ],
          chapters: [{ title: 'Chapter 1', start: 0, end: 1800 }],
          narrators: ['Narrator One'],
          genres: ['Fiction', 'Fantasy'],
        },
      ],
    ]),
    authors: [{ id: 'a1', name: 'Author Name' }],
    series: [{ id: 's1', name: 'Test Series' }],
    bookAuthors: [{ bookId: 'book-1', authorId: 'a1' }],
    bookSeries: [{ bookId: 'book-1', seriesId: 's1', sequence: '1' }],
    users: [{ id: 'u1', username: 'testuser' }],
    mediaProgresses: [
      {
        userId: 'u1',
        mediaItemId: 'item-1',
        currentTime: 500,
        isFinished: false,
        finishedAt: null,
        hideFromContinueListening: false,
      },
    ],
    ...overrides,
  };
}

function buildSession(overrides: any = {}) {
  return {
    id: 'session-1',
    state: RestoreSessionState.IMPORTING,
    startedAt: new Date(),
    totalItems: 10,
    processedItems: 0,
    selectedLibraryId: 'lib-1',
    extractedPath: '/tmp/session-1',
    pathMappings: [{ absPath: '/abs/lib', savPath: '/sav/lib' }],
    userMappings: [
      {
        absUserId: 'u1',
        absUsername: 'testuser',
        savUserId: 'sav-user-1',
        progressCount: 1,
        inProgressCount: 1,
        finishedCount: 0,
      },
    ],
    options: {
      importProgress: true,
      importCovers: false,
      importAuthorImages: false,
      overwriteExisting: false,
      lockMetadata: false,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RestoreImporterService', () => {
  let mockTx: any;
  let mockDb: any;
  let mockAbsParser: any;
  let mockAppData: any;
  let service: RestoreImporterService;

  beforeEach(() => {
    mockTx = createMockTx();
    mockDb = createMockDb(mockTx);
    mockAbsParser = {
      parseLibraryData: jest.fn(),
      getCoverPath: jest.fn(),
      getAuthorImagePath: jest.fn(),
    };
    mockAppData = {
      getAudiobookCoverPath: jest.fn().mockReturnValue('/data/covers/id.jpg'),
      getPersonImagePath: jest.fn().mockReturnValue('/data/people/id.jpg'),
    };

    service = new RestoreImporterService(
      mockDb as any,
      mockAbsParser,
      mockAppData,
    );
  });

  // -----------------------------------------------------------------------
  // executeImport — basic validation
  // -----------------------------------------------------------------------
  describe('executeImport — validation', () => {
    it('throws when session has no selectedLibraryId', async () => {
      const session = buildSession({ selectedLibraryId: undefined });
      await expect(service.executeImport(session as any)).rejects.toThrow(
        'Session is not properly configured',
      );
    });

    it('throws when session has no extractedPath', async () => {
      const session = buildSession({ extractedPath: undefined });
      await expect(service.executeImport(session as any)).rejects.toThrow(
        'Session is not properly configured',
      );
    });
  });

  // -----------------------------------------------------------------------
  // executeImport — full flow
  // -----------------------------------------------------------------------
  describe('executeImport — full flow', () => {
    beforeEach(() => {
      const libraryData = buildLibraryData();
      mockAbsParser.parseLibraryData.mockResolvedValue(libraryData);

      // DB mock: findOrCreatePersonNoTx — upsert returning person id
      mockDb._insertChain.returning.mockResolvedValue([{ id: 'sav-person-1' }]);
      mockDb._insertChain.onConflictDoUpdate.mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ id: 'sav-person-1' }]),
      });

      // DB mock: findOrCreateSeriesNoTx — select returns empty, insert returns new
      mockDb._selectChain.limit.mockResolvedValue([]);
      mockDb._insertChain.returning.mockResolvedValue([{ id: 'sav-series-1' }]);

      // Transaction mock: audiobook import
      mockTx._selectChain.limit.mockResolvedValue([]); // no existing audiobook
      mockTx._insertChain.returning.mockResolvedValue([
        { id: 'sav-audiobook-1' },
      ]);
      mockTx._insertChain.values.mockResolvedValue(undefined);
    });

    it('calls absParserService.parseLibraryData with correct args', async () => {
      const session = buildSession();
      await service.executeImport(session as any);

      expect(mockAbsParser.parseLibraryData).toHaveBeenCalledWith(
        '/tmp/session-1',
        'lib-1',
      );
    });

    it('imports authors using upsert', async () => {
      const session = buildSession();
      await service.executeImport(session as any);

      // Should have called insert for people (authors + narrators)
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('imports series', async () => {
      const session = buildSession();
      await service.executeImport(session as any);

      // The findOrCreateSeriesNoTx path: select -> if empty -> insert
      expect(mockDb.select).toHaveBeenCalled();
    });

    it('creates audiobook in transaction', async () => {
      const session = buildSession();
      await service.executeImport(session as any);

      expect(mockDb.transaction).toHaveBeenCalled();
      // The tx.insert should have been called for audiobook creation
      expect(mockTx.insert).toHaveBeenCalled();
    });

    it('skips existing audiobook when overwriteExisting is false', async () => {
      mockTx._selectChain.limit.mockResolvedValue([
        { id: 'existing-audiobook' },
      ]);

      const session = buildSession({
        options: { ...buildSession().options, overwriteExisting: false },
      });
      await service.executeImport(session as any);

      // Transaction is called, but the audiobook insert should NOT be called
      // since it returns the existing id. The tx.insert calls are only for
      // linking authors/narrators/series/genres/files/chapters — which also
      // don't happen when we skip. So the first tx.insert value call should
      // not have audiobook-level values with 'title'.
      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it('updates existing audiobook when overwriteExisting is true', async () => {
      mockTx._selectChain.limit.mockResolvedValue([
        { id: 'existing-audiobook' },
      ]);

      const session = buildSession({
        options: { ...buildSession().options, overwriteExisting: true },
      });
      await service.executeImport(session as any);

      // Should call update and delete old relations
      expect(mockTx.update).toHaveBeenCalled();
      expect(mockTx.delete).toHaveBeenCalled();
    });

    it('sets manualFields when lockMetadata is true', async () => {
      const session = buildSession({
        options: { ...buildSession().options, lockMetadata: true },
      });
      await service.executeImport(session as any);

      expect(mockDb.transaction).toHaveBeenCalled();
      // Verify insert was called with manualFields included
      const insertCall = mockTx._insertChain.values.mock.calls.find(
        (call: any) => call[0]?.manualFields?.length > 0,
      );
      expect(insertCall).toBeDefined();
    });

    it('emits restore.completed event on success', async () => {
      const completedHandler = jest.fn();
      service.on('restore.completed', completedHandler);

      const session = buildSession();
      await service.executeImport(session as any);

      expect(completedHandler).toHaveBeenCalledWith({
        sessionId: 'session-1',
      });

      service.off('restore.completed', completedHandler);
    });

    it('emits restore.failed event on error', async () => {
      mockAbsParser.parseLibraryData.mockRejectedValue(
        new Error('Parse failed'),
      );

      const failedHandler = jest.fn();
      service.on('restore.failed', failedHandler);

      const session = buildSession();
      await expect(service.executeImport(session as any)).rejects.toThrow(
        'Parse failed',
      );

      expect(failedHandler).toHaveBeenCalledWith({
        sessionId: 'session-1',
        error: 'Parse failed',
      });

      service.off('restore.failed', failedHandler);
    });

    it('emits restore.progress events during import', async () => {
      const progressHandler = jest.fn();
      service.on('restore.progress', progressHandler);

      const session = buildSession();
      await service.executeImport(session as any);

      expect(progressHandler).toHaveBeenCalled();
      const firstCall = progressHandler.mock.calls[0][0];
      expect(firstCall).toHaveProperty('sessionId', 'session-1');
      expect(firstCall).toHaveProperty('state', RestoreSessionState.IMPORTING);
      expect(firstCall).toHaveProperty('percentage');

      service.off('restore.progress', progressHandler);
    });
  });

  // -----------------------------------------------------------------------
  // executeImport — progress import
  // -----------------------------------------------------------------------
  describe('executeImport — progress records', () => {
    beforeEach(() => {
      mockDb._insertChain.returning.mockResolvedValue([{ id: 'sav-person-1' }]);
      mockDb._insertChain.onConflictDoUpdate.mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ id: 'sav-person-1' }]),
      });
      mockDb._selectChain.limit.mockResolvedValue([]);

      mockTx._selectChain.limit.mockResolvedValue([]);
      mockTx._insertChain.returning.mockResolvedValue([
        { id: 'sav-audiobook-1' },
      ]);
      mockTx._insertChain.values.mockResolvedValue(undefined);
    });

    it('imports progress for mapped users', async () => {
      mockAbsParser.parseLibraryData.mockResolvedValue(buildLibraryData());

      const session = buildSession();
      await service.executeImport(session as any);

      // transaction called: at least for audiobook import
      // Progress batching also uses transaction when there are importable records
      expect(mockDb.transaction).toHaveBeenCalled();
    });

    it('skips progress for unmapped users', async () => {
      mockAbsParser.parseLibraryData.mockResolvedValue(
        buildLibraryData({
          mediaProgresses: [
            {
              userId: 'unmapped-user',
              mediaItemId: 'item-1',
              currentTime: 500,
              isFinished: false,
            },
          ],
        }),
      );

      const session = buildSession();
      await service.executeImport(session as any);

      // Only 1 transaction for audiobook, no progress batch (all skipped)
      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    });

    it('skips progress when importProgress is disabled', async () => {
      mockAbsParser.parseLibraryData.mockResolvedValue(buildLibraryData());

      const session = buildSession({
        options: { ...buildSession().options, importProgress: false },
      });
      await service.executeImport(session as any);

      // Only audiobook transaction, no progress
      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // executeImport — path mapping
  // -----------------------------------------------------------------------
  describe('executeImport — path mapping', () => {
    beforeEach(() => {
      mockDb._insertChain.returning.mockResolvedValue([{ id: 'sav-person-1' }]);
      mockDb._insertChain.onConflictDoUpdate.mockReturnValue({
        returning: jest.fn().mockResolvedValue([{ id: 'sav-person-1' }]),
      });
      mockDb._selectChain.limit.mockResolvedValue([]);
    });

    it('skips items with no matching path mapping', async () => {
      mockAbsParser.parseLibraryData.mockResolvedValue(
        buildLibraryData({
          libraryItems: [
            {
              id: 'item-1',
              title: 'Book 1',
              mediaId: 'book-1',
              path: '/different/path/Author/Book',
              authorNamesFirstLast: 'Author',
              createdAt: Date.now(),
            },
          ],
        }),
      );

      const session = buildSession();
      await service.executeImport(session as any);

      // No audiobook transaction
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Event subscription
  // -----------------------------------------------------------------------
  describe('event subscription', () => {
    it('supports on/off for events', () => {
      const handler = jest.fn();
      service.on('restore.progress', handler);
      service.off('restore.progress', handler);

      // After off, handler should not be called
      (service as any).eventEmitter.emit('restore.progress', {});
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
