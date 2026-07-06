jest.mock('./library-watcher.service', () => ({
  LibraryWatcherService: class LibraryWatcherService {},
}));

import { LibraryWatcherController } from './library-watcher.controller';

function createController() {
  const service = {
    getStatus: jest.fn().mockReturnValue({ running: true }),
    manualScan: jest.fn().mockResolvedValue({ imported: 1 }),
    manualEbookScan: jest.fn().mockResolvedValue({ imported: 2 }),
    manualComicScan: jest.fn().mockResolvedValue({ imported: 3 }),
    rescanAllAudiobooks: jest.fn().mockResolvedValue({ queued: 4 }),
    rescanAllComics: jest.fn().mockResolvedValue({ queued: 5 }),
    getRescanStatus: jest.fn().mockReturnValue({ running: false }),
  };

  return {
    controller: new LibraryWatcherController(service as any),
    service,
  };
}

describe('LibraryWatcherController', () => {
  it('returns watcher status', () => {
    const { controller, service } = createController();

    expect(controller.getStatus()).toEqual({ running: true });
    expect(service.getStatus).toHaveBeenCalledWith();
  });

  it('wraps manual scan results in success responses', async () => {
    const { controller, service } = createController();

    await expect(controller.triggerScan()).resolves.toEqual({
      success: true,
      result: { imported: 1 },
    });
    await expect(controller.triggerEbookScan()).resolves.toEqual({
      success: true,
      result: { imported: 2 },
    });
    await expect(controller.triggerComicScan()).resolves.toEqual({
      success: true,
      result: { imported: 3 },
    });

    expect(service.manualScan).toHaveBeenCalledWith();
    expect(service.manualEbookScan).toHaveBeenCalledWith();
    expect(service.manualComicScan).toHaveBeenCalledWith();
  });

  it('wraps rescan results in success responses', async () => {
    const { controller, service } = createController();

    await expect(controller.triggerRescan()).resolves.toEqual({
      success: true,
      result: { queued: 4 },
    });
    await expect(controller.triggerComicRescan()).resolves.toEqual({
      success: true,
      result: { queued: 5 },
    });

    expect(service.rescanAllAudiobooks).toHaveBeenCalledWith();
    expect(service.rescanAllComics).toHaveBeenCalledWith();
  });

  it('returns rescan status', () => {
    const { controller, service } = createController();

    expect(controller.getRescanStatus()).toEqual({ running: false });
    expect(service.getRescanStatus).toHaveBeenCalledWith();
  });
});
