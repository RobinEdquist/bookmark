import { NotFoundException, BadRequestException } from '@nestjs/common';
import { GraphQLClient } from 'graphql-request';
import { createMockDb, createChainMock, type MockDb } from '@test-utils';
import {
  HardcoverService,
  type HardcoverBookDocument,
} from '../hardcover.service';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock('graphql-request', () => ({
  GraphQLClient: jest.fn().mockImplementation(() => ({
    request: jest.fn(),
  })),
}));

jest.mock('../../events/events.gateway', () => ({
  EventsGateway: jest.fn(),
}));
jest.mock('../../events/ws-events.service', () => ({
  WsEventsService: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockGraphQLRequest = jest.fn();
(GraphQLClient as jest.Mock).mockImplementation(() => ({
  request: mockGraphQLRequest,
}));

function createMockAppEvents() {
  return {
    hardcoverSyncCompleted: jest.fn(),
    audiobookUpdated: jest.fn(),
    ebookUpdated: jest.fn(),
  };
}

function createMockWsEvents() {
  return {
    hardcoverSyncStatusUpdated: jest.fn(),
  };
}

function buildHardcoverBookDocument(
  overrides: Partial<HardcoverBookDocument> = {},
): HardcoverBookDocument {
  return {
    activities_count: 0,
    alternative_titles: [],
    author_names: ['Brandon Sanderson'],
    compilation: false,
    content_warnings: [],
    contribution_types: [],
    contributions: [],
    description: 'A test book',
    featured_series: {
      name: 'Cosmere',
      position: 1,
      series: {
        books_count: 10,
        id: 1,
        name: 'Cosmere',
        primary_books_count: 5,
        slug: 'cosmere',
      },
    },
    genres: ['Fantasy'],
    has_audiobook: true,
    has_ebook: true,
    id: 'hc-123',
    image: { url: 'https://example.com/cover.jpg' },
    isbns: ['978-0-123456-78-9'],
    lists_count: 0,
    moods: ['Adventurous'],
    prompts_count: 0,
    rating: 4.5,
    ratings_count: 100,
    reviews_count: 50,
    series_names: ['Cosmere'],
    slug: 'the-way-of-kings',
    tags: ['epic'],
    title: 'The Way of Kings',
    users_count: 1000,
    users_read_count: 800,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HardcoverService', () => {
  let db: MockDb;
  let mockAppEvents: ReturnType<typeof createMockAppEvents>;
  let mockWsEvents: ReturnType<typeof createMockWsEvents>;
  let service: HardcoverService;

  beforeEach(() => {
    jest.clearAllMocks();
    db = createMockDb();
    mockAppEvents = createMockAppEvents();
    mockWsEvents = createMockWsEvents();
    service = new HardcoverService(
      db as any,
      mockAppEvents as any,
      mockWsEvents as any,
    );
  });

  // =========================================================================
  // API Key Management
  // =========================================================================
  describe('getApiKey', () => {
    it('should return the API key from settings', async () => {
      const chain = createChainMock(['from', 'where', 'limit']);
      chain.limit.mockResolvedValueOnce([{ hardcoverApiKey: 'test-key-123' }]);
      db.select.mockReturnValueOnce(chain);

      const result = await service.getApiKey();
      expect(result).toBe('test-key-123');
    });

    it('should return null when no key is set', async () => {
      const chain = createChainMock(['from', 'where', 'limit']);
      chain.limit.mockResolvedValueOnce([{ hardcoverApiKey: null }]);
      db.select.mockReturnValueOnce(chain);

      const result = await service.getApiKey();
      expect(result).toBeNull();
    });
  });

  describe('setApiKey', () => {
    it('should update the settings with the new API key', async () => {
      const updateChain = createChainMock(['set', 'where']);
      updateChain.where.mockResolvedValueOnce(undefined);
      db.update.mockReturnValueOnce(updateChain);

      await service.setApiKey('new-key');

      expect(db.update).toHaveBeenCalled();
      expect(updateChain.set).toHaveBeenCalledWith({
        hardcoverApiKey: 'new-key',
      });
    });
  });

  describe('validateApiKey', () => {
    it('should return valid: true on successful validation', async () => {
      mockGraphQLRequest.mockResolvedValueOnce({
        me: { id: 1, username: 'user' },
      });

      const result = await service.validateApiKey('valid-key');
      expect(result).toEqual({ valid: true });
    });

    it('should return error for 401 response', async () => {
      mockGraphQLRequest.mockRejectedValueOnce(
        new Error('Response status: 401'),
      );

      const result = await service.validateApiKey('bad-key');
      expect(result).toEqual({
        valid: false,
        error: 'Invalid or expired API key',
      });
    });

    it('should return error for 429 rate limit response', async () => {
      mockGraphQLRequest.mockRejectedValueOnce(
        new Error('Response status: 429'),
      );

      const result = await service.validateApiKey('rate-limited-key');
      expect(result).toEqual({
        valid: false,
        error: 'Rate limit exceeded, try again in a minute',
      });
    });

    it('should return the error message for other Error instances', async () => {
      mockGraphQLRequest.mockRejectedValueOnce(
        new Error('Network connection failed'),
      );

      const result = await service.validateApiKey('key');
      expect(result).toEqual({
        valid: false,
        error: 'Network connection failed',
      });
    });

    it('should handle non-Error exceptions', async () => {
      mockGraphQLRequest.mockRejectedValueOnce('some string error');

      const result = await service.validateApiKey('key');
      expect(result).toEqual({
        valid: false,
        error: 'Failed to connect to Hardcover',
      });
    });
  });

  describe('getAutoSyncOnImport', () => {
    it('should return the auto-sync setting value', async () => {
      const chain = createChainMock(['from', 'where', 'limit']);
      chain.limit.mockResolvedValueOnce([{ autoSyncOnImport: true }]);
      db.select.mockReturnValueOnce(chain);

      const result = await service.getAutoSyncOnImport();
      expect(result).toBe(true);
    });

    it('should return false when setting is not found', async () => {
      const chain = createChainMock(['from', 'where', 'limit']);
      chain.limit.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(chain);

      const result = await service.getAutoSyncOnImport();
      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // Search
  // =========================================================================
  describe('searchBooks', () => {
    it('should return error when no API key is configured', async () => {
      // getApiKey returns null
      const settingsChain = createChainMock(['from', 'where', 'limit']);
      settingsChain.limit.mockResolvedValueOnce([{ hardcoverApiKey: null }]);
      db.select.mockReturnValueOnce(settingsChain);

      const result = await service.searchBooks('test query');
      expect(result).toEqual({
        success: false,
        error: 'Hardcover API key not configured',
      });
    });

    it('should return success with data on valid search', async () => {
      // getApiKey returns key
      const settingsChain = createChainMock(['from', 'where', 'limit']);
      settingsChain.limit.mockResolvedValueOnce([
        { hardcoverApiKey: 'test-key' },
      ]);
      db.select.mockReturnValueOnce(settingsChain);

      const mockData = {
        search: {
          results: {
            hits: [{ document: { title: 'Test Book' } }],
            found: 1,
          },
        },
      };
      mockGraphQLRequest.mockResolvedValueOnce(mockData);

      const result = await service.searchBooks('test query');
      expect(result).toEqual({ success: true, data: mockData });
    });

    it('should handle 401 error from GraphQL client', async () => {
      const settingsChain = createChainMock(['from', 'where', 'limit']);
      settingsChain.limit.mockResolvedValueOnce([
        { hardcoverApiKey: 'expired-key' },
      ]);
      db.select.mockReturnValueOnce(settingsChain);

      mockGraphQLRequest.mockRejectedValueOnce(
        new Error('Response status: 401'),
      );

      const result = await service.searchBooks('test');
      expect(result).toEqual({
        success: false,
        error: 'Invalid or expired API key',
      });
    });

    it('should handle 429 rate limit error', async () => {
      const settingsChain = createChainMock(['from', 'where', 'limit']);
      settingsChain.limit.mockResolvedValueOnce([
        { hardcoverApiKey: 'test-key' },
      ]);
      db.select.mockReturnValueOnce(settingsChain);

      mockGraphQLRequest.mockRejectedValueOnce(
        new Error('Response status: 429'),
      );

      const result = await service.searchBooks('test');
      expect(result).toEqual({
        success: false,
        error: 'Rate limit exceeded, try again in a minute',
      });
    });
  });

  describe('searchByAudiobookId', () => {
    it('should build query from title and authors', async () => {
      // 1st select: audiobook title
      const audiobookChain = createChainMock(['from', 'where', 'limit']);
      audiobookChain.limit.mockResolvedValueOnce([
        { title: 'The Way of Kings', subtitle: null },
      ]);
      db.select.mockReturnValueOnce(audiobookChain);

      // 2nd select: authors via join
      const authorsChain = createChainMock([
        'from',
        'innerJoin',
        'where',
        'orderBy',
      ]);
      authorsChain.orderBy.mockResolvedValueOnce([
        { name: 'Brandon Sanderson' },
      ]);
      db.select.mockReturnValueOnce(authorsChain);

      // 3rd select: getApiKey inside searchBooks
      const settingsChain = createChainMock(['from', 'where', 'limit']);
      settingsChain.limit.mockResolvedValueOnce([
        { hardcoverApiKey: 'test-key' },
      ]);
      db.select.mockReturnValueOnce(settingsChain);

      mockGraphQLRequest.mockResolvedValueOnce({
        search: { results: { hits: [], found: 0 } },
      });

      const result = await service.searchByAudiobookId('audiobook-1');

      expect(result.query).toBe('The Way of Kings Brandon Sanderson');
      expect(result.success).toBe(true);
    });

    it('should include subtitle in search query when present', async () => {
      const audiobookChain = createChainMock(['from', 'where', 'limit']);
      audiobookChain.limit.mockResolvedValueOnce([
        { title: 'The Stormlight Archive', subtitle: 'The Way of Kings' },
      ]);
      db.select.mockReturnValueOnce(audiobookChain);

      const authorsChain = createChainMock([
        'from',
        'innerJoin',
        'where',
        'orderBy',
      ]);
      authorsChain.orderBy.mockResolvedValueOnce([
        { name: 'Brandon Sanderson' },
      ]);
      db.select.mockReturnValueOnce(authorsChain);

      const settingsChain = createChainMock(['from', 'where', 'limit']);
      settingsChain.limit.mockResolvedValueOnce([
        { hardcoverApiKey: 'test-key' },
      ]);
      db.select.mockReturnValueOnce(settingsChain);

      mockGraphQLRequest.mockResolvedValueOnce({
        search: { results: { hits: [], found: 0 } },
      });

      const result = await service.searchByAudiobookId('audiobook-1');
      expect(result.query).toBe(
        'The Stormlight Archive: The Way of Kings Brandon Sanderson',
      );
    });

    it('should throw NotFoundException for missing audiobook', async () => {
      const audiobookChain = createChainMock(['from', 'where', 'limit']);
      audiobookChain.limit.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(audiobookChain);

      await expect(service.searchByAudiobookId('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('searchByMediaIdPaginated', () => {
    it('should use customQuery when provided, skipping DB lookups', async () => {
      // Only getApiKey select is needed (inside searchBooks)
      const settingsChain = createChainMock(['from', 'where', 'limit']);
      settingsChain.limit.mockResolvedValueOnce([
        { hardcoverApiKey: 'test-key' },
      ]);
      db.select.mockReturnValueOnce(settingsChain);

      mockGraphQLRequest.mockResolvedValueOnce({
        search: { results: { hits: [], found: 0 } },
      });

      const result = await service.searchByMediaIdPaginated(
        'audiobook',
        'ab-1',
        2,
        5,
        'custom search term',
      );

      expect(result.query).toBe('custom search term');
      expect(result.success).toBe(true);
      // Only 1 select call (for getApiKey), not 2-3 for media lookup
      expect(db.select).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // Link / Unlink
  // =========================================================================
  describe('linkMediaToHardcover', () => {
    const hardcoverBook = buildHardcoverBookDocument();

    it('should link an audiobook: verify exists, create book, create link, emit event', async () => {
      // 1st select: verify audiobook exists
      const verifyChain = createChainMock(['from', 'where', 'limit']);
      verifyChain.limit.mockResolvedValueOnce([{ id: 'ab-1' }]);
      db.select.mockReturnValueOnce(verifyChain);

      // 2nd select: findOrCreateHardcoverBook - check existing
      const existingChain = createChainMock(['from', 'where', 'limit']);
      existingChain.limit.mockResolvedValueOnce([]); // not found
      db.select.mockReturnValueOnce(existingChain);

      // insert: create new hardcover book
      const insertChain = createChainMock(['values', 'returning']);
      const mockHcBook = { id: 'hcb-1', hardcoverId: 'hc-123' };
      insertChain.returning.mockResolvedValueOnce([mockHcBook]);
      db.insert.mockReturnValueOnce(insertChain);

      // delete: remove old link
      const deleteChain = createChainMock(['where']);
      deleteChain.where.mockResolvedValueOnce(undefined);
      db.delete.mockReturnValueOnce(deleteChain);

      // insert: create new link
      const linkInsertChain = createChainMock(['values']);
      linkInsertChain.values.mockResolvedValueOnce(undefined);
      db.insert.mockReturnValueOnce(linkInsertChain);

      const result = await service.linkMediaToHardcover(
        'audiobook',
        'ab-1',
        hardcoverBook,
      );

      expect(result).toEqual(mockHcBook);
      expect(mockAppEvents.hardcoverSyncCompleted).toHaveBeenCalledWith('ab-1');
    });

    it('should link an ebook and emit ebookUpdated event', async () => {
      // 1st select: verify ebook exists
      const verifyChain = createChainMock(['from', 'where', 'limit']);
      verifyChain.limit.mockResolvedValueOnce([{ id: 'eb-1' }]);
      db.select.mockReturnValueOnce(verifyChain);

      // 2nd select: findOrCreateHardcoverBook - check existing
      const existingChain = createChainMock(['from', 'where', 'limit']);
      existingChain.limit.mockResolvedValueOnce([]); // not found
      db.select.mockReturnValueOnce(existingChain);

      // insert: create new hardcover book
      const insertChain = createChainMock(['values', 'returning']);
      const mockHcBook = { id: 'hcb-1', hardcoverId: 'hc-123' };
      insertChain.returning.mockResolvedValueOnce([mockHcBook]);
      db.insert.mockReturnValueOnce(insertChain);

      // delete: remove old link
      const deleteChain = createChainMock(['where']);
      deleteChain.where.mockResolvedValueOnce(undefined);
      db.delete.mockReturnValueOnce(deleteChain);

      // insert: create new link
      const linkInsertChain = createChainMock(['values']);
      linkInsertChain.values.mockResolvedValueOnce(undefined);
      db.insert.mockReturnValueOnce(linkInsertChain);

      const result = await service.linkMediaToHardcover(
        'ebook',
        'eb-1',
        hardcoverBook,
      );

      expect(result).toEqual(mockHcBook);
      expect(mockAppEvents.ebookUpdated).toHaveBeenCalledWith('eb-1');
      expect(mockAppEvents.hardcoverSyncCompleted).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException for missing audiobook', async () => {
      const verifyChain = createChainMock(['from', 'where', 'limit']);
      verifyChain.limit.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(verifyChain);

      await expect(
        service.linkMediaToHardcover('audiobook', 'missing', hardcoverBook),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for missing ebook', async () => {
      const verifyChain = createChainMock(['from', 'where', 'limit']);
      verifyChain.limit.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(verifyChain);

      await expect(
        service.linkMediaToHardcover('ebook', 'missing', hardcoverBook),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getHardcoverLink', () => {
    it('should return linked hardcover book for an audiobook', async () => {
      const mockHcBook = {
        id: 'hcb-1',
        hardcoverId: 'hc-123',
        title: 'Test',
      };
      const chain = createChainMock(['from', 'innerJoin', 'where', 'limit']);
      chain.limit.mockResolvedValueOnce([{ hardcoverBook: mockHcBook }]);
      db.select.mockReturnValueOnce(chain);

      const result = await service.getHardcoverLink('audiobook', 'ab-1');
      expect(result).toEqual(mockHcBook);
    });

    it('should return null when no link exists', async () => {
      const chain = createChainMock(['from', 'innerJoin', 'where', 'limit']);
      chain.limit.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(chain);

      const result = await service.getHardcoverLink('audiobook', 'ab-1');
      expect(result).toBeNull();
    });
  });

  describe('unlinkMedia', () => {
    it('should delete audiobook link and emit audiobookUpdated', async () => {
      const deleteChain = createChainMock(['where']);
      deleteChain.where.mockResolvedValueOnce(undefined);
      db.delete.mockReturnValueOnce(deleteChain);

      await service.unlinkMedia('audiobook', 'ab-1');

      expect(db.delete).toHaveBeenCalled();
      expect(mockAppEvents.audiobookUpdated).toHaveBeenCalledWith('ab-1');
    });

    it('should delete ebook link and emit ebookUpdated', async () => {
      const deleteChain = createChainMock(['where']);
      deleteChain.where.mockResolvedValueOnce(undefined);
      db.delete.mockReturnValueOnce(deleteChain);

      await service.unlinkMedia('ebook', 'eb-1');

      expect(db.delete).toHaveBeenCalled();
      expect(mockAppEvents.ebookUpdated).toHaveBeenCalledWith('eb-1');
    });
  });

  // =========================================================================
  // Sync Queue
  // =========================================================================
  describe('addToSyncQueue', () => {
    // For addToSyncQueue, the method calls Promise.all with 2 selects,
    // then insert, then emitHardcoverSyncStatus (which does 2 more selects).
    // We need to mock the parallel selects carefully.

    it('should insert audiobook when not already queued or linked', async () => {
      // Promise.all: two select chains resolved concurrently
      const queueCheckChain = createChainMock(['from', 'where', 'limit']);
      queueCheckChain.limit.mockResolvedValueOnce([]); // not in queue
      db.select.mockReturnValueOnce(queueCheckChain);

      const linkCheckChain = createChainMock(['from', 'where', 'limit']);
      linkCheckChain.limit.mockResolvedValueOnce([]); // not linked
      db.select.mockReturnValueOnce(linkCheckChain);

      // insert into sync queue
      const insertChain = createChainMock(['values']);
      insertChain.values.mockResolvedValueOnce(undefined);
      db.insert.mockReturnValueOnce(insertChain);

      // emitHardcoverSyncStatus calls getPendingQueueCount + getFailedQueueItems
      // getPendingQueueCount: select
      const pendingChain = createChainMock(['from', 'where']);
      pendingChain.where.mockResolvedValueOnce([{ id: '1' }]);
      db.select.mockReturnValueOnce(pendingChain);

      // getFailedQueueItems: select
      const failedChain = createChainMock(['from', 'where', 'orderBy']);
      failedChain.orderBy.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(failedChain);

      await service.addToSyncQueue('audiobook', 'ab-1');

      // emitHardcoverSyncStatus is fire-and-forget (not awaited),
      // so flush the microtask queue before asserting.
      await new Promise(process.nextTick);

      expect(db.insert).toHaveBeenCalled();
      expect(mockWsEvents.hardcoverSyncStatusUpdated).toHaveBeenCalledWith({
        pendingCount: 1,
        failedCount: 0,
      });
    });

    it('should skip when audiobook is already in queue', async () => {
      const queueCheckChain = createChainMock(['from', 'where', 'limit']);
      queueCheckChain.limit.mockResolvedValueOnce([{ id: 'queue-1' }]); // already queued
      db.select.mockReturnValueOnce(queueCheckChain);

      const linkCheckChain = createChainMock(['from', 'where', 'limit']);
      linkCheckChain.limit.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(linkCheckChain);

      await service.addToSyncQueue('audiobook', 'ab-1');

      expect(db.insert).not.toHaveBeenCalled();
    });

    it('should skip when audiobook is already linked', async () => {
      const queueCheckChain = createChainMock(['from', 'where', 'limit']);
      queueCheckChain.limit.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(queueCheckChain);

      const linkCheckChain = createChainMock(['from', 'where', 'limit']);
      linkCheckChain.limit.mockResolvedValueOnce([{ audiobookId: 'ab-1' }]); // already linked
      db.select.mockReturnValueOnce(linkCheckChain);

      await service.addToSyncQueue('audiobook', 'ab-1');

      expect(db.insert).not.toHaveBeenCalled();
    });
  });

  describe('getNextPendingFromQueue', () => {
    it('should return the oldest pending item', async () => {
      const mockItem = {
        id: 'q-1',
        audiobookId: 'ab-1',
        status: 'pending',
        createdAt: new Date(),
      };
      const chain = createChainMock(['from', 'where', 'orderBy', 'limit']);
      chain.limit.mockResolvedValueOnce([mockItem]);
      db.select.mockReturnValueOnce(chain);

      const result = await service.getNextPendingFromQueue();
      expect(result).toEqual(mockItem);
    });

    it('should return null when queue is empty', async () => {
      const chain = createChainMock(['from', 'where', 'orderBy', 'limit']);
      chain.limit.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(chain);

      const result = await service.getNextPendingFromQueue();
      expect(result).toBeNull();
    });
  });

  describe('markQueueItemProcessing', () => {
    it('should update status to processing', async () => {
      const updateChain = createChainMock(['set', 'where']);
      updateChain.where.mockResolvedValueOnce(undefined);
      db.update.mockReturnValueOnce(updateChain);

      await service.markQueueItemProcessing('q-1');

      expect(updateChain.set).toHaveBeenCalledWith({ status: 'processing' });
    });
  });

  describe('markQueueItemFailed', () => {
    it('should update status and error message', async () => {
      const updateChain = createChainMock(['set', 'where']);
      updateChain.where.mockResolvedValueOnce(undefined);
      db.update.mockReturnValueOnce(updateChain);

      await service.markQueueItemFailed('q-1', 'No results found');

      expect(updateChain.set).toHaveBeenCalledWith({
        status: 'failed',
        errorMessage: 'No results found',
      });
    });
  });

  describe('removeFromQueue', () => {
    it('should delete the queue item', async () => {
      const deleteChain = createChainMock(['where']);
      deleteChain.where.mockResolvedValueOnce(undefined);
      db.delete.mockReturnValueOnce(deleteChain);

      await service.removeFromQueue('q-1');

      expect(db.delete).toHaveBeenCalled();
    });
  });

  describe('getPendingQueueCount', () => {
    it('should return the count of pending items', async () => {
      const chain = createChainMock(['from', 'where']);
      chain.where.mockResolvedValueOnce([
        { id: '1' },
        { id: '2' },
        { id: '3' },
      ]);
      db.select.mockReturnValueOnce(chain);

      const result = await service.getPendingQueueCount();
      expect(result).toBe(3);
    });
  });

  describe('dismissFailedItem', () => {
    it('should delete the failed queue item', async () => {
      const deleteChain = createChainMock(['where']);
      deleteChain.where.mockResolvedValueOnce(undefined);
      db.delete.mockReturnValueOnce(deleteChain);

      await service.dismissFailedItem('q-1');

      expect(db.delete).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Bulk / Cleanup
  // =========================================================================
  describe('queueAllUnlinked', () => {
    it('should find unlinked audiobooks and queue each one', async () => {
      // getApiKey
      const settingsChain = createChainMock(['from', 'where', 'limit']);
      settingsChain.limit.mockResolvedValueOnce([
        { hardcoverApiKey: 'test-key' },
      ]);
      db.select.mockReturnValueOnce(settingsChain);

      // Find unlinked audiobooks (LEFT JOIN + isNull)
      const unlinkedChain = createChainMock(['from', 'leftJoin', 'where']);
      unlinkedChain.where.mockResolvedValueOnce([
        { id: 'ab-1' },
        { id: 'ab-2' },
      ]);
      db.select.mockReturnValueOnce(unlinkedChain);

      // addToSyncQueue is called for each item. Each call does:
      // 2 selects (Promise.all queue+link check), 1 insert, then emitStatus (2 selects)

      // --- ab-1 ---
      const q1Check = createChainMock(['from', 'where', 'limit']);
      q1Check.limit.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(q1Check);

      const l1Check = createChainMock(['from', 'where', 'limit']);
      l1Check.limit.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(l1Check);

      const ins1 = createChainMock(['values']);
      ins1.values.mockResolvedValueOnce(undefined);
      db.insert.mockReturnValueOnce(ins1);

      // emitStatus for ab-1
      const pending1 = createChainMock(['from', 'where']);
      pending1.where.mockResolvedValueOnce([{ id: '1' }]);
      db.select.mockReturnValueOnce(pending1);
      const failed1 = createChainMock(['from', 'where', 'orderBy']);
      failed1.orderBy.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(failed1);

      // --- ab-2 ---
      const q2Check = createChainMock(['from', 'where', 'limit']);
      q2Check.limit.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(q2Check);

      const l2Check = createChainMock(['from', 'where', 'limit']);
      l2Check.limit.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(l2Check);

      const ins2 = createChainMock(['values']);
      ins2.values.mockResolvedValueOnce(undefined);
      db.insert.mockReturnValueOnce(ins2);

      // emitStatus for ab-2
      const pending2 = createChainMock(['from', 'where']);
      pending2.where.mockResolvedValueOnce([{ id: '1' }, { id: '2' }]);
      db.select.mockReturnValueOnce(pending2);
      const failed2 = createChainMock(['from', 'where', 'orderBy']);
      failed2.orderBy.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(failed2);

      const result = await service.queueAllUnlinked('audiobook');

      expect(result).toBe(2);
      expect(db.insert).toHaveBeenCalledTimes(2);
    });

    it('should throw BadRequestException when no API key is configured', async () => {
      const settingsChain = createChainMock(['from', 'where', 'limit']);
      settingsChain.limit.mockResolvedValueOnce([{ hardcoverApiKey: null }]);
      db.select.mockReturnValueOnce(settingsChain);

      await expect(service.queueAllUnlinked('audiobook')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should find unlinked ebooks and queue each one', async () => {
      // getApiKey
      const settingsChain = createChainMock(['from', 'where', 'limit']);
      settingsChain.limit.mockResolvedValueOnce([
        { hardcoverApiKey: 'test-key' },
      ]);
      db.select.mockReturnValueOnce(settingsChain);

      // Find unlinked ebooks
      const unlinkedChain = createChainMock(['from', 'leftJoin', 'where']);
      unlinkedChain.where.mockResolvedValueOnce([{ id: 'eb-1' }]);
      db.select.mockReturnValueOnce(unlinkedChain);

      // addToSyncQueue for eb-1
      const q1Check = createChainMock(['from', 'where', 'limit']);
      q1Check.limit.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(q1Check);

      const l1Check = createChainMock(['from', 'where', 'limit']);
      l1Check.limit.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(l1Check);

      const ins1 = createChainMock(['values']);
      ins1.values.mockResolvedValueOnce(undefined);
      db.insert.mockReturnValueOnce(ins1);

      // emitStatus
      const pending1 = createChainMock(['from', 'where']);
      pending1.where.mockResolvedValueOnce([{ id: '1' }]);
      db.select.mockReturnValueOnce(pending1);
      const failed1 = createChainMock(['from', 'where', 'orderBy']);
      failed1.orderBy.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(failed1);

      const result = await service.queueAllUnlinked('ebook');

      expect(result).toBe(1);
      expect(db.insert).toHaveBeenCalledTimes(1);
    });
  });

  describe('cleanupOrphanedBooks', () => {
    it('should delete orphaned hardcover books', async () => {
      // Select orphaned books
      const selectChain = createChainMock(['from', 'leftJoin', 'where']);
      // Two leftJoin calls chain, final where resolves
      selectChain.where.mockResolvedValueOnce([
        { id: 'hcb-orphan-1' },
        { id: 'hcb-orphan-2' },
      ]);
      // Need the second leftJoin to also chain
      db.select.mockReturnValueOnce(selectChain);

      // Delete orphaned
      const deleteChain = createChainMock(['where']);
      deleteChain.where.mockResolvedValueOnce(undefined);
      db.delete.mockReturnValueOnce(deleteChain);

      const result = await service.cleanupOrphanedBooks();

      expect(result).toBe(2);
      expect(db.delete).toHaveBeenCalled();
    });

    it('should return 0 when no orphans exist', async () => {
      const selectChain = createChainMock(['from', 'leftJoin', 'where']);
      selectChain.where.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(selectChain);

      const result = await service.cleanupOrphanedBooks();

      expect(result).toBe(0);
      expect(db.delete).not.toHaveBeenCalled();
    });
  });
});
