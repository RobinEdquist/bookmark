import { NotFoundException, BadRequestException } from '@nestjs/common';
import { RequestsService } from './requests.service';
import * as requestsSchema from './schema';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chainMock(resolvedValue: any = []) {
  const self: Record<string, jest.Mock> = {};
  const methods = [
    'from',
    'where',
    'limit',
    'offset',
    'orderBy',
    'returning',
    'set',
    'values',
    'innerJoin',
    'leftJoin',
  ];
  for (const m of methods) {
    self[m] = jest.fn().mockReturnValue(self);
  }
  (self as any).then = (resolve: any, reject: any) =>
    Promise.resolve(resolvedValue).then(resolve, reject);
  return self;
}

function createMockDb(overrides: Record<string, any> = {}) {
  return {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    ...overrides,
  } as any;
}

const NOW = new Date('2026-01-15T12:00:00.000Z');

function buildRequest(overrides: Partial<Record<string, any>> = {}) {
  return {
    id: 'req-1',
    userId: 'user-1',
    status: 'pending' as const,
    torrentId: '12345',
    torrentHash: null,
    folderName: null,
    title: 'Test Audiobook',
    author: 'Test Author',
    narrator: 'Test Narrator',
    series: null,
    description: 'A test description',
    coverUrl: null,
    contentType: 'audiobook' as const,
    categoryId: 13,
    rejectionReason: null,
    libraryItemId: null,
    libraryItemType: null,
    autoApprovedByUserId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

// Build a single tracker search result (already parsed/cleaned by the client).
function buildTrackerResult(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    title: 'Book',
    author: null,
    narrator: null,
    series: null,
    description: null,
    contentType: 'audiobook' as const,
    categoryId: 13,
    categoryName: 'Audiobooks',
    size: '1 GB',
    language: 'English',
    fileType: 'M4B',
    tags: [],
    addedDate: '2024-01-01',
    ...overrides,
  };
}

function createMockTracker() {
  return {
    search: jest.fn(),
    download: jest.fn(),
    getTorrentStatus: jest.fn(),
    getBulkTorrentStatus: jest.fn(),
    proxyImage: jest.fn(),
  } as any;
}

function createMockAppSettings(overrides: Record<string, any> = {}) {
  return {
    getSettings: jest.fn().mockResolvedValue({
      autoApproveRequestsPerWeek: 0,
      requestsUseFreeleech: false,
      ...overrides,
    }),
    getRequestsCategories: jest.fn().mockResolvedValue({
      audiobook: 'audiobooks',
      ebook: 'books',
      comics: 'comics',
    }),
  } as any;
}

/**
 * Sets up a db mock where sequential select() calls return different results.
 * Each entry in `selectResults` is the resolved value for the Nth select() call.
 */
function createSequentialSelectDb(
  selectResults: any[],
  otherOverrides: Record<string, any> = {},
) {
  let callIndex = 0;
  const select = jest.fn().mockImplementation(() => {
    const idx = callIndex++;
    const result = idx < selectResults.length ? selectResults[idx] : [];
    return chainMock(result);
  });
  return createMockDb({ select, ...otherOverrides });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RequestsService', () => {
  // -----------------------------------------------------------------------
  // getRequestById
  // -----------------------------------------------------------------------
  describe('getRequestById', () => {
    it('returns mapped response for existing request', async () => {
      const request = buildRequest();
      // Calls: 1) select request, 2) select user email, 3) select supporters
      const db = createSequentialSelectDb([
        [request],
        [{ email: 'user@test.com' }],
        [],
      ]);
      const service = new RequestsService(
        db,
        createMockTracker(),
        createMockAppSettings(),
      );

      const result = await service.getRequestById('req-1', 'user-1');

      expect(result.id).toBe('req-1');
      expect(result.title).toBe('Test Audiobook');
      expect(result.userEmail).toBe('user@test.com');
      expect(result.supporterCount).toBe(0);
      expect(result.isSupporter).toBe(false);
    });

    it('throws NotFoundException when request does not exist', async () => {
      const db = createSequentialSelectDb([[]]);
      const service = new RequestsService(
        db,
        createMockTracker(),
        createMockAppSettings(),
      );

      await expect(
        service.getRequestById('missing', 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('sets isSupporter=true when current user is a supporter', async () => {
      const request = buildRequest({ userId: 'user-other' });
      const db = createSequentialSelectDb([
        [request],
        [{ email: 'other@test.com' }],
        [{ userId: 'user-1' }],
      ]);
      const service = new RequestsService(
        db,
        createMockTracker(),
        createMockAppSettings(),
      );

      const result = await service.getRequestById('req-1', 'user-1');

      expect(result.isSupporter).toBe(true);
      expect(result.supporterCount).toBe(1);
    });
  });

  // -----------------------------------------------------------------------
  // createRequest
  // -----------------------------------------------------------------------
  describe('createRequest', () => {
    it('creates a new request when no active request exists', async () => {
      const createdRequest = buildRequest();
      const responseRequest = buildRequest();
      const insertChain = chainMock([createdRequest]);

      // Sequential selects:
      // 1) check existing active request -> none
      // Then insert happens, returns createdRequest
      // Then getUserAutoApproveUsage: limit=0 so returns immediately (no DB count query)
      // Then getRequestById: 2) select request, 3) select user, 4) select supporters
      const db = createSequentialSelectDb(
        [
          [], // no existing active request
          [responseRequest], // getRequestById - request
          [{ email: 'user@test.com' }], // getRequestById - user
          [], // getRequestById - supporters
        ],
        {
          insert: jest.fn().mockReturnValue(insertChain),
        },
      );

      const service = new RequestsService(
        db,
        createMockTracker(),
        createMockAppSettings(),
      );

      const result = await service.createRequest(
        {
          torrentId: 12345,
          title: 'Test Audiobook',
          author: 'Test Author',
          narrator: 'Test Narrator',
          description: 'A test description',
          coverUrl: null,
          contentType: 'audiobook',
          categoryId: 13,
        } as any,
        'user-1',
      );

      expect(db.insert).toHaveBeenCalledWith(requestsSchema.requests);
      expect(result.id).toBe('req-1');
    });

    it('throws BadRequestException when user already requested the same item', async () => {
      const existing = buildRequest({ userId: 'user-1' });
      const db = createSequentialSelectDb([[existing]]);
      const service = new RequestsService(
        db,
        createMockTracker(),
        createMockAppSettings(),
      );

      await expect(
        service.createRequest(
          {
            torrentId: 12345,
            title: 'Test',
            contentType: 'audiobook',
            categoryId: 13,
          } as any,
          'user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('adds as supporter when another user already has active request', async () => {
      const existing = buildRequest({
        userId: 'user-other',
        id: 'req-existing',
      });
      const insertChain = chainMock([]);

      // Sequential selects:
      // 1) existing active request -> found (different user)
      // 2) addSupporter: check existing supporter -> none
      // 3) addSupporter: select request for auto-approve check
      // getUserAutoApproveUsage: limit=0, returns immediately (no DB count query)
      // Then getRequestById: 4) select request, 5) select user, 6) select supporters
      const db = createSequentialSelectDb(
        [
          [existing],
          [], // no existing supporter
          [existing], // request for auto-approve check
          [existing], // getRequestById
          [{ email: 'other@test.com' }], // user email
          [{ userId: 'user-1' }], // supporters
        ],
        {
          insert: jest.fn().mockReturnValue(insertChain),
        },
      );

      const service = new RequestsService(
        db,
        createMockTracker(),
        createMockAppSettings(),
      );

      const result = await service.createRequest(
        {
          torrentId: 12345,
          title: 'Test',
          contentType: 'audiobook',
          categoryId: 13,
        } as any,
        'user-1',
      );

      // insert should have been called for the supporter entry
      expect(db.insert).toHaveBeenCalledWith(requestsSchema.requestSupporters);
      expect(result.id).toBe('req-existing');
    });
  });

  // -----------------------------------------------------------------------
  // approveRequest
  // -----------------------------------------------------------------------
  describe('approveRequest', () => {
    it('approves a pending request and starts download', async () => {
      const request = buildRequest({ status: 'pending' });
      const updateChain = chainMock([]);

      const tracker = createMockTracker();
      tracker.download.mockResolvedValue({ hash: 'abc123' });
      tracker.getTorrentStatus.mockResolvedValue({
        hash: 'abc123',
        name: 'Test Folder',
        state: 'downloading',
      });

      // Sequential selects:
      // 1) getRequestByIdInternal -> pending request
      // 2) getRequestsCategories (via appSettings mock)
      // 3) getSettings (via appSettings mock)
      // Then getRequestById: 4) select request, 5) select user, 6) select supporters
      const approvedRequest = buildRequest({
        status: 'approved',
        torrentHash: 'abc123',
      });
      const db = createSequentialSelectDb(
        [
          [request], // getRequestByIdInternal
          [approvedRequest], // getRequestById
          [{ email: 'user@test.com' }], // user email
          [], // supporters
        ],
        {
          update: jest.fn().mockReturnValue(updateChain),
        },
      );

      const service = new RequestsService(db, tracker, createMockAppSettings());

      const result = await service.approveRequest('req-1');

      expect(tracker.download).toHaveBeenCalledWith('12345', {
        category: 'audiobooks',
        usePersonalFL: undefined,
      });
      expect(db.update).toHaveBeenCalledWith(requestsSchema.requests);
      expect(result.id).toBe('req-1');
    });

    it('throws BadRequestException when request is not pending', async () => {
      const request = buildRequest({ status: 'approved' });
      const db = createSequentialSelectDb([[request]]);
      const service = new RequestsService(
        db,
        createMockTracker(),
        createMockAppSettings(),
      );

      await expect(service.approveRequest('req-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('throws NotFoundException when request does not exist', async () => {
      const db = createSequentialSelectDb([[]]);
      const service = new RequestsService(
        db,
        createMockTracker(),
        createMockAppSettings(),
      );

      await expect(service.approveRequest('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('uses comics category for categoryId 61', async () => {
      const request = buildRequest({
        status: 'pending',
        categoryId: 61,
        contentType: 'ebook',
      });
      const updateChain = chainMock([]);

      const tracker = createMockTracker();
      tracker.download.mockResolvedValue({ hash: 'abc123' });
      tracker.getTorrentStatus.mockResolvedValue({
        hash: 'abc123',
        name: 'Comic Folder',
        state: 'downloading',
      });

      const db = createSequentialSelectDb(
        [
          [request],
          [buildRequest({ status: 'approved' })],
          [{ email: 'user@test.com' }],
          [],
        ],
        { update: jest.fn().mockReturnValue(updateChain) },
      );

      const service = new RequestsService(db, tracker, createMockAppSettings());

      await service.approveRequest('req-1');

      expect(tracker.download).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ category: 'comics' }),
      );
    });

    it('uses ebook category for ebook content type', async () => {
      const request = buildRequest({
        status: 'pending',
        contentType: 'ebook',
        categoryId: 14,
      });
      const updateChain = chainMock([]);

      const tracker = createMockTracker();
      tracker.download.mockResolvedValue({ hash: 'abc123' });
      tracker.getTorrentStatus.mockResolvedValue({
        hash: 'abc123',
        name: 'Ebook Folder',
        state: 'downloading',
      });

      const db = createSequentialSelectDb(
        [
          [request],
          [buildRequest({ status: 'approved' })],
          [{ email: 'user@test.com' }],
          [],
        ],
        { update: jest.fn().mockReturnValue(updateChain) },
      );

      const service = new RequestsService(db, tracker, createMockAppSettings());

      await service.approveRequest('req-1');

      expect(tracker.download).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ category: 'books' }),
      );
    });

    it('uses freeleech when setting is enabled', async () => {
      const request = buildRequest({ status: 'pending' });
      const updateChain = chainMock([]);

      const tracker = createMockTracker();
      tracker.download.mockResolvedValue({ hash: 'abc123' });
      tracker.getTorrentStatus.mockResolvedValue({
        hash: 'abc123',
        name: 'Folder',
        state: 'downloading',
      });

      const db = createSequentialSelectDb(
        [
          [request],
          [buildRequest({ status: 'approved' })],
          [{ email: 'user@test.com' }],
          [],
        ],
        { update: jest.fn().mockReturnValue(updateChain) },
      );

      const service = new RequestsService(
        db,
        tracker,
        createMockAppSettings({ requestsUseFreeleech: true }),
      );

      await service.approveRequest('req-1');

      expect(tracker.download).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ usePersonalFL: true }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // rejectRequest
  // -----------------------------------------------------------------------
  describe('rejectRequest', () => {
    it('rejects a pending request with a reason', async () => {
      const request = buildRequest({ status: 'pending' });
      const rejectedRequest = buildRequest({
        status: 'rejected',
        rejectionReason: 'Duplicate',
      });
      const updateChain = chainMock([]);

      const db = createSequentialSelectDb(
        [
          [request], // getRequestByIdInternal
          [rejectedRequest], // getRequestById
          [{ email: 'user@test.com' }], // user email
          [], // supporters
        ],
        { update: jest.fn().mockReturnValue(updateChain) },
      );

      const service = new RequestsService(
        db,
        createMockTracker(),
        createMockAppSettings(),
      );

      const result = await service.rejectRequest('req-1', {
        reason: 'Duplicate',
      });

      expect(updateChain.set).toHaveBeenCalledWith({
        status: 'rejected',
        rejectionReason: 'Duplicate',
      });
      expect(result.id).toBe('req-1');
    });

    it('rejects with null reason when not provided', async () => {
      const request = buildRequest({ status: 'pending' });
      const rejectedRequest = buildRequest({ status: 'rejected' });
      const updateChain = chainMock([]);

      const db = createSequentialSelectDb(
        [[request], [rejectedRequest], [{ email: 'user@test.com' }], []],
        { update: jest.fn().mockReturnValue(updateChain) },
      );

      const service = new RequestsService(
        db,
        createMockTracker(),
        createMockAppSettings(),
      );

      await service.rejectRequest('req-1', {});

      expect(updateChain.set).toHaveBeenCalledWith({
        status: 'rejected',
        rejectionReason: null,
      });
    });

    it('throws BadRequestException when request is not pending', async () => {
      const request = buildRequest({ status: 'approved' });
      const db = createSequentialSelectDb([[request]]);
      const service = new RequestsService(
        db,
        createMockTracker(),
        createMockAppSettings(),
      );

      await expect(
        service.rejectRequest('req-1', { reason: 'No' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFoundException when request does not exist', async () => {
      const db = createSequentialSelectDb([[]]);
      const service = new RequestsService(
        db,
        createMockTracker(),
        createMockAppSettings(),
      );

      await expect(
        service.rejectRequest('missing', { reason: 'No' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // getUserAutoApproveUsage
  // -----------------------------------------------------------------------
  describe('getUserAutoApproveUsage', () => {
    it('returns zero usage when limit is 0', async () => {
      const db = createMockDb();
      const service = new RequestsService(
        db,
        createMockTracker(),
        createMockAppSettings({ autoApproveRequestsPerWeek: 0 }),
      );

      const result = await service.getUserAutoApproveUsage('user-1');

      expect(result).toEqual({ used: 0, limit: 0 });
    });

    it('returns current usage when limit is set', async () => {
      const selectChain = chainMock([{ count: 3 }]);
      const db = createMockDb({
        select: jest.fn().mockReturnValue(selectChain),
      });

      const service = new RequestsService(
        db,
        createMockTracker(),
        createMockAppSettings({ autoApproveRequestsPerWeek: 5 }),
      );

      const result = await service.getUserAutoApproveUsage('user-1');

      expect(result).toEqual({ used: 3, limit: 5 });
    });
  });

  // -----------------------------------------------------------------------
  // getUserRequests
  // -----------------------------------------------------------------------
  describe('getUserRequests', () => {
    it('returns mapped requests for a user', async () => {
      const request = buildRequest();
      // Sequential selects: 1) user requests, 2) user email, 3) supporters
      const db = createSequentialSelectDb([
        [request],
        [{ email: 'user@test.com' }],
        [],
      ]);

      const service = new RequestsService(
        db,
        createMockTracker(),
        createMockAppSettings(),
      );

      const result = await service.getUserRequests('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('req-1');
      expect(result[0].userEmail).toBe('user@test.com');
    });

    it('returns empty array when user has no requests', async () => {
      const db = createSequentialSelectDb([[]]);
      const service = new RequestsService(
        db,
        createMockTracker(),
        createMockAppSettings(),
      );

      const result = await service.getUserRequests('user-1');

      expect(result).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // tryMatchImport
  // -----------------------------------------------------------------------
  describe('tryMatchImport', () => {
    it('matches a request by folder name and marks complete', async () => {
      const request = buildRequest({
        status: 'downloading',
        folderName: 'Test Folder',
      });
      const updateChain = chainMock([]);

      const db = createSequentialSelectDb([[request]], {
        update: jest.fn().mockReturnValue(updateChain),
      });

      const service = new RequestsService(
        db,
        createMockTracker(),
        createMockAppSettings(),
      );

      const result = await service.tryMatchImport(
        'Test Folder',
        'lib-item-1',
        'audiobook',
      );

      expect(result).toBe(true);
      expect(updateChain.set).toHaveBeenCalledWith({
        status: 'complete',
        libraryItemId: 'lib-item-1',
        libraryItemType: 'audiobook',
      });
    });

    it('returns false when no matching request found', async () => {
      const db = createSequentialSelectDb([[]]);
      const service = new RequestsService(
        db,
        createMockTracker(),
        createMockAppSettings(),
      );

      const result = await service.tryMatchImport(
        'Unknown Folder',
        'lib-item-1',
        'audiobook',
      );

      expect(result).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // search - maps the tracker client's pre-parsed results through
  // -----------------------------------------------------------------------
  describe('search', () => {
    it('passes through pre-parsed author, narrator and series', async () => {
      const tracker = createMockTracker();
      tracker.search.mockResolvedValue({
        results: [
          buildTrackerResult({
            author: 'Brandon Sanderson',
            narrator: 'Michael Kramer',
            series: [{ name: 'Harry Potter', number: '1' }],
          }),
        ],
        total: 1,
      });

      const db = createSequentialSelectDb([[]]);
      const service = new RequestsService(db, tracker, createMockAppSettings());

      const result = await service.search('Book', 25, 0, 'user-1');

      expect(result.results[0].author).toBe('Brandon Sanderson');
      expect(result.results[0].narrator).toBe('Michael Kramer');
      expect(result.results[0].series).toEqual([
        { name: 'Harry Potter', number: '1' },
      ]);
    });

    it('builds the cover URL from the result id', async () => {
      const tracker = createMockTracker();
      tracker.search.mockResolvedValue({
        results: [buildTrackerResult({ id: 999 })],
        total: 1,
      });

      const db = createSequentialSelectDb([[]]);
      const service = new RequestsService(db, tracker, createMockAppSettings());

      const result = await service.search('Book', 25, 0, 'user-1');

      expect(result.results[0].coverUrl).toBe('/api/requests/cover/999');
    });

    it('passes the result content type and category id through', async () => {
      const tracker = createMockTracker();
      tracker.search.mockResolvedValue({
        results: [
          buildTrackerResult({
            contentType: 'ebook',
            categoryId: 14,
            categoryName: 'Ebooks',
          }),
        ],
        total: 1,
      });

      const db = createSequentialSelectDb([[]]);
      const service = new RequestsService(db, tracker, createMockAppSettings());

      const result = await service.search('Book', 25, 0, 'user-1');

      expect(result.results[0].contentType).toBe('ebook');
      expect(result.results[0].categoryId).toBe(14);
      expect(result.results[0].category).toBe('Ebooks');
    });

    it('sends categories [audiobook] for audiobooks content type', async () => {
      const tracker = createMockTracker();
      tracker.search.mockResolvedValue({ results: [], total: 0 });

      const db = createSequentialSelectDb([]);
      const service = new RequestsService(db, tracker, createMockAppSettings());

      await service.search('Book', 25, 0, 'user-1', 'audiobooks');

      expect(tracker.search).toHaveBeenCalledWith(
        expect.objectContaining({ categories: ['audiobook'] }),
      );
    });

    it('sends categories [ebook] for ebooks content type', async () => {
      const tracker = createMockTracker();
      tracker.search.mockResolvedValue({ results: [], total: 0 });

      const db = createSequentialSelectDb([]);
      const service = new RequestsService(db, tracker, createMockAppSettings());

      await service.search('Book', 25, 0, 'user-1', 'ebooks');

      expect(tracker.search).toHaveBeenCalledWith(
        expect.objectContaining({ categories: ['ebook'] }),
      );
    });

    it('sends categories [audiobook, ebook] for all content type', async () => {
      const tracker = createMockTracker();
      tracker.search.mockResolvedValue({ results: [], total: 0 });

      const db = createSequentialSelectDb([]);
      const service = new RequestsService(db, tracker, createMockAppSettings());

      await service.search('Book', 25, 0, 'user-1', 'all');

      expect(tracker.search).toHaveBeenCalledWith(
        expect.objectContaining({ categories: ['audiobook', 'ebook'] }),
      );
    });
  });
});
