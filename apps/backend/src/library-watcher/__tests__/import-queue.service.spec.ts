jest.mock('fs/promises', () => ({
  stat: jest.fn(),
}));
jest.mock('@thallesp/nestjs-better-auth', () => ({
  AuthService: jest.fn(),
}));

import * as fs from 'fs/promises';
import { ImportQueueService } from '../import-queue.service';

const mockedStat = jest.mocked(fs.stat);

function createStableStat(): any {
  return { size: 1024, mtimeMs: 1000000 };
}

describe('ImportQueueService', () => {
  let service: ImportQueueService;
  let mockMediaDetector: {
    detectAudiobook: jest.Mock;
    detectEbook: jest.Mock;
  };
  let mockMediaImporter: {
    importAudiobook: jest.Mock;
    importEbook: jest.Mock;
  };
  let mockWsEvents: {
    importStatusUpdated: jest.Mock;
  };

  beforeEach(() => {
    jest.useFakeTimers();

    mockMediaDetector = {
      detectAudiobook: jest.fn(),
      detectEbook: jest.fn(),
    };
    mockMediaImporter = {
      importAudiobook: jest.fn().mockResolvedValue(undefined),
      importEbook: jest.fn().mockResolvedValue(undefined),
    };
    mockWsEvents = {
      importStatusUpdated: jest.fn(),
    };

    service = new ImportQueueService(
      mockMediaDetector as any,
      mockMediaImporter as any,
      mockWsEvents as any,
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  // ===== queueFile =====

  describe('queueFile', () => {
    it('should ignore non-audio files for audiobook library', () => {
      service.queueFile('/lib/readme.txt', '/lib', 'audiobook');
      expect(service.getPendingCount()).toBe(0);
    });

    it('should ignore non-epub files for ebook library', () => {
      service.queueFile('/lib/book.pdf', '/lib', 'ebook');
      expect(service.getPendingCount()).toBe(0);
    });

    it('should queue valid audio file', () => {
      service.queueFile('/lib/BookDir/track.mp3', '/lib', 'audiobook');
      expect(service.getPendingCount()).toBe(1);
    });

    it('should queue valid epub file', () => {
      service.queueFile('/lib/book.epub', '/lib', 'ebook');
      expect(service.getPendingCount()).toBe(1);
    });

    it('should group files by parent directory for multi-file audiobooks', () => {
      service.queueFile('/lib/MyBook/part1.mp3', '/lib', 'audiobook');
      service.queueFile('/lib/MyBook/part2.mp3', '/lib', 'audiobook');
      // Both grouped under /lib/MyBook
      expect(service.getPendingCount()).toBe(1);
    });

    it('should use file path as root for root-level audio files', () => {
      service.queueFile('/lib/standalone.m4b', '/lib', 'audiobook');
      expect(service.getPendingNames()).toEqual(['standalone.m4b']);
    });

    it('should update existing pending import with new file and reset lastActivity', () => {
      service.queueFile('/lib/MyBook/part1.mp3', '/lib', 'audiobook');
      const countBefore = service.getPendingCount();

      // Advance a bit, then add another file to same group
      jest.advanceTimersByTime(500);
      service.queueFile('/lib/MyBook/part2.mp3', '/lib', 'audiobook');

      // Still just one pending import
      expect(service.getPendingCount()).toBe(countBefore);
    });
  });

  // ===== queueDirectory =====

  describe('queueDirectory', () => {
    it('should add directory to pending imports', () => {
      service.queueDirectory('/lib/NewBook', '/lib', 'audiobook');
      expect(service.getPendingCount()).toBe(1);
      expect(service.getPendingNames()).toEqual(['NewBook']);
    });
  });

  // ===== Status queries =====

  describe('status queries', () => {
    it('should return correct pending count', () => {
      service.queueFile('/lib/a.m4b', '/lib', 'audiobook');
      service.queueFile('/lib/b.epub', '/lib', 'ebook');
      expect(service.getPendingCount()).toBe(2);
    });

    it('should return correct audiobook pending count', () => {
      service.queueFile('/lib/a.m4b', '/lib', 'audiobook');
      service.queueFile('/lib/b.epub', '/lib', 'ebook');
      expect(service.getAudiobookPendingCount()).toBe(1);
    });

    it('should return correct ebook pending count', () => {
      service.queueFile('/lib/a.m4b', '/lib', 'audiobook');
      service.queueFile('/lib/b.epub', '/lib', 'ebook');
      expect(service.getEbookPendingCount()).toBe(1);
    });

    it('should return basenames from getPendingNames', () => {
      service.queueFile('/lib/BookDir/track.mp3', '/lib', 'audiobook');
      service.queueFile('/lib/novel.epub', '/lib', 'ebook');
      const names = service.getPendingNames();
      expect(names).toContain('BookDir');
      expect(names).toContain('novel.epub');
    });
  });

  // ===== Processing =====

  describe('processing', () => {
    it('should process audiobook import after stability threshold', async () => {
      const unit = {
        type: 'single-file' as const,
        path: '/lib/book.m4b',
        files: ['/lib/book.m4b'],
      };
      mockMediaDetector.detectAudiobook.mockResolvedValue(unit);
      // Mock stable file checks
      const stableStat = createStableStat();
      mockedStat.mockResolvedValue(stableStat);

      service.queueFile('/lib/book.m4b', '/lib', 'audiobook');
      expect(service.getPendingCount()).toBe(1);

      // Advance past stability threshold + interval
      await jest.advanceTimersByTimeAsync(4000);

      expect(mockMediaDetector.detectAudiobook).toHaveBeenCalledWith(
        '/lib/book.m4b',
      );
      expect(mockMediaImporter.importAudiobook).toHaveBeenCalledWith(
        unit,
        '/lib',
      );
    });

    it('should call detectEbook then importEbook for ebook type', async () => {
      const unit = { path: '/lib/book.epub', fileName: 'book.epub' };
      mockMediaDetector.detectEbook.mockResolvedValue(unit);
      const stableStat = createStableStat();
      mockedStat.mockResolvedValue(stableStat);

      service.queueFile('/lib/book.epub', '/lib', 'ebook');

      await jest.advanceTimersByTimeAsync(4000);

      expect(mockMediaDetector.detectEbook).toHaveBeenCalledWith(
        '/lib/book.epub',
      );
      expect(mockMediaImporter.importEbook).toHaveBeenCalledWith(unit, '/lib');
    });

    it('should remove from pending after processing', async () => {
      mockMediaDetector.detectAudiobook.mockResolvedValue({
        type: 'single-file',
        path: '/lib/book.m4b',
        files: ['/lib/book.m4b'],
      });
      mockedStat.mockResolvedValue(createStableStat());

      service.queueFile('/lib/book.m4b', '/lib', 'audiobook');
      expect(service.getPendingCount()).toBe(1);

      await jest.advanceTimersByTimeAsync(4000);

      expect(service.getPendingCount()).toBe(0);
    });

    it('should not process import before stability threshold', async () => {
      service.queueFile('/lib/book.m4b', '/lib', 'audiobook');

      // Advance only 2 seconds (below the 3s threshold)
      await jest.advanceTimersByTimeAsync(2000);

      expect(mockMediaDetector.detectAudiobook).not.toHaveBeenCalled();
      expect(service.getPendingCount()).toBe(1);
    });
  });

  // ===== Cleanup =====

  describe('onModuleDestroy', () => {
    it('should clear the processing interval', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      service.onModuleDestroy();
      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });
  });

  // ===== WebSocket events =====

  describe('WebSocket events', () => {
    it('should emit import status when items are queued', () => {
      service.queueFile('/lib/book.m4b', '/lib', 'audiobook');
      expect(mockWsEvents.importStatusUpdated).toHaveBeenCalled();
    });
  });
});
