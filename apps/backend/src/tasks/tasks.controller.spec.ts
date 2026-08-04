jest.mock('../library-watcher/import-queue.service', () => ({
  ImportQueueService: class ImportQueueService {},
}));

jest.mock('../hardcover/hardcover.service', () => ({
  HardcoverService: class HardcoverService {},
}));

jest.mock('../library-watcher/library-scanner.service', () => ({
  LibraryScannerService: class LibraryScannerService {},
}));

jest.mock('../tts/tts.service', () => ({
  TtsService: class TtsService {},
}));

jest.mock('../gr-finder/goodreads-link-queue.service', () => ({
  GoodreadsLinkQueueService: class GoodreadsLinkQueueService {},
}));

import { TasksController } from './tasks.controller';

function createController(scanProgress?: {
  phase: string;
  total: number;
  processed: number;
  currentFile?: string;
}) {
  const importQueueService = {
    getAudiobookPendingCount: jest.fn().mockReturnValue(1),
    getAudiobookPendingNames: jest.fn().mockReturnValue(['audio']),
    getEbookPendingCount: jest.fn().mockReturnValue(2),
    getEbookPendingNames: jest.fn().mockReturnValue(['ebook']),
    getComicPendingCount: jest.fn().mockReturnValue(3),
    getComicPendingNames: jest.fn().mockReturnValue(['comic']),
  };
  const hardcoverService = {
    getPendingQueueCount: jest.fn().mockResolvedValue(4),
    getFailedQueueItems: jest.fn().mockResolvedValue([{ id: 'failed-1' }]),
  };
  const libraryScannerService = {
    getProgress: jest.fn().mockReturnValue(scanProgress),
    isScanning: jest.fn().mockReturnValue(!!scanProgress),
  };
  const ttsService = {
    getQueueStatus: jest.fn().mockResolvedValue({ pendingCount: 5 }),
  };
  const goodreadsLinkQueue = {
    getStatus: jest.fn().mockReturnValue({
      active: null,
      pendingCount: 6,
      failedCount: 0,
      failures: [],
    }),
  };

  return new TasksController(
    importQueueService as any,
    hardcoverService as any,
    libraryScannerService as any,
    ttsService as any,
    goodreadsLinkQueue as any,
  );
}

describe('TasksController', () => {
  it('returns queue and scan status with percentage', async () => {
    const controller = createController({
      phase: 'scanning',
      total: 4,
      processed: 1,
      currentFile: 'book.mp3',
    });

    await expect(controller.getTasksStatus()).resolves.toEqual({
      import: {
        audiobooks: { pendingCount: 1, pendingNames: ['audio'] },
        ebooks: { pendingCount: 2, pendingNames: ['ebook'] },
        comics: { pendingCount: 3, pendingNames: ['comic'] },
      },
      hardcoverSync: { pendingCount: 4, failedCount: 1 },
      goodreadsLink: {
        active: null,
        pendingCount: 6,
        failedCount: 0,
        failures: [],
      },
      tts: { pendingCount: 5 },
      scan: {
        isScanning: true,
        phase: 'scanning',
        total: 4,
        processed: 1,
        percentage: 25,
        currentFile: 'book.mp3',
      },
    });
  });

  it('returns non-scanning status when no scan is active', async () => {
    const controller = createController();

    const result = await controller.getTasksStatus();

    expect(result.scan).toEqual({ isScanning: false });
  });

  it('handles zero-total scan progress', async () => {
    const controller = createController({
      phase: 'starting',
      total: 0,
      processed: 0,
    });

    const result = await controller.getTasksStatus();

    expect(result.scan).toMatchObject({
      isScanning: true,
      percentage: 0,
    });
  });
});
