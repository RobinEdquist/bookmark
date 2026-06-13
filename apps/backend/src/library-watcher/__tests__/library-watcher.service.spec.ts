jest.mock('@thallesp/nestjs-better-auth', () => ({
  AuthService: jest.fn(),
}));

jest.mock('p-limit', () => ({
  __esModule: true,
  default: (_concurrency: number) => {
    return <T>(fn: () => Promise<T>): Promise<T> => fn();
  },
}));

jest.mock('chokidar', () => ({
  watch: jest.fn().mockReturnValue({
    on: jest.fn().mockReturnThis(),
    close: jest.fn().mockResolvedValue(undefined),
  }),
}));

import { createMockDb, createChainMock } from '@test-utils';
import { LibraryWatcherService } from '../library-watcher.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockAppSettings(overrides: Record<string, any> = {}) {
  return {
    getSettings: jest.fn().mockResolvedValue({
      audiobookLibraryPath: '/audiobooks',
      ebookLibraryPath: '/ebooks',
      comicLibraryPath: null,
      watcherEnabled: true,
    }),
    getAudiobookLibraryPath: jest.fn().mockResolvedValue('/audiobooks'),
    getEbookLibraryPath: jest.fn().mockResolvedValue('/ebooks'),
    getComicLibraryPath: jest.fn().mockResolvedValue(null),
    ...overrides,
  };
}

function createMockAppEvents() {
  return {
    subscribe: jest.fn(),
  };
}

function createMockWsEvents() {
  return {
    rescanStatusUpdated: jest.fn(),
  };
}

function createMockFileWatcher() {
  return {
    startWatching: jest.fn().mockResolvedValue(undefined),
    startWatchingAudiobooks: jest.fn().mockResolvedValue(undefined),
    startWatchingEbooks: jest.fn().mockResolvedValue(undefined),
    stopWatching: jest.fn().mockResolvedValue(undefined),
    stopAudiobookWatcher: jest.fn().mockResolvedValue(undefined),
    stopEbookWatcher: jest.fn().mockResolvedValue(undefined),
    stopComicWatcher: jest.fn().mockResolvedValue(undefined),
    startWatchingComics: jest.fn().mockResolvedValue(undefined),
    isWatchingAudiobooks: jest.fn().mockReturnValue(false),
    isWatchingEbooks: jest.fn().mockReturnValue(false),
    isWatchingComics: jest.fn().mockReturnValue(false),
    getCurrentAudiobookPath: jest.fn().mockReturnValue(null),
    getCurrentEbookPath: jest.fn().mockReturnValue(null),
    getCurrentComicPath: jest.fn().mockReturnValue(null),
  };
}

function createMockLibraryScanner() {
  return {
    scanAudiobookLibrary: jest
      .fn()
      .mockResolvedValue({ added: 0, removed: 0, updated: 0 }),
    scanEbookLibrary: jest
      .fn()
      .mockResolvedValue({ added: 0, removed: 0, updated: 0 }),
    scanComicLibrary: jest
      .fn()
      .mockResolvedValue({ added: 0, removed: 0, updated: 0 }),
    isScanning: jest.fn().mockReturnValue(false),
    getProgress: jest.fn().mockReturnValue(null),
    onProgress: jest.fn(),
  };
}

function createMockMediaImporter() {
  return {
    rescanAudiobook: jest.fn().mockResolvedValue(true),
  };
}

function createService() {
  const db = createMockDb();
  const appSettings = createMockAppSettings();
  const appEvents = createMockAppEvents();
  const wsEvents = createMockWsEvents();
  const fileWatcher = createMockFileWatcher();
  const libraryScanner = createMockLibraryScanner();
  const mediaImporter = createMockMediaImporter();

  const service = new LibraryWatcherService(
    db as any,
    appSettings as any,
    appEvents as any,
    wsEvents as any,
    fileWatcher as any,
    libraryScanner as any,
    mediaImporter as any,
  );

  return {
    service,
    db,
    appSettings,
    appEvents,
    wsEvents,
    fileWatcher,
    libraryScanner,
    mediaImporter,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LibraryWatcherService', () => {
  // -----------------------------------------------------------------------
  // initialize (via onModuleInit)
  // -----------------------------------------------------------------------
  describe('onModuleInit / initialize', () => {
    it('reads settings and starts scan for configured paths', async () => {
      const { service, appSettings, libraryScanner } = createService();

      await service.onModuleInit();

      expect(appSettings.getSettings).toHaveBeenCalled();
      expect(libraryScanner.scanAudiobookLibrary).toHaveBeenCalledWith(
        '/audiobooks',
      );
      expect(libraryScanner.scanEbookLibrary).toHaveBeenCalledWith('/ebooks');
    });

    it('starts file watchers when watcherEnabled', async () => {
      const { service, fileWatcher } = createService();

      await service.onModuleInit();

      expect(fileWatcher.startWatchingAudiobooks).toHaveBeenCalledWith(
        '/audiobooks',
      );
      expect(fileWatcher.startWatchingEbooks).toHaveBeenCalledWith('/ebooks');
    });

    it('does not start watchers when watcherEnabled is false', async () => {
      const { service, appSettings, fileWatcher } = createService();
      appSettings.getSettings.mockResolvedValue({
        audiobookLibraryPath: '/audiobooks',
        ebookLibraryPath: '/ebooks',
        comicLibraryPath: null,
        watcherEnabled: false,
      });

      await service.onModuleInit();

      expect(fileWatcher.startWatchingAudiobooks).not.toHaveBeenCalled();
      expect(fileWatcher.startWatchingEbooks).not.toHaveBeenCalled();
    });

    it('subscribes to app events for settings changes', async () => {
      const { service, appEvents } = createService();

      await service.onModuleInit();

      expect(appEvents.subscribe).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  // -----------------------------------------------------------------------
  // handleSettingsUpdate
  // -----------------------------------------------------------------------
  describe('handleSettingsUpdate (via appEvents)', () => {
    it('detects audiobook path change and triggers scan', async () => {
      const { service, appSettings, appEvents, libraryScanner, fileWatcher } =
        createService();
      await service.onModuleInit();

      // Get the callback registered with appEvents.subscribe
      const callback = appEvents.subscribe.mock.calls[0][0];

      // Change the settings
      appSettings.getSettings.mockResolvedValue({
        audiobookLibraryPath: '/new-audiobooks',
        ebookLibraryPath: '/ebooks',
        comicLibraryPath: null,
        watcherEnabled: true,
      });

      await callback({ type: 'settings.updated' });

      expect(fileWatcher.stopAudiobookWatcher).toHaveBeenCalled();
      expect(libraryScanner.scanAudiobookLibrary).toHaveBeenCalledWith(
        '/new-audiobooks',
      );
    });

    it('detects ebook path change and triggers scan', async () => {
      const { service, appSettings, appEvents, libraryScanner, fileWatcher } =
        createService();
      await service.onModuleInit();

      const callback = appEvents.subscribe.mock.calls[0][0];

      appSettings.getSettings.mockResolvedValue({
        audiobookLibraryPath: '/audiobooks',
        ebookLibraryPath: '/new-ebooks',
        comicLibraryPath: null,
        watcherEnabled: true,
      });

      await callback({ type: 'settings.updated' });

      expect(fileWatcher.stopEbookWatcher).toHaveBeenCalled();
      expect(libraryScanner.scanEbookLibrary).toHaveBeenCalledWith(
        '/new-ebooks',
      );
    });
  });

  // -----------------------------------------------------------------------
  // setWatcherEnabled
  // -----------------------------------------------------------------------
  describe('setWatcherEnabled', () => {
    it('starts watchers for configured paths when enabled', async () => {
      const { service, fileWatcher } = createService();
      await service.onModuleInit();

      // Reset to simulate watchers not running
      fileWatcher.startWatchingAudiobooks.mockClear();
      fileWatcher.startWatchingEbooks.mockClear();
      fileWatcher.isWatchingAudiobooks.mockReturnValue(false);
      fileWatcher.isWatchingEbooks.mockReturnValue(false);

      await service.setWatcherEnabled(true);

      expect(fileWatcher.startWatchingAudiobooks).toHaveBeenCalledWith(
        '/audiobooks',
      );
      expect(fileWatcher.startWatchingEbooks).toHaveBeenCalledWith('/ebooks');
    });

    it('stops all watchers when disabled', async () => {
      const { service, fileWatcher } = createService();
      await service.onModuleInit();

      await service.setWatcherEnabled(false);

      expect(fileWatcher.stopWatching).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // runAudiobookScan
  // -----------------------------------------------------------------------
  describe('runAudiobookScan', () => {
    it('uses provided path', async () => {
      const { service, libraryScanner } = createService();

      await service.runAudiobookScan('/custom-path');

      expect(libraryScanner.scanAudiobookLibrary).toHaveBeenCalledWith(
        '/custom-path',
      );
    });

    it('falls back to settings path', async () => {
      const { service, appSettings, libraryScanner } = createService();

      await service.runAudiobookScan();

      expect(appSettings.getAudiobookLibraryPath).toHaveBeenCalled();
      expect(libraryScanner.scanAudiobookLibrary).toHaveBeenCalledWith(
        '/audiobooks',
      );
    });

    it('throws when no path available', async () => {
      const { service, appSettings } = createService();
      appSettings.getAudiobookLibraryPath.mockResolvedValue(null);

      await expect(service.runAudiobookScan()).rejects.toThrow(
        'No audiobook library path configured',
      );
    });
  });

  // -----------------------------------------------------------------------
  // runEbookScan
  // -----------------------------------------------------------------------
  describe('runEbookScan', () => {
    it('throws when no path available', async () => {
      const { service, appSettings } = createService();
      appSettings.getEbookLibraryPath.mockResolvedValue(null);

      await expect(service.runEbookScan()).rejects.toThrow(
        'No ebook library path configured',
      );
    });
  });

  // -----------------------------------------------------------------------
  // rescanAllAudiobooks
  // -----------------------------------------------------------------------
  describe('rescanAllAudiobooks', () => {
    it('iterates audiobooks and calls mediaImporter.rescanAudiobook', async () => {
      const { service, db, mediaImporter } = createService();

      const selectChain = createChainMock(['from', 'where', 'orderBy']);
      selectChain.from.mockResolvedValue([
        { id: 'a1', title: 'Book One' },
        { id: 'a2', title: 'Book Two' },
      ]);
      db.select.mockReturnValue(selectChain);

      const result = await service.rescanAllAudiobooks();

      expect(mediaImporter.rescanAudiobook).toHaveBeenCalledTimes(2);
      expect(mediaImporter.rescanAudiobook).toHaveBeenCalledWith('a1');
      expect(mediaImporter.rescanAudiobook).toHaveBeenCalledWith('a2');
      expect(result).toEqual({ total: 2, succeeded: 2, failed: 0 });
    });

    it('throws when already rescanning', async () => {
      const { service, db } = createService();

      const selectChain = createChainMock(['from']);
      // Create a promise that we control to keep the first rescan running
      let resolveFirst!: (value: any) => void;
      selectChain.from.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      );
      db.select.mockReturnValue(selectChain);

      // Start first rescan (will hang on db query)
      const firstRescan = service.rescanAllAudiobooks();

      // Attempt second rescan immediately
      await expect(service.rescanAllAudiobooks()).rejects.toThrow(
        'Rescan is already in progress',
      );

      // Clean up: resolve first rescan
      resolveFirst([]);
      await firstRescan;
    });

    it('emits rescan status via wsEvents', async () => {
      const { service, db, wsEvents } = createService();

      const selectChain = createChainMock(['from']);
      selectChain.from.mockResolvedValue([{ id: 'a1', title: 'Book One' }]);
      db.select.mockReturnValue(selectChain);

      await service.rescanAllAudiobooks();

      expect(wsEvents.rescanStatusUpdated).toHaveBeenCalled();
      // Should emit at least: preparing, rescanning, and final status
      expect(
        wsEvents.rescanStatusUpdated.mock.calls.length,
      ).toBeGreaterThanOrEqual(3);
    });

    it('resets state in finally block', async () => {
      const { service, db } = createService();

      const selectChain = createChainMock(['from']);
      selectChain.from.mockResolvedValue([]);
      db.select.mockReturnValue(selectChain);

      await service.rescanAllAudiobooks();

      const status = service.getRescanStatus();
      expect(status.isRescanning).toBe(false);
      expect(status.total).toBe(0);
      expect(status.processed).toBe(0);
      expect(status.currentAudiobook).toBeUndefined();
    });

    it('handles failed rescans', async () => {
      const { service, db, mediaImporter } = createService();

      const selectChain = createChainMock(['from']);
      selectChain.from.mockResolvedValue([
        { id: 'a1', title: 'Book One' },
        { id: 'a2', title: 'Book Two' },
      ]);
      db.select.mockReturnValue(selectChain);

      mediaImporter.rescanAudiobook
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('Rescan failed'));

      const result = await service.rescanAllAudiobooks();

      expect(result).toEqual({ total: 2, succeeded: 1, failed: 1 });
    });

    it('counts false return as failed', async () => {
      const { service, db, mediaImporter } = createService();

      const selectChain = createChainMock(['from']);
      selectChain.from.mockResolvedValue([{ id: 'a1', title: 'Book One' }]);
      db.select.mockReturnValue(selectChain);

      mediaImporter.rescanAudiobook.mockResolvedValue(false);

      const result = await service.rescanAllAudiobooks();

      expect(result).toEqual({ total: 1, succeeded: 0, failed: 1 });
    });
  });

  // -----------------------------------------------------------------------
  // getStatus
  // -----------------------------------------------------------------------
  describe('getStatus', () => {
    it('returns correct state from fileWatcher and libraryScanner', () => {
      const { service, fileWatcher, libraryScanner } = createService();

      fileWatcher.isWatchingAudiobooks.mockReturnValue(true);
      fileWatcher.isWatchingEbooks.mockReturnValue(false);
      fileWatcher.getCurrentAudiobookPath.mockReturnValue('/audiobooks');
      fileWatcher.getCurrentEbookPath.mockReturnValue(null);
      libraryScanner.isScanning.mockReturnValue(true);
      libraryScanner.getProgress.mockReturnValue({ processed: 5, total: 10 });

      const status = service.getStatus();

      expect(status).toEqual({
        watching: { audiobooks: true, ebooks: false, comics: false },
        paths: { audiobooks: '/audiobooks', ebooks: null, comics: null },
        scanning: true,
        progress: { processed: 5, total: 10 },
      });
    });
  });

  // -----------------------------------------------------------------------
  // getRescanStatus
  // -----------------------------------------------------------------------
  describe('getRescanStatus', () => {
    it('returns current rescan state', () => {
      const { service } = createService();

      const status = service.getRescanStatus();

      expect(status).toEqual({
        isRescanning: false,
        phase: undefined,
        total: 0,
        processed: 0,
        percentage: 0,
        currentAudiobook: undefined,
      });
    });
  });
});
