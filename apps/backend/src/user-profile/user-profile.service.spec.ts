import { NotFoundException } from '@nestjs/common';
import { UserProfileService } from './user-profile.service';

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
    'innerJoin',
    'leftJoin',
    'groupBy',
    'returning',
    'set',
    'values',
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

const USER_ID = 'user-1';

const mockUser = {
  id: USER_ID,
  name: 'Test User',
  email: 'test@example.com',
  image: null,
  role: 'user',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

function createMockCoverService() {
  return {
    getCoverUrl: jest
      .fn()
      .mockImplementation(
        (id: string, _coverUrl: any, _coverSource: any, apiPath: string) =>
          `/api/${apiPath}/${id}/cover`,
      ),
  } as any;
}

function createMockAppSettings() {
  return {
    getMetadataPriority: jest.fn().mockResolvedValue({
      title: ['embedded', 'hardcover'],
      author: ['embedded', 'hardcover'],
      description: ['embedded', 'hardcover'],
      cover: ['embedded', 'hardcover'],
    }),
  } as any;
}

/**
 * Set up db.select mock calls for getStats.
 * getStats issues 5 select calls:
 *   1. user info
 *   2. total listening time
 *   3. audiobook progress counts
 *   4. ebook progress counts
 *   5. computeStreaks -> listening session dates
 *
 * All 5 are launched concurrently via Promise.all, so they are configured
 * sequentially on the mock (the JS event loop resolves them in order).
 */
function setupGetStatsMocks(
  db: any,
  opts: {
    user?: any;
    totalListening?: number;
    audiobookCompleted?: number;
    audiobookInProgress?: number;
    ebookCompleted?: number;
    ebookInProgress?: number;
    streakDates?: string[];
  },
) {
  const {
    user = mockUser,
    totalListening = 0,
    audiobookCompleted = 0,
    audiobookInProgress = 0,
    ebookCompleted = 0,
    ebookInProgress = 0,
    streakDates = [],
  } = opts;

  // 1. user info
  db.select.mockReturnValueOnce(chainMock(user ? [user] : []));
  // 2. total listening time
  db.select.mockReturnValueOnce(chainMock([{ total: totalListening }]));
  // 3. audiobook progress counts
  db.select.mockReturnValueOnce(
    chainMock([
      { completed: audiobookCompleted, inProgress: audiobookInProgress },
    ]),
  );
  // 4. ebook progress counts
  db.select.mockReturnValueOnce(
    chainMock([{ completed: ebookCompleted, inProgress: ebookInProgress }]),
  );
  // 5. computeStreaks -> dates
  db.select.mockReturnValueOnce(
    chainMock(streakDates.map((d) => ({ date: d }))),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UserProfileService', () => {
  let coverService: ReturnType<typeof createMockCoverService>;
  let appSettings: ReturnType<typeof createMockAppSettings>;

  beforeEach(() => {
    coverService = createMockCoverService();
    appSettings = createMockAppSettings();
  });

  // -----------------------------------------------------------------------
  // getStats
  // -----------------------------------------------------------------------
  describe('getStats', () => {
    it('returns aggregated stats for a user', async () => {
      const db = createMockDb();
      setupGetStatsMocks(db, {
        totalListening: 7200,
        audiobookCompleted: 3,
        audiobookInProgress: 2,
        ebookCompleted: 1,
        ebookInProgress: 4,
      });
      const service = new UserProfileService(db, coverService, appSettings);

      const result = await service.getStats(USER_ID);

      expect(result.user.id).toBe(USER_ID);
      expect(result.user.name).toBe('Test User');
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.createdAt).toBe('2026-01-01T00:00:00.000Z');
      expect(result.totalListeningTime).toBe(7200);
      expect(result.audiobooksCompleted).toBe(3);
      expect(result.audiobooksInProgress).toBe(2);
      expect(result.ebooksCompleted).toBe(1);
      expect(result.ebooksInProgress).toBe(4);
    });

    it('throws NotFoundException when user not found', async () => {
      const db = createMockDb();
      setupGetStatsMocks(db, { user: null });
      const service = new UserProfileService(db, coverService, appSettings);

      await expect(service.getStats('nonexistent')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns zero stats when user has no activity', async () => {
      const db = createMockDb();
      setupGetStatsMocks(db, {});
      const service = new UserProfileService(db, coverService, appSettings);

      const result = await service.getStats(USER_ID);

      expect(result.totalListeningTime).toBe(0);
      expect(result.audiobooksCompleted).toBe(0);
      expect(result.audiobooksInProgress).toBe(0);
      expect(result.ebooksCompleted).toBe(0);
      expect(result.ebooksInProgress).toBe(0);
      expect(result.longestStreak).toBe(0);
      expect(result.currentStreak).toBe(0);
    });

    it('handles null image and role gracefully', async () => {
      const db = createMockDb();
      setupGetStatsMocks(db, {
        user: { ...mockUser, image: null, role: null },
      });
      const service = new UserProfileService(db, coverService, appSettings);

      const result = await service.getStats(USER_ID);

      expect(result.user.image).toBeNull();
      expect(result.user.role).toBeNull();
    });

    it('converts numeric string results to numbers', async () => {
      const db = createMockDb();
      // Some DBs return string-typed numbers for aggregates
      setupGetStatsMocks(db, {
        totalListening: '3600' as any,
        audiobookCompleted: '5' as any,
        audiobookInProgress: '2' as any,
        ebookCompleted: '1' as any,
        ebookInProgress: '3' as any,
      });
      const service = new UserProfileService(db, coverService, appSettings);

      const result = await service.getStats(USER_ID);

      expect(result.totalListeningTime).toBe(3600);
      expect(result.audiobooksCompleted).toBe(5);
      expect(result.audiobooksInProgress).toBe(2);
      expect(result.ebooksCompleted).toBe(1);
      expect(result.ebooksInProgress).toBe(3);
    });
  });

  // -----------------------------------------------------------------------
  // getStats -> computeStreaks (tested via getStats)
  // -----------------------------------------------------------------------
  describe('computeStreaks (via getStats)', () => {
    it('returns 0 streaks when no listening sessions', async () => {
      const db = createMockDb();
      setupGetStatsMocks(db, { streakDates: [] });
      const service = new UserProfileService(db, coverService, appSettings);

      const result = await service.getStats(USER_ID);

      expect(result.longestStreak).toBe(0);
      expect(result.currentStreak).toBe(0);
    });

    it('computes a single-day streak', async () => {
      const today = new Date().toISOString().split('T')[0];
      const db = createMockDb();
      setupGetStatsMocks(db, { streakDates: [today] });
      const service = new UserProfileService(db, coverService, appSettings);

      const result = await service.getStats(USER_ID);

      expect(result.longestStreak).toBe(1);
      expect(result.currentStreak).toBe(1);
    });

    it('computes consecutive day streaks', async () => {
      const today = new Date();
      const dates: string[] = [];
      for (let i = 4; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().split('T')[0]);
      }

      const db = createMockDb();
      setupGetStatsMocks(db, { streakDates: dates });
      const service = new UserProfileService(db, coverService, appSettings);

      const result = await service.getStats(USER_ID);

      expect(result.longestStreak).toBe(5);
      expect(result.currentStreak).toBe(5);
    });

    it('detects broken current streak when last date is old', async () => {
      // Dates from 2 weeks ago, not recent enough
      const db = createMockDb();
      setupGetStatsMocks(db, {
        streakDates: ['2025-01-01', '2025-01-02', '2025-01-03'],
      });
      const service = new UserProfileService(db, coverService, appSettings);

      const result = await service.getStats(USER_ID);

      expect(result.longestStreak).toBe(3);
      expect(result.currentStreak).toBe(0);
    });

    it('handles gap in dates for longest streak calculation', async () => {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      // Two separate streaks: 3 old consecutive days + 2 recent days
      const db = createMockDb();
      setupGetStatsMocks(db, {
        streakDates: [
          '2025-06-01',
          '2025-06-02',
          '2025-06-03',
          yesterdayStr,
          todayStr,
        ],
      });
      const service = new UserProfileService(db, coverService, appSettings);

      const result = await service.getStats(USER_ID);

      expect(result.longestStreak).toBe(3);
      expect(result.currentStreak).toBe(2);
    });

    it('counts current streak when last day is yesterday', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      const dayBefore = new Date(yesterday);
      dayBefore.setDate(dayBefore.getDate() - 1);
      const dayBeforeStr = dayBefore.toISOString().split('T')[0];

      const db = createMockDb();
      setupGetStatsMocks(db, {
        streakDates: [dayBeforeStr, yesterdayStr],
      });
      const service = new UserProfileService(db, coverService, appSettings);

      const result = await service.getStats(USER_ID);

      expect(result.currentStreak).toBe(2);
      expect(result.longestStreak).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // getActivity
  // -----------------------------------------------------------------------
  describe('getActivity', () => {
    it('returns daily listening data for the given year', async () => {
      const daysResult = [
        { date: '2026-01-10', total: '1800' },
        { date: '2026-01-11', total: '3600' },
      ];

      const selectChain = chainMock(daysResult);
      const select = jest.fn().mockReturnValue(selectChain);
      const db = createMockDb({ select });
      const service = new UserProfileService(db, coverService, appSettings);

      const result = await service.getActivity(USER_ID, 2026);

      expect(result.days).toEqual({
        '2026-01-10': 1800,
        '2026-01-11': 3600,
      });
    });

    it('returns empty days when no activity exists', async () => {
      const selectChain = chainMock([]);
      const select = jest.fn().mockReturnValue(selectChain);
      const db = createMockDb({ select });
      const service = new UserProfileService(db, coverService, appSettings);

      const result = await service.getActivity(USER_ID, 2026);

      expect(result.days).toEqual({});
    });

    it('converts string totals to numbers', async () => {
      const daysResult = [{ date: '2026-03-15', total: '900' }];
      const selectChain = chainMock(daysResult);
      const select = jest.fn().mockReturnValue(selectChain);
      const db = createMockDb({ select });
      const service = new UserProfileService(db, coverService, appSettings);

      const result = await service.getActivity(USER_ID, 2026);

      expect(result.days['2026-03-15']).toBe(900);
    });
  });

  // -----------------------------------------------------------------------
  // getLibraryProgress
  // -----------------------------------------------------------------------
  describe('getLibraryProgress', () => {
    /**
     * getLibraryProgress has many DB calls. We test basic shapes and sorting
     * by returning empty arrays from metadata queries.
     */

    function setupLibraryProgressMocks(
      db: any,
      audiobookRows: any[],
      ebookRows: any[],
    ) {
      let callCount = 0;
      db.select.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Audiobook progress query
          return chainMock(audiobookRows);
        }
        if (callCount === 2) {
          // Ebook progress query
          return chainMock(ebookRows);
        }
        // Metadata queries (hardcover links, goodreads links, etc.)
        return chainMock([]);
      });
    }

    it('returns empty items when user has no progress', async () => {
      const db = createMockDb();
      setupLibraryProgressMocks(db, [], []);
      const service = new UserProfileService(db, coverService, appSettings);

      const result = await service.getLibraryProgress(
        USER_ID,
        20,
        0,
        'all',
        'all',
        'recent',
      );

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('returns audiobook progress items', async () => {
      const now = new Date('2026-01-15T12:00:00.000Z');
      const audiobookRows = [
        {
          id: 'ab-1',
          title: 'Book One',
          manualFields: [],
          coverUrl: 'cover.jpg',
          coverSource: 'embedded',
          duration: 3600,
          authorName: 'Author A',
          currentPosition: 1800,
          completed: false,
          completedAt: null,
          startedAt: now,
          updatedAt: now,
        },
      ];

      const db = createMockDb();
      setupLibraryProgressMocks(db, audiobookRows, []);
      const service = new UserProfileService(db, coverService, appSettings);

      const result = await service.getLibraryProgress(
        USER_ID,
        20,
        0,
        'audiobook',
        'all',
        'recent',
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0].type).toBe('audiobook');
      expect(result.items[0].title).toBe('Book One');
      expect(result.items[0].progressPercent).toBe(50);
      expect(result.items[0].coverUrl).toBe('/api/audiobooks/ab-1/cover');
    });

    it('returns ebook progress items', async () => {
      const now = new Date('2026-01-15T12:00:00.000Z');
      const ebookRows = [
        {
          id: 'eb-1',
          title: 'Ebook One',
          manualFields: [],
          coverUrl: 'cover.jpg',
          coverSource: 'embedded',
          authorName: 'Author B',
          progressPercent: 75,
          completed: false,
          completedAt: null,
          startedAt: now,
          updatedAt: now,
        },
      ];

      // When type='ebook', the audiobook query is skipped entirely.
      // Call 1 is the ebook progress query; subsequent calls are metadata queries.
      const db = createMockDb();
      let callCount = 0;
      db.select.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return chainMock(ebookRows);
        return chainMock([]);
      });
      const service = new UserProfileService(db, coverService, appSettings);

      const result = await service.getLibraryProgress(
        USER_ID,
        20,
        0,
        'ebook',
        'all',
        'recent',
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0].type).toBe('ebook');
      expect(result.items[0].title).toBe('Ebook One');
      expect(result.items[0].progressPercent).toBe(75);
      expect(result.items[0].coverUrl).toBe('/api/ebooks/eb-1/cover');
    });

    it('sorts items by title when sort=title', async () => {
      const now = new Date('2026-01-15T12:00:00.000Z');
      const audiobookRows = [
        {
          id: 'ab-1',
          title: 'Zebra Book',
          manualFields: [],
          coverUrl: null,
          coverSource: null,
          duration: 3600,
          authorName: null,
          currentPosition: 1800,
          completed: false,
          completedAt: null,
          startedAt: now,
          updatedAt: now,
        },
        {
          id: 'ab-2',
          title: 'Alpha Book',
          manualFields: [],
          coverUrl: null,
          coverSource: null,
          duration: 3600,
          authorName: null,
          currentPosition: 1800,
          completed: false,
          completedAt: null,
          startedAt: now,
          updatedAt: now,
        },
      ];

      const db = createMockDb();
      setupLibraryProgressMocks(db, audiobookRows, []);
      const service = new UserProfileService(db, coverService, appSettings);

      const result = await service.getLibraryProgress(
        USER_ID,
        20,
        0,
        'audiobook',
        'all',
        'title',
      );

      expect(result.items[0].title).toBe('Alpha Book');
      expect(result.items[1].title).toBe('Zebra Book');
    });

    it('sorts items by progress when sort=progress', async () => {
      const now = new Date('2026-01-15T12:00:00.000Z');
      const audiobookRows = [
        {
          id: 'ab-1',
          title: 'Low Progress',
          manualFields: [],
          coverUrl: null,
          coverSource: null,
          duration: 10000,
          authorName: null,
          currentPosition: 1000,
          completed: false,
          completedAt: null,
          startedAt: now,
          updatedAt: now,
        },
        {
          id: 'ab-2',
          title: 'High Progress',
          manualFields: [],
          coverUrl: null,
          coverSource: null,
          duration: 10000,
          authorName: null,
          currentPosition: 9000,
          completed: false,
          completedAt: null,
          startedAt: now,
          updatedAt: now,
        },
      ];

      const db = createMockDb();
      setupLibraryProgressMocks(db, audiobookRows, []);
      const service = new UserProfileService(db, coverService, appSettings);

      const result = await service.getLibraryProgress(
        USER_ID,
        20,
        0,
        'audiobook',
        'all',
        'progress',
      );

      expect(result.items[0].title).toBe('High Progress');
      expect(result.items[1].title).toBe('Low Progress');
    });

    it('paginates results', async () => {
      const now = new Date('2026-01-15T12:00:00.000Z');
      const audiobookRows = Array.from({ length: 5 }, (_, i) => ({
        id: `ab-${i}`,
        title: `Book ${i}`,
        manualFields: [],
        coverUrl: null,
        coverSource: null,
        duration: 3600,
        authorName: null,
        currentPosition: 1800,
        completed: false,
        completedAt: null,
        startedAt: now,
        updatedAt: new Date(now.getTime() - i * 1000),
      }));

      const db = createMockDb();
      setupLibraryProgressMocks(db, audiobookRows, []);
      const service = new UserProfileService(db, coverService, appSettings);

      const result = await service.getLibraryProgress(
        USER_ID,
        2,
        0,
        'audiobook',
        'all',
        'recent',
      );

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(5);
    });

    it('filters out barely-started audiobooks (currentPosition <= 300)', async () => {
      const now = new Date('2026-01-15T12:00:00.000Z');
      const audiobookRows = [
        {
          id: 'ab-1',
          title: 'Barely Started',
          manualFields: [],
          coverUrl: null,
          coverSource: null,
          duration: 3600,
          authorName: null,
          currentPosition: 100,
          completed: false,
          completedAt: null,
          startedAt: now,
          updatedAt: now,
        },
        {
          id: 'ab-2',
          title: 'Well Started',
          manualFields: [],
          coverUrl: null,
          coverSource: null,
          duration: 3600,
          authorName: null,
          currentPosition: 500,
          completed: false,
          completedAt: null,
          startedAt: now,
          updatedAt: now,
        },
      ];

      const db = createMockDb();
      setupLibraryProgressMocks(db, audiobookRows, []);
      const service = new UserProfileService(db, coverService, appSettings);

      const result = await service.getLibraryProgress(
        USER_ID,
        20,
        0,
        'audiobook',
        'all',
        'recent',
      );

      // Only the book with currentPosition > 300 should remain
      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe('Well Started');
    });

    it('deduplicates items by type:id keeping most recent', async () => {
      const older = new Date('2026-01-10T12:00:00.000Z');
      const newer = new Date('2026-01-15T12:00:00.000Z');
      const audiobookRows = [
        {
          id: 'ab-1',
          title: 'Book One Old',
          manualFields: [],
          coverUrl: null,
          coverSource: null,
          duration: 3600,
          authorName: null,
          currentPosition: 500,
          completed: false,
          completedAt: null,
          startedAt: older,
          updatedAt: older,
        },
        {
          id: 'ab-1',
          title: 'Book One New',
          manualFields: [],
          coverUrl: null,
          coverSource: null,
          duration: 3600,
          authorName: null,
          currentPosition: 1000,
          completed: false,
          completedAt: null,
          startedAt: older,
          updatedAt: newer,
        },
      ];

      const db = createMockDb();
      setupLibraryProgressMocks(db, audiobookRows, []);
      const service = new UserProfileService(db, coverService, appSettings);

      const result = await service.getLibraryProgress(
        USER_ID,
        20,
        0,
        'audiobook',
        'all',
        'recent',
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0].updatedAt).toBe('2026-01-15T12:00:00.000Z');
    });
  });

  // -----------------------------------------------------------------------
  // getListeningHistory
  // -----------------------------------------------------------------------
  describe('getListeningHistory', () => {
    function setupListeningHistoryMocks(
      db: any,
      sessions: any[],
      totalCount: number,
    ) {
      let callCount = 0;
      db.select.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Sessions query
          return chainMock(sessions);
        }
        if (callCount === 2) {
          // Count query
          return chainMock([{ count: totalCount }]);
        }
        // Metadata queries
        return chainMock([]);
      });
    }

    it('returns empty history when no sessions exist', async () => {
      const db = createMockDb();
      setupListeningHistoryMocks(db, [], 0);
      const service = new UserProfileService(db, coverService, appSettings);

      const result = await service.getListeningHistory(USER_ID, 20, 0);

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('returns listening history with session data', async () => {
      const startedAt = new Date('2026-01-15T10:00:00.000Z');
      const endedAt = new Date('2026-01-15T10:30:00.000Z');
      const sessions = [
        {
          id: 'session-1',
          audiobookId: 'ab-1',
          audiobookTitle: 'Test Book',
          manualFields: [],
          coverUrl: 'cover.jpg',
          coverSource: 'embedded',
          authorName: 'Author A',
          durationSeconds: 1800,
          startPosition: 0,
          endPosition: 1800,
          startedAt,
          endedAt,
        },
      ];

      const db = createMockDb();
      setupListeningHistoryMocks(db, sessions, 1);
      const service = new UserProfileService(db, coverService, appSettings);

      const result = await service.getListeningHistory(USER_ID, 20, 0);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].audiobookTitle).toBe('Test Book');
      expect(result.items[0].durationSeconds).toBe(1800);
      expect(result.items[0].startedAt).toBe('2026-01-15T10:00:00.000Z');
      expect(result.items[0].endedAt).toBe('2026-01-15T10:30:00.000Z');
      expect(result.items[0].coverUrl).toBe('/api/audiobooks/ab-1/cover');
      expect(result.total).toBe(1);
    });

    it('handles null audiobookTitle as Unknown audiobook', async () => {
      const startedAt = new Date('2026-01-15T10:00:00.000Z');
      const endedAt = new Date('2026-01-15T10:30:00.000Z');
      const sessions = [
        {
          id: 'session-1',
          audiobookId: 'ab-1',
          audiobookTitle: null,
          manualFields: [],
          coverUrl: null,
          coverSource: null,
          authorName: null,
          durationSeconds: 300,
          startPosition: 0,
          endPosition: 300,
          startedAt,
          endedAt,
        },
      ];

      const db = createMockDb();
      setupListeningHistoryMocks(db, sessions, 1);
      const service = new UserProfileService(db, coverService, appSettings);

      const result = await service.getListeningHistory(USER_ID, 20, 0);

      expect(result.items[0].audiobookTitle).toBe('Unknown audiobook');
    });
  });

  // -----------------------------------------------------------------------
  // resolveFieldByPriority (private, tested indirectly via getLibraryProgress)
  // -----------------------------------------------------------------------
  describe('resolveFieldByPriority (via getLibraryProgress)', () => {
    it('uses embedded title by default', async () => {
      const now = new Date('2026-01-15T12:00:00.000Z');
      const audiobookRows = [
        {
          id: 'ab-1',
          title: 'Embedded Title',
          manualFields: [],
          coverUrl: null,
          coverSource: null,
          duration: 3600,
          authorName: 'Embedded Author',
          currentPosition: 1800,
          completed: false,
          completedAt: null,
          startedAt: now,
          updatedAt: now,
        },
      ];

      const db = createMockDb();
      let callCount = 0;
      db.select.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return chainMock(audiobookRows);
        return chainMock([]);
      });
      const service = new UserProfileService(db, coverService, appSettings);

      const result = await service.getLibraryProgress(
        USER_ID,
        20,
        0,
        'audiobook',
        'all',
        'recent',
      );

      expect(result.items[0].title).toBe('Embedded Title');
      expect(result.items[0].authorName).toBe('Embedded Author');
    });
  });
});
