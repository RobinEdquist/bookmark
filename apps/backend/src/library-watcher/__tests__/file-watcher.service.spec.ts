jest.mock('@thallesp/nestjs-better-auth', () => ({
  AuthService: jest.fn(),
}));

jest.mock('p-limit', () => ({
  __esModule: true,
  default: (_concurrency: number) => {
    return <T>(fn: () => Promise<T>): Promise<T> => fn();
  },
}));

jest.mock('chokidar', () => {
  const mockWatcher = {
    on: jest.fn().mockReturnThis(),
    close: jest.fn().mockResolvedValue(undefined),
  };
  return { watch: jest.fn().mockReturnValue(mockWatcher) };
});

import * as chokidar from 'chokidar';
import { FileWatcherService } from '../file-watcher.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockedChokidar = jest.mocked(chokidar);

function getLastWatcherMock() {
  const calls = mockedChokidar.watch.mock.results;
  return calls[calls.length - 1].value as { on: jest.Mock; close: jest.Mock };
}

function getEventCallback(
  watcher: { on: jest.Mock },
  eventName: string,
): (...args: any[]) => void {
  const call = watcher.on.mock.calls.find(
    ([name]: [string]) => name === eventName,
  );
  if (!call) {
    throw new Error(`No handler registered for event "${eventName}"`);
  }
  return call[1];
}

function createMocks() {
  return {
    importQueue: {
      queueFile: jest.fn(),
      queueDirectory: jest.fn(),
    },
    libraryScanner: {
      handlePathRemoved: jest.fn(),
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FileWatcherService', () => {
  let service: FileWatcherService;
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    jest.clearAllMocks();
    mocks = createMocks();
    service = new FileWatcherService(
      mocks.importQueue as any,
      mocks.libraryScanner as any,
    );
  });

  // -----------------------------------------------------------------------
  // startWatching
  // -----------------------------------------------------------------------
  describe('startWatching', () => {
    it('creates audiobook watcher when path provided', async () => {
      await service.startWatching({
        audiobookPath: '/audiobooks',
        ebookPath: null,
      });

      expect(mockedChokidar.watch).toHaveBeenCalledWith(
        '/audiobooks',
        expect.objectContaining({ persistent: true, ignoreInitial: true }),
      );
      expect(service.isWatchingAudiobooks()).toBe(true);
      expect(service.getCurrentAudiobookPath()).toBe('/audiobooks');
    });

    it('creates ebook watcher when path provided', async () => {
      await service.startWatching({
        audiobookPath: null,
        ebookPath: '/ebooks',
      });

      expect(mockedChokidar.watch).toHaveBeenCalledWith(
        '/ebooks',
        expect.objectContaining({ persistent: true }),
      );
      expect(service.isWatchingEbooks()).toBe(true);
      expect(service.getCurrentEbookPath()).toBe('/ebooks');
    });

    it('stops existing watcher when path changes', async () => {
      await service.startWatching({
        audiobookPath: '/audiobooks-v1',
        ebookPath: null,
      });
      const firstWatcher = getLastWatcherMock();

      await service.startWatching({
        audiobookPath: '/audiobooks-v2',
        ebookPath: null,
      });

      expect(firstWatcher.close).toHaveBeenCalled();
      expect(service.getCurrentAudiobookPath()).toBe('/audiobooks-v2');
    });

    it('stops watcher when path becomes null', async () => {
      await service.startWatching({
        audiobookPath: '/audiobooks',
        ebookPath: null,
      });
      const watcher = getLastWatcherMock();

      await service.startWatching({
        audiobookPath: null,
        ebookPath: null,
      });

      expect(watcher.close).toHaveBeenCalled();
      expect(service.isWatchingAudiobooks()).toBe(false);
      expect(service.getCurrentAudiobookPath()).toBeNull();
    });

    it('does nothing when path unchanged', async () => {
      await service.startWatching({
        audiobookPath: '/audiobooks',
        ebookPath: null,
      });
      const callCount = mockedChokidar.watch.mock.calls.length;

      await service.startWatching({
        audiobookPath: '/audiobooks',
        ebookPath: null,
      });

      expect(mockedChokidar.watch.mock.calls.length).toBe(callCount);
    });
  });

  // -----------------------------------------------------------------------
  // stopWatching
  // -----------------------------------------------------------------------
  describe('stopWatching', () => {
    it('closes all watchers', async () => {
      await service.startWatching({
        audiobookPath: '/audiobooks',
        ebookPath: '/ebooks',
      });
      const watcherCalls = mockedChokidar.watch.mock.results;
      const audiobookWatcher = watcherCalls[0].value as { close: jest.Mock };
      const ebookWatcher = watcherCalls[1].value as { close: jest.Mock };

      await service.stopWatching();

      expect(audiobookWatcher.close).toHaveBeenCalled();
      expect(ebookWatcher.close).toHaveBeenCalled();
      expect(service.isWatching()).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // stopAudiobookWatcher
  // -----------------------------------------------------------------------
  describe('stopAudiobookWatcher', () => {
    it('closes and nullifies audiobook watcher', async () => {
      await service.startWatching({
        audiobookPath: '/audiobooks',
        ebookPath: null,
      });
      const watcher = getLastWatcherMock();

      await service.stopAudiobookWatcher();

      expect(watcher.close).toHaveBeenCalled();
      expect(service.isWatchingAudiobooks()).toBe(false);
      expect(service.getCurrentAudiobookPath()).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // isWatching
  // -----------------------------------------------------------------------
  describe('isWatching', () => {
    it('returns true when any watcher active', async () => {
      await service.startWatching({
        audiobookPath: null,
        ebookPath: '/ebooks',
      });

      expect(service.isWatching()).toBe(true);
    });

    it('returns false when no watchers', () => {
      expect(service.isWatching()).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // isWatchingAudiobooks / isWatchingEbooks
  // -----------------------------------------------------------------------
  describe('isWatchingAudiobooks / isWatchingEbooks', () => {
    it('returns correct state for audiobooks', async () => {
      expect(service.isWatchingAudiobooks()).toBe(false);
      await service.startWatchingAudiobooks('/audiobooks');
      expect(service.isWatchingAudiobooks()).toBe(true);
    });

    it('returns correct state for ebooks', async () => {
      expect(service.isWatchingEbooks()).toBe(false);
      await service.startWatchingEbooks('/ebooks');
      expect(service.isWatchingEbooks()).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // getCurrentAudiobookPath / getCurrentEbookPath
  // -----------------------------------------------------------------------
  describe('getCurrentAudiobookPath / getCurrentEbookPath', () => {
    it('returns correct paths', async () => {
      expect(service.getCurrentAudiobookPath()).toBeNull();
      expect(service.getCurrentEbookPath()).toBeNull();

      await service.startWatching({
        audiobookPath: '/audiobooks',
        ebookPath: '/ebooks',
      });

      expect(service.getCurrentAudiobookPath()).toBe('/audiobooks');
      expect(service.getCurrentEbookPath()).toBe('/ebooks');
    });
  });

  // -----------------------------------------------------------------------
  // Event handlers
  // -----------------------------------------------------------------------
  describe('file event handlers', () => {
    it('file add events queue files via importQueue', async () => {
      await service.startWatching({
        audiobookPath: '/audiobooks',
        ebookPath: null,
      });
      const watcher = getLastWatcherMock();
      const addCallback = getEventCallback(watcher, 'add');

      addCallback('/audiobooks/book/track.mp3');

      expect(mocks.importQueue.queueFile).toHaveBeenCalledWith(
        '/audiobooks/book/track.mp3',
        '/audiobooks',
        'audiobook',
      );
    });

    it('directory add events queue directories via importQueue', async () => {
      await service.startWatching({
        audiobookPath: '/audiobooks',
        ebookPath: null,
      });
      const watcher = getLastWatcherMock();
      const addDirCallback = getEventCallback(watcher, 'addDir');

      addDirCallback('/audiobooks/newbook');

      expect(mocks.importQueue.queueDirectory).toHaveBeenCalledWith(
        '/audiobooks/newbook',
        '/audiobooks',
        'audiobook',
      );
    });

    it('file remove events trigger libraryScanner.handlePathRemoved', async () => {
      await service.startWatching({
        audiobookPath: '/audiobooks',
        ebookPath: null,
      });
      const watcher = getLastWatcherMock();
      const unlinkCallback = getEventCallback(watcher, 'unlink');

      unlinkCallback('/audiobooks/book/track.mp3');

      expect(mocks.libraryScanner.handlePathRemoved).toHaveBeenCalledWith(
        '/audiobooks/book/track.mp3',
        '/audiobooks',
        'audiobook',
      );
    });

    it('directory remove events trigger libraryScanner.handlePathRemoved', async () => {
      await service.startWatching({
        audiobookPath: '/audiobooks',
        ebookPath: null,
      });
      const watcher = getLastWatcherMock();
      const unlinkDirCallback = getEventCallback(watcher, 'unlinkDir');

      unlinkDirCallback('/audiobooks/removedbook');

      expect(mocks.libraryScanner.handlePathRemoved).toHaveBeenCalledWith(
        '/audiobooks/removedbook',
        '/audiobooks',
        'audiobook',
      );
    });
  });

  // -----------------------------------------------------------------------
  // onModuleDestroy
  // -----------------------------------------------------------------------
  describe('onModuleDestroy', () => {
    it('stops all watchers', async () => {
      await service.startWatching({
        audiobookPath: '/audiobooks',
        ebookPath: '/ebooks',
      });

      await service.onModuleDestroy();

      expect(service.isWatching()).toBe(false);
    });
  });
});
