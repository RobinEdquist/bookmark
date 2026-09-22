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

/** Update chain whose `.returning()` yields one claimed row. */
function claimedUpdateChain() {
  const chain = chainMock([]);
  chain.returning.mockReturnValue(Promise.resolve([{ id: 'req-1' }]));
  return chain;
}

function createMockDb(overrides: Record<string, any> = {}) {
  const db = {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    ...overrides,
  } as any;
  // Default: a transaction is just the same mock db, so claim/update assertions
  // keep working when approval moves its writes inside one.
  if (!db.transaction) {
    db.transaction = jest.fn(async (cb: (tx: any) => Promise<any>) => cb(db));
  }
  return db;
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
    torrentMissingSince: null,
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

function createMockLibrary() {
  return {
    searchLibrary: jest.fn().mockResolvedValue({ audiobooks: [], ebooks: [] }),
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
        createMockLibrary(),
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
        createMockLibrary(),
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
        createMockLibrary(),
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
        createMockLibrary(),
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
        createMockLibrary(),
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
      // 2) addSupporter: load the request (owner check + auto-approve check)
      // 3) addSupporter: check existing supporter -> none
      // getUserAutoApproveUsage: limit=0, returns immediately (no DB count query)
      // Then getRequestById: 4) select request, 5) select user, 6) select supporters
      const db = createSequentialSelectDb(
        [
          [existing],
          [existing], // request loaded by addSupporter
          [], // no existing supporter
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
        createMockLibrary(),
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
  // addSupporter
  // -----------------------------------------------------------------------
  describe('addSupporter', () => {
    it('throws BadRequestException when supporting your own request', async () => {
      const request = buildRequest({ userId: 'user-1' });
      const db = createSequentialSelectDb([[request]], {
        insert: jest.fn().mockReturnValue(chainMock([])),
      });
      const service = new RequestsService(
        db,
        createMockTracker(),
        createMockAppSettings(),
        createMockLibrary(),
      );

      await expect(
        service.addSupporter('req-1', 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the request does not exist', async () => {
      const db = createSequentialSelectDb([[]]);
      const service = new RequestsService(
        db,
        createMockTracker(),
        createMockAppSettings(),
        createMockLibrary(),
      );

      await expect(
        service.addSupporter('missing', 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('adds another user as supporter', async () => {
      const request = buildRequest({ userId: 'user-other' });
      const insertChain = chainMock([]);
      const db = createSequentialSelectDb(
        [
          [request], // load request
          [], // not a supporter yet
        ],
        { insert: jest.fn().mockReturnValue(insertChain) },
      );
      const service = new RequestsService(
        db,
        createMockTracker(),
        createMockAppSettings(),
        createMockLibrary(),
      );

      await service.addSupporter('req-1', 'user-1');

      expect(db.insert).toHaveBeenCalledWith(requestsSchema.requestSupporters);
      expect(insertChain.values).toHaveBeenCalledWith({
        requestId: 'req-1',
        userId: 'user-1',
      });
    });
  });

  // -----------------------------------------------------------------------
  // deleteRequest
  // -----------------------------------------------------------------------
  describe('deleteRequest', () => {
    it('deletes an existing request', async () => {
      const deleteChain = chainMock([]);
      const db = createSequentialSelectDb([[buildRequest()]], {
        delete: jest.fn().mockReturnValue(deleteChain),
      });
      const service = new RequestsService(
        db,
        createMockTracker(),
        createMockAppSettings(),
        createMockLibrary(),
      );

      await service.deleteRequest('req-1');

      expect(db.delete).toHaveBeenCalledWith(requestsSchema.requests);
      expect(deleteChain.where).toHaveBeenCalled();
    });

    it('throws NotFoundException when the request does not exist', async () => {
      const deleteChain = chainMock([]);
      const db = createSequentialSelectDb([[]], {
        delete: jest.fn().mockReturnValue(deleteChain),
      });
      const service = new RequestsService(
        db,
        createMockTracker(),
        createMockAppSettings(),
        createMockLibrary(),
      );

      await expect(service.deleteRequest('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(db.delete).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // updateDownloadingStatuses
  // -----------------------------------------------------------------------
  describe('updateDownloadingStatuses', () => {
    function setup(
      requests: any[],
      torrents: any[],
    ): { db: any; service: RequestsService; updateChain: any } {
      const updateChain = chainMock([]);
      const tracker = createMockTracker();
      tracker.getBulkTorrentStatus.mockResolvedValue({ torrents });
      const db = createSequentialSelectDb([requests], {
        update: jest.fn().mockReturnValue(updateChain),
      });
      return {
        db,
        service: new RequestsService(
          db,
          tracker,
          createMockAppSettings(),
          createMockLibrary(),
        ),
        updateChain,
      };
    }

    it('flags the request when the download client reports not_found', async () => {
      const { db, service, updateChain } = setup(
        [buildRequest({ status: 'approved', torrentHash: 'abc123' })],
        [{ hash: 'abc123', state: 'not_found', progress: 0 }],
      );

      await service.updateDownloadingStatuses();

      expect(db.update).toHaveBeenCalledWith(requestsSchema.requests);
      expect(updateChain.set).toHaveBeenCalledWith({
        torrentMissingSince: expect.any(Date),
      });
    });

    it('flags the request when the client omits the hash entirely', async () => {
      const { service, updateChain } = setup(
        [buildRequest({ status: 'downloading', torrentHash: 'abc123' })],
        [],
      );

      await service.updateDownloadingStatuses();

      expect(updateChain.set).toHaveBeenCalledWith({
        torrentMissingSince: expect.any(Date),
      });
    });

    it('does not write again while the torrent stays missing', async () => {
      const { db, service } = setup(
        [
          buildRequest({
            status: 'downloading',
            torrentHash: 'abc123',
            torrentMissingSince: NOW,
          }),
        ],
        [{ hash: 'abc123', state: 'not_found', progress: 0 }],
      );

      await service.updateDownloadingStatuses();

      expect(db.update).not.toHaveBeenCalled();
    });

    it('clears the flag and sets downloading when the torrent reappears', async () => {
      const { service, updateChain } = setup(
        [
          buildRequest({
            status: 'approved',
            torrentHash: 'ABC123',
            torrentMissingSince: NOW,
          }),
        ],
        [{ hash: 'abc123', state: 'stalledDL', progress: 0.1 }],
      );

      await service.updateDownloadingStatuses();

      expect(updateChain.set).toHaveBeenCalledWith({
        status: 'downloading',
        torrentMissingSince: null,
      });
    });

    it('leaves an untouched downloading request alone', async () => {
      const { db, service } = setup(
        [buildRequest({ status: 'downloading', torrentHash: 'abc123' })],
        [{ hash: 'abc123', state: 'downloading', progress: 0.5 }],
      );

      await service.updateDownloadingStatuses();

      expect(db.update).not.toHaveBeenCalled();
    });

    it('fills a missing folder name from a later bulk status', async () => {
      const { service, updateChain } = setup(
        [
          buildRequest({
            status: 'approved',
            torrentHash: 'abc123',
            folderName: null,
          }),
        ],
        [
          {
            hash: 'abc123',
            name: 'Test Folder',
            state: 'downloading',
            progress: 0.1,
          },
        ],
      );

      await service.updateDownloadingStatuses();

      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'downloading',
          folderName: 'Test Folder',
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // approveRequest
  // -----------------------------------------------------------------------
  describe('approveRequest', () => {
    it('approves a pending request and starts download', async () => {
      const request = buildRequest({ status: 'pending' });
      const updateChain = claimedUpdateChain();

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

      const service = new RequestsService(
        db,
        tracker,
        createMockAppSettings(),
        createMockLibrary(),
      );

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
        createMockLibrary(),
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
        createMockLibrary(),
      );

      await expect(service.approveRequest('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('uses comics category for comics content type', async () => {
      const request = buildRequest({
        status: 'pending',
        contentType: 'comics',
      });
      const updateChain = claimedUpdateChain();

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

      const service = new RequestsService(
        db,
        tracker,
        createMockAppSettings(),
        createMockLibrary(),
      );

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
      const updateChain = claimedUpdateChain();

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

      const service = new RequestsService(
        db,
        tracker,
        createMockAppSettings(),
        createMockLibrary(),
      );

      await service.approveRequest('req-1');

      expect(tracker.download).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ category: 'books' }),
      );
    });

    it('keeps the download hash when the post-submit status fetch fails', async () => {
      const request = buildRequest({ status: 'pending' });
      const updateChain = claimedUpdateChain();

      const tracker = createMockTracker();
      tracker.download.mockResolvedValue({ hash: 'abc123' });
      tracker.getTorrentStatus.mockRejectedValue(new Error('status timeout'));

      const approvedRequest = buildRequest({
        status: 'approved',
        torrentHash: 'abc123',
      });
      const db = createSequentialSelectDb(
        [[request], [approvedRequest], [{ email: 'user@test.com' }], []],
        {
          update: jest.fn().mockReturnValue(updateChain),
        },
      );

      const service = new RequestsService(
        db,
        tracker,
        createMockAppSettings(),
        createMockLibrary(),
      );

      // Status enrichment is best-effort; the poller backfills folderName.
      // Approval must still succeed once the hash is durable.
      await expect(service.approveRequest('req-1')).resolves.toMatchObject({
        id: 'req-1',
      });

      // The hash must already be durable before the status lookup, and the
      // request must no longer be pending, so a later approval cannot submit
      // the same torrent again. Claim and hash are separate writes: the claim
      // commits before the module is called.
      const persisted = updateChain.set.mock.calls.map((call) => call[0]);
      expect(persisted).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ status: 'approved' }),
          expect.objectContaining({ torrentHash: 'abc123' }),
        ]),
      );
      const hashWrite = persisted.findIndex(
        (row) => row.torrentHash === 'abc123',
      );
      const statusCallOrder =
        tracker.getTorrentStatus.mock.invocationCallOrder[0];
      const hashWriteOrder =
        updateChain.set.mock.invocationCallOrder[hashWrite];
      expect(hashWriteOrder).toBeLessThan(statusCallOrder);
      expect(tracker.download).toHaveBeenCalledTimes(1);
      expect(tracker.getTorrentStatus).toHaveBeenCalledTimes(1);
    });

    it('does not submit a download when the approval claim is lost', async () => {
      const request = buildRequest({ status: 'pending' });
      const lostClaim = chainMock([]);

      const tracker = createMockTracker();
      tracker.download.mockResolvedValue({ hash: 'abc123' });

      const db = createSequentialSelectDb([[request]], {
        update: jest.fn().mockReturnValue(lostClaim),
      });

      const service = new RequestsService(
        db,
        tracker,
        createMockAppSettings(),
        createMockLibrary(),
      );

      await expect(service.approveRequest('req-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(tracker.download).not.toHaveBeenCalled();
    });

    it('leaves the request approved when download fails after the claim', async () => {
      const request = buildRequest({ status: 'pending' });
      const updateChain = claimedUpdateChain();

      const tracker = createMockTracker();
      tracker.download.mockRejectedValue(new Error('download timeout'));

      const db = createSequentialSelectDb([[request]], {
        update: jest.fn().mockReturnValue(updateChain),
      });

      const service = new RequestsService(
        db,
        tracker,
        createMockAppSettings(),
        createMockLibrary(),
      );

      await expect(service.approveRequest('req-1')).rejects.toThrow(
        'download timeout',
      );

      // Prefer stuck approved (no hash) over releasing the claim — releasing
      // would reopen double-submit if the module already accepted.
      expect(tracker.download).toHaveBeenCalledTimes(1);
      expect(tracker.getTorrentStatus).not.toHaveBeenCalled();
      const persisted = updateChain.set.mock.calls.map((call) => call[0]);
      expect(persisted).toEqual([
        expect.objectContaining({ status: 'approved' }),
      ]);
      expect(persisted).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ status: 'pending' }),
        ]),
      );
    });

    it('uses freeleech when setting is enabled', async () => {
      const request = buildRequest({ status: 'pending' });
      const updateChain = claimedUpdateChain();

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
        createMockLibrary(),
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
        createMockLibrary(),
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
        createMockLibrary(),
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
        createMockLibrary(),
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
        createMockLibrary(),
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
        createMockLibrary(),
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
        createMockLibrary(),
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
        createMockLibrary(),
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
        createMockLibrary(),
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
        createMockLibrary(),
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
        createMockLibrary(),
      );

      const result = await service.tryMatchImport(
        'Unknown Folder',
        'lib-item-1',
        'audiobook',
      );

      expect(result).toBe(false);
    });

    it('does not complete a request when two share the folder name', async () => {
      const first = buildRequest({
        id: 'req-1',
        status: 'downloading',
        folderName: 'Same Name',
      });
      const second = buildRequest({
        id: 'req-2',
        status: 'approved',
        folderName: 'Same Name',
      });
      const updateChain = chainMock([]);
      const db = createSequentialSelectDb([[first, second]], {
        update: jest.fn().mockReturnValue(updateChain),
      });
      const service = new RequestsService(
        db,
        createMockTracker(),
        createMockAppSettings(),
        createMockLibrary(),
      );

      const result = await service.tryMatchImport(
        'Same Name',
        'lib-item-1',
        'audiobook',
      );

      expect(result).toBe(false);
      expect(db.update).not.toHaveBeenCalled();
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
      const service = new RequestsService(
        db,
        tracker,
        createMockAppSettings(),
        createMockLibrary(),
      );

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
      const service = new RequestsService(
        db,
        tracker,
        createMockAppSettings(),
        createMockLibrary(),
      );

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
      const service = new RequestsService(
        db,
        tracker,
        createMockAppSettings(),
        createMockLibrary(),
      );

      const result = await service.search('Book', 25, 0, 'user-1');

      expect(result.results[0].contentType).toBe('ebook');
      expect(result.results[0].categoryId).toBe(14);
      expect(result.results[0].category).toBe('Ebooks');
    });

    it('sends categories [audiobook] for audiobooks content type', async () => {
      const tracker = createMockTracker();
      tracker.search.mockResolvedValue({ results: [], total: 0 });

      const db = createSequentialSelectDb([]);
      const service = new RequestsService(
        db,
        tracker,
        createMockAppSettings(),
        createMockLibrary(),
      );

      await service.search('Book', 25, 0, 'user-1', 'audiobooks');

      expect(tracker.search).toHaveBeenCalledWith(
        expect.objectContaining({ categories: ['audiobook'] }),
      );
    });

    it('sends categories [ebook] for ebooks content type', async () => {
      const tracker = createMockTracker();
      tracker.search.mockResolvedValue({ results: [], total: 0 });

      const db = createSequentialSelectDb([]);
      const service = new RequestsService(
        db,
        tracker,
        createMockAppSettings(),
        createMockLibrary(),
      );

      await service.search('Book', 25, 0, 'user-1', 'ebooks');

      expect(tracker.search).toHaveBeenCalledWith(
        expect.objectContaining({ categories: ['ebook'] }),
      );
    });

    it('sends all categories for all content type', async () => {
      const tracker = createMockTracker();
      tracker.search.mockResolvedValue({ results: [], total: 0 });

      const db = createSequentialSelectDb([]);
      const service = new RequestsService(
        db,
        tracker,
        createMockAppSettings(),
        createMockLibrary(),
      );

      await service.search('Book', 25, 0, 'user-1', 'all');

      expect(tracker.search).toHaveBeenCalledWith(
        expect.objectContaining({
          categories: ['audiobook', 'ebook', 'comics'],
        }),
      );
    });

    it('marks an existing request as the caller’s own', async () => {
      const tracker = createMockTracker();
      tracker.search.mockResolvedValue({
        results: [buildTrackerResult({ id: 42 })],
        total: 1,
      });

      const db = createSequentialSelectDb([
        [{ torrentId: '42', id: 'req-1', status: 'pending', userId: 'user-1' }],
      ]);
      const service = new RequestsService(
        db,
        tracker,
        createMockAppSettings(),
        createMockLibrary(),
      );

      const result = await service.search('Book', 25, 0, 'user-1');

      expect(result.results[0].existingRequestId).toBe('req-1');
      expect(result.results[0].existingRequestIsMine).toBe(true);
    });

    it('marks another user’s request as supportable', async () => {
      const tracker = createMockTracker();
      tracker.search.mockResolvedValue({
        results: [buildTrackerResult({ id: 42 })],
        total: 1,
      });

      const db = createSequentialSelectDb([
        [
          {
            torrentId: '42',
            id: 'req-1',
            status: 'pending',
            userId: 'user-other',
          },
        ],
      ]);
      const service = new RequestsService(
        db,
        tracker,
        createMockAppSettings(),
        createMockLibrary(),
      );

      const result = await service.search('Book', 25, 0, 'user-1');

      expect(result.results[0].existingRequestIsMine).toBe(false);
    });

    it('prefers the caller’s own request when a torrent has several', async () => {
      const tracker = createMockTracker();
      tracker.search.mockResolvedValue({
        results: [buildTrackerResult({ id: 42 })],
        total: 1,
      });

      const db = createSequentialSelectDb([
        [
          {
            torrentId: '42',
            id: 'req-other',
            status: 'pending',
            userId: 'user-other',
          },
          {
            torrentId: '42',
            id: 'req-mine',
            status: 'pending',
            userId: 'user-1',
          },
        ],
      ]);
      const service = new RequestsService(
        db,
        tracker,
        createMockAppSettings(),
        createMockLibrary(),
      );

      const result = await service.search('Book', 25, 0, 'user-1');

      expect(result.results[0].existingRequestId).toBe('req-mine');
      expect(result.results[0].existingRequestIsMine).toBe(true);
    });

    it('sends categories [comics] for comics content type', async () => {
      const tracker = createMockTracker();
      tracker.search.mockResolvedValue({ results: [], total: 0 });

      const db = createSequentialSelectDb([]);
      const service = new RequestsService(
        db,
        tracker,
        createMockAppSettings(),
        createMockLibrary(),
      );

      await service.search('Book', 25, 0, 'user-1', 'comics');

      expect(tracker.search).toHaveBeenCalledWith(
        expect.objectContaining({ categories: ['comics'] }),
      );
    });

    it('marks a confirmed exact same-medium title as in library', async () => {
      const tracker = createMockTracker();
      tracker.search.mockResolvedValue({
        results: [
          buildTrackerResult({
            title: 'The Way of Kings',
            author: 'Brandon Sanderson',
            contentType: 'audiobook',
          }),
        ],
        total: 1,
      });

      const library = createMockLibrary();
      library.searchLibrary.mockResolvedValue({
        audiobooks: [
          {
            id: 'lib-ab-1',
            title: 'The Way of Kings',
            subtitle: null,
            coverUrl: null,
            coverUpdatedAt: null,
            authors: [{ id: 'p1', name: 'Brandon Sanderson' }],
            similarity: 1,
          },
        ],
        ebooks: [],
      });

      const db = createSequentialSelectDb([[]]);
      const service = new RequestsService(
        db,
        tracker,
        createMockAppSettings(),
        library,
      );

      const result = await service.search('Kings', 25, 0, 'user-1');

      expect(result.results[0].inLibrary).toBe(true);
      expect(result.results[0].libraryMatch).toBe('confirmed');
      expect(result.results[0].libraryItemId).toBe('lib-ab-1');
      expect(library.searchLibrary).toHaveBeenCalledWith(
        'The Way of Kings',
        'audiobooks',
        5,
      );
    });

    it('marks a non-exact library hit as a possible match', async () => {
      const tracker = createMockTracker();
      tracker.search.mockResolvedValue({
        results: [
          buildTrackerResult({
            title: 'Way of Kings',
            author: 'Brandon Sanderson',
            contentType: 'audiobook',
          }),
        ],
        total: 1,
      });

      const library = createMockLibrary();
      library.searchLibrary.mockResolvedValue({
        audiobooks: [
          {
            id: 'lib-ab-2',
            title: 'The Way of Kings',
            subtitle: null,
            coverUrl: null,
            coverUpdatedAt: null,
            authors: [{ id: 'p1', name: 'Brandon Sanderson' }],
            similarity: 0.8,
          },
        ],
        ebooks: [],
      });

      const db = createSequentialSelectDb([[]]);
      const service = new RequestsService(
        db,
        tracker,
        createMockAppSettings(),
        library,
      );

      const result = await service.search('Kings', 25, 0, 'user-1');

      expect(result.results[0].inLibrary).toBe(false);
      expect(result.results[0].libraryMatch).toBe('possible');
      expect(result.results[0].libraryItemId).toBeNull();
    });

    it('skips library matching for comics', async () => {
      const tracker = createMockTracker();
      tracker.search.mockResolvedValue({
        results: [
          buildTrackerResult({
            title: 'Sandman',
            contentType: 'comics',
            categoryId: 15,
            categoryName: 'Comics',
          }),
        ],
        total: 1,
      });

      const library = createMockLibrary();
      const db = createSequentialSelectDb([[]]);
      const service = new RequestsService(
        db,
        tracker,
        createMockAppSettings(),
        library,
      );

      const result = await service.search('Sandman', 25, 0, 'user-1', 'comics');

      expect(result.results[0].inLibrary).toBe(false);
      expect(result.results[0].libraryMatch).toBeNull();
      expect(result.results[0].libraryItemId).toBeNull();
      expect(library.searchLibrary).not.toHaveBeenCalled();
    });

    it('does not confirm exact title when torrent author is missing but library has one', async () => {
      const tracker = createMockTracker();
      tracker.search.mockResolvedValue({
        results: [
          buildTrackerResult({
            title: 'The Way of Kings',
            author: null,
            contentType: 'audiobook',
          }),
        ],
        total: 1,
      });

      const library = createMockLibrary();
      library.searchLibrary.mockResolvedValue({
        audiobooks: [
          {
            id: 'lib-ab-3',
            title: 'The Way of Kings',
            subtitle: null,
            coverUrl: null,
            coverUpdatedAt: null,
            authors: [{ id: 'p1', name: 'Brandon Sanderson' }],
            similarity: 1,
          },
        ],
        ebooks: [],
      });

      const db = createSequentialSelectDb([[]]);
      const service = new RequestsService(
        db,
        tracker,
        createMockAppSettings(),
        library,
      );

      const result = await service.search('Kings', 25, 0, 'user-1');

      expect(result.results[0].inLibrary).toBe(false);
      expect(result.results[0].libraryMatch).toBe('possible');
      expect(result.results[0].libraryItemId).toBeNull();
    });

    it('does not confirm exact title with a different author', async () => {
      const tracker = createMockTracker();
      tracker.search.mockResolvedValue({
        results: [
          buildTrackerResult({
            title: 'The Way of Kings',
            author: 'Someone Else',
            contentType: 'audiobook',
          }),
        ],
        total: 1,
      });

      const library = createMockLibrary();
      library.searchLibrary.mockResolvedValue({
        audiobooks: [
          {
            id: 'lib-ab-4',
            title: 'The Way of Kings',
            subtitle: null,
            coverUrl: null,
            coverUpdatedAt: null,
            authors: [{ id: 'p1', name: 'Brandon Sanderson' }],
            similarity: 1,
          },
        ],
        ebooks: [],
      });

      const db = createSequentialSelectDb([[]]);
      const service = new RequestsService(
        db,
        tracker,
        createMockAppSettings(),
        library,
      );

      const result = await service.search('Kings', 25, 0, 'user-1');

      expect(result.results[0].inLibrary).toBe(false);
      expect(result.results[0].libraryMatch).toBe('possible');
      expect(result.results[0].libraryItemId).toBeNull();
    });
  });
});
