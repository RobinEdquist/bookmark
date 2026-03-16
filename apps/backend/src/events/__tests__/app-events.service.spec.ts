import { AppEventsService, type SSEEvent } from '../app-events.service';

describe('AppEventsService', () => {
  let service: AppEventsService;

  beforeEach(() => {
    service = new AppEventsService();
  });

  // -------------------------------------------------------------------------
  // emit / subscribe
  // -------------------------------------------------------------------------
  describe('emit and subscribe', () => {
    it('adds a timestamp and delivers the event to subscribers', () => {
      const listener = jest.fn();
      service.subscribe(listener);

      const before = Date.now();
      service.emit({ type: 'test.event', entityId: 'abc' });
      const after = Date.now();

      expect(listener).toHaveBeenCalledTimes(1);
      const event: SSEEvent = listener.mock.calls[0][0];
      expect(event.type).toBe('test.event');
      expect(event.entityId).toBe('abc');
      expect(event.timestamp).toBeGreaterThanOrEqual(before);
      expect(event.timestamp).toBeLessThanOrEqual(after);
    });

    it('delivers the same event to multiple subscribers', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      service.subscribe(listener1);
      service.subscribe(listener2);

      service.emit({ type: 'multi.event' });

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener1.mock.calls[0][0].type).toBe('multi.event');
      expect(listener2.mock.calls[0][0].type).toBe('multi.event');
    });

    it('returns an unsubscribe function that stops delivery', () => {
      const listener = jest.fn();
      const unsubscribe = service.subscribe(listener);

      service.emit({ type: 'before.unsub' });
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();

      service.emit({ type: 'after.unsub' });
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Audiobook events
  // -------------------------------------------------------------------------
  describe('audiobook events', () => {
    it('audiobookCreated emits correct type and entityId', () => {
      const listener = jest.fn();
      service.subscribe(listener);

      service.audiobookCreated('book-1');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'audiobook.created',
          entityId: 'book-1',
        }),
      );
    });

    it('audiobookUpdated emits correct type and entityId', () => {
      const listener = jest.fn();
      service.subscribe(listener);

      service.audiobookUpdated('book-2');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'audiobook.updated',
          entityId: 'book-2',
        }),
      );
    });

    it('audiobookDeleted emits correct type and entityId', () => {
      const listener = jest.fn();
      service.subscribe(listener);

      service.audiobookDeleted('book-3');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'audiobook.deleted',
          entityId: 'book-3',
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Series events
  // -------------------------------------------------------------------------
  describe('series events', () => {
    it('seriesCreated emits correct type and entityId', () => {
      const listener = jest.fn();
      service.subscribe(listener);

      service.seriesCreated('series-1');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'series.created',
          entityId: 'series-1',
        }),
      );
    });

    it('seriesUpdated emits correct type and entityId', () => {
      const listener = jest.fn();
      service.subscribe(listener);

      service.seriesUpdated('series-2');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'series.updated',
          entityId: 'series-2',
        }),
      );
    });

    it('seriesDeleted emits correct type and entityId', () => {
      const listener = jest.fn();
      service.subscribe(listener);

      service.seriesDeleted('series-3');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'series.deleted',
          entityId: 'series-3',
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Library scan events
  // -------------------------------------------------------------------------
  describe('library scan events', () => {
    it('libraryScanStarted emits correct type without entityId', () => {
      const listener = jest.fn();
      service.subscribe(listener);

      service.libraryScanStarted();

      const event: SSEEvent = listener.mock.calls[0][0];
      expect(event.type).toBe('library.scan.started');
      expect(event.entityId).toBeUndefined();
    });

    it('libraryScanCompleted emits correct type without entityId', () => {
      const listener = jest.fn();
      service.subscribe(listener);

      service.libraryScanCompleted();

      const event: SSEEvent = listener.mock.calls[0][0];
      expect(event.type).toBe('library.scan.completed');
      expect(event.entityId).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Settings events
  // -------------------------------------------------------------------------
  describe('settings events', () => {
    it('settingsUpdated emits correct type without entityId', () => {
      const listener = jest.fn();
      service.subscribe(listener);

      service.settingsUpdated();

      const event: SSEEvent = listener.mock.calls[0][0];
      expect(event.type).toBe('settings.updated');
      expect(event.entityId).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Ebook events
  // -------------------------------------------------------------------------
  describe('ebook events', () => {
    it('ebookCreated emits correct type and entityId', () => {
      const listener = jest.fn();
      service.subscribe(listener);

      service.ebookCreated('ebook-1');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ebook.created',
          entityId: 'ebook-1',
        }),
      );
    });

    it('ebookUpdated emits correct type and entityId', () => {
      const listener = jest.fn();
      service.subscribe(listener);

      service.ebookUpdated('ebook-2');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ebook.updated',
          entityId: 'ebook-2',
        }),
      );
    });

    it('ebookDeleted emits correct type and entityId', () => {
      const listener = jest.fn();
      service.subscribe(listener);

      service.ebookDeleted('ebook-3');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ebook.deleted',
          entityId: 'ebook-3',
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Hardcover events
  // -------------------------------------------------------------------------
  describe('hardcover events', () => {
    it('hardcoverSyncCompleted emits correct type and entityId', () => {
      const listener = jest.fn();
      service.subscribe(listener);

      service.hardcoverSyncCompleted('book-99');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'hardcover.sync.completed',
          entityId: 'book-99',
        }),
      );
    });
  });
});
