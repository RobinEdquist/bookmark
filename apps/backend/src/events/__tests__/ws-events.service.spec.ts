jest.mock('../events.gateway', () => ({
  EventsGateway: jest.fn(),
}));

import { WsEventsService } from '../ws-events.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockGateway() {
  return {
    emitToRoom: jest.fn(),
    emitToAll: jest.fn(),
    getConnectedCount: jest.fn().mockReturnValue(5),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WsEventsService', () => {
  let gateway: ReturnType<typeof createMockGateway>;
  let service: WsEventsService;

  beforeEach(() => {
    gateway = createMockGateway();
    service = new WsEventsService(gateway as any);
  });

  // -----------------------------------------------------------------------
  // Room routing for entity events
  // -----------------------------------------------------------------------
  describe('entity event routing', () => {
    it('routes audiobook events to the audiobooks room', () => {
      service.audiobookCreated('book-1');

      expect(gateway.emitToRoom).toHaveBeenCalledWith(
        'audiobooks',
        'event',
        expect.objectContaining({
          type: 'audiobook.created',
          entityId: 'book-1',
        }),
      );
    });

    it('routes audiobookUpdated to the audiobooks room', () => {
      service.audiobookUpdated('book-2');

      expect(gateway.emitToRoom).toHaveBeenCalledWith(
        'audiobooks',
        'event',
        expect.objectContaining({
          type: 'audiobook.updated',
          entityId: 'book-2',
        }),
      );
    });

    it('routes audiobookDeleted to the audiobooks room', () => {
      service.audiobookDeleted('book-3');

      expect(gateway.emitToRoom).toHaveBeenCalledWith(
        'audiobooks',
        'event',
        expect.objectContaining({
          type: 'audiobook.deleted',
          entityId: 'book-3',
        }),
      );
    });

    it('routes ebook events to the ebooks room', () => {
      service.ebookCreated('ebook-1');

      expect(gateway.emitToRoom).toHaveBeenCalledWith(
        'ebooks',
        'event',
        expect.objectContaining({
          type: 'ebook.created',
          entityId: 'ebook-1',
        }),
      );
    });

    it('routes ebookUpdated to the ebooks room', () => {
      service.ebookUpdated('ebook-2');

      expect(gateway.emitToRoom).toHaveBeenCalledWith(
        'ebooks',
        'event',
        expect.objectContaining({
          type: 'ebook.updated',
          entityId: 'ebook-2',
        }),
      );
    });

    it('routes ebookDeleted to the ebooks room', () => {
      service.ebookDeleted('ebook-3');

      expect(gateway.emitToRoom).toHaveBeenCalledWith(
        'ebooks',
        'event',
        expect.objectContaining({
          type: 'ebook.deleted',
          entityId: 'ebook-3',
        }),
      );
    });

    it('routes series events to the series room', () => {
      service.seriesCreated('s-1');

      expect(gateway.emitToRoom).toHaveBeenCalledWith(
        'series',
        'event',
        expect.objectContaining({
          type: 'series.created',
          entityId: 's-1',
        }),
      );
    });

    it('routes seriesUpdated to the series room', () => {
      service.seriesUpdated('s-2');

      expect(gateway.emitToRoom).toHaveBeenCalledWith(
        'series',
        'event',
        expect.objectContaining({
          type: 'series.updated',
          entityId: 's-2',
        }),
      );
    });

    it('routes seriesDeleted to the series room', () => {
      service.seriesDeleted('s-3');

      expect(gateway.emitToRoom).toHaveBeenCalledWith(
        'series',
        'event',
        expect.objectContaining({
          type: 'series.deleted',
          entityId: 's-3',
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Library events
  // -----------------------------------------------------------------------
  describe('library event routing', () => {
    it('routes libraryScanStarted to the library room', () => {
      service.libraryScanStarted();

      expect(gateway.emitToRoom).toHaveBeenCalledWith(
        'library',
        'event',
        expect.objectContaining({ type: 'library.scan.started' }),
      );
    });

    it('routes libraryScanCompleted to the library room', () => {
      service.libraryScanCompleted();

      expect(gateway.emitToRoom).toHaveBeenCalledWith(
        'library',
        'event',
        expect.objectContaining({ type: 'library.scan.completed' }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Hardcover events
  // -----------------------------------------------------------------------
  describe('hardcover event routing', () => {
    it('routes hardcoverSyncCompleted to the hardcover room', () => {
      service.hardcoverSyncCompleted('book-99');

      expect(gateway.emitToRoom).toHaveBeenCalledWith(
        'hardcover',
        'event',
        expect.objectContaining({
          type: 'hardcover.sync.completed',
          entityId: 'book-99',
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Settings events
  // -----------------------------------------------------------------------
  describe('settings event routing', () => {
    it('routes settingsUpdated to the settings room', () => {
      service.settingsUpdated();

      expect(gateway.emitToRoom).toHaveBeenCalledWith(
        'settings',
        'event',
        expect.objectContaining({ type: 'settings.updated' }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Timestamp inclusion
  // -----------------------------------------------------------------------
  describe('event timestamp', () => {
    it('includes a numeric timestamp on every emitted event', () => {
      const before = Date.now();
      service.audiobookCreated('book-1');
      const after = Date.now();

      const emittedEvent = gateway.emitToRoom.mock.calls[0][2];
      expect(typeof emittedEvent.timestamp).toBe('number');
      expect(emittedEvent.timestamp).toBeGreaterThanOrEqual(before);
      expect(emittedEvent.timestamp).toBeLessThanOrEqual(after);
    });
  });

  // -----------------------------------------------------------------------
  // Status deduplication
  // -----------------------------------------------------------------------
  describe('importStatusUpdated', () => {
    it('emits when status changes', () => {
      const status = {
        audiobooks: { pendingCount: 2, pendingNames: ['book1'] },
        ebooks: { pendingCount: 0, pendingNames: [] },
      };
      service.importStatusUpdated(status);

      expect(gateway.emitToRoom).toHaveBeenCalledWith(
        'tasks',
        'event',
        expect.objectContaining({
          type: 'tasks.import.status',
          payload: status,
        }),
      );
    });

    it('skips duplicate status payloads', () => {
      const status = {
        audiobooks: { pendingCount: 2, pendingNames: ['book1'] },
        ebooks: { pendingCount: 0, pendingNames: [] },
      };
      service.importStatusUpdated(status);
      service.importStatusUpdated(status);

      expect(gateway.emitToRoom).toHaveBeenCalledTimes(1);
    });

    it('emits again when status payload changes', () => {
      service.importStatusUpdated({
        audiobooks: { pendingCount: 2, pendingNames: ['book1'] },
        ebooks: { pendingCount: 0, pendingNames: [] },
      });
      service.importStatusUpdated({
        audiobooks: { pendingCount: 1, pendingNames: [] },
        ebooks: { pendingCount: 0, pendingNames: [] },
      });

      expect(gateway.emitToRoom).toHaveBeenCalledTimes(2);
    });
  });

  describe('hardcoverSyncStatusUpdated', () => {
    it('emits when status changes', () => {
      service.hardcoverSyncStatusUpdated({ pendingCount: 5, failedCount: 0 });

      expect(gateway.emitToRoom).toHaveBeenCalledWith(
        'tasks',
        'event',
        expect.objectContaining({
          type: 'tasks.hardcover.status',
          payload: { pendingCount: 5, failedCount: 0 },
        }),
      );
    });

    it('skips duplicate status payloads', () => {
      const status = { pendingCount: 5, failedCount: 0 };
      service.hardcoverSyncStatusUpdated(status);
      service.hardcoverSyncStatusUpdated(status);

      expect(gateway.emitToRoom).toHaveBeenCalledTimes(1);
    });
  });

  describe('scanStatusUpdated', () => {
    it('emits when status changes', () => {
      service.scanStatusUpdated({ isScanning: true });

      expect(gateway.emitToRoom).toHaveBeenCalledWith(
        'tasks',
        'event',
        expect.objectContaining({
          type: 'tasks.scan.status',
          payload: { isScanning: true },
        }),
      );
    });

    it('skips duplicate status payloads', () => {
      const status = { isScanning: true, total: 10 } as any;
      service.scanStatusUpdated(status);
      service.scanStatusUpdated(status);

      expect(gateway.emitToRoom).toHaveBeenCalledTimes(1);
    });
  });

  describe('rescanStatusUpdated', () => {
    it('emits when status changes', () => {
      service.rescanStatusUpdated({ isRescanning: true });

      expect(gateway.emitToRoom).toHaveBeenCalledWith(
        'tasks',
        'event',
        expect.objectContaining({
          type: 'tasks.rescan.status',
          payload: { isRescanning: true },
        }),
      );
    });

    it('skips duplicate status payloads', () => {
      const status = { isRescanning: true } as any;
      service.rescanStatusUpdated(status);
      service.rescanStatusUpdated(status);

      expect(gateway.emitToRoom).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // getConnectedCount
  // -----------------------------------------------------------------------
  describe('getConnectedCount', () => {
    it('delegates to gateway.getConnectedCount', () => {
      const count = service.getConnectedCount();

      expect(count).toBe(5);
      expect(gateway.getConnectedCount).toHaveBeenCalled();
    });
  });
});
