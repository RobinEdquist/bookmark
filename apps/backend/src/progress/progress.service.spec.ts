import { NotFoundException } from '@nestjs/common';
import * as progressSchema from './schema';
import { ProgressService } from './progress.service';

function createMockDb(overrides: Record<string, any> = {}) {
  return {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    ...overrides,
  } as any;
}

describe('ProgressService', () => {
  describe('updateProgress', () => {
    it('uses onConflictDoUpdate to upsert progress', async () => {
      const now = new Date();
      const progressRow = {
        id: 'progress-1',
        userId: 'user-1',
        audiobookId: 'audiobook-1',
        currentPosition: 120,
        completed: false,
        completedAt: null,
        isHidden: false,
        startedAt: now,
        updatedAt: now,
      };

      const returning = jest.fn().mockResolvedValue([progressRow]);
      const onConflictDoUpdate = jest.fn().mockReturnValue({ returning });
      const values = jest.fn().mockReturnValue({ onConflictDoUpdate });
      const insert = jest.fn().mockReturnValue({ values });

      const selectQuery = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([{ duration: 3600 }]),
      };

      const db = createMockDb({
        insert,
        select: jest.fn().mockReturnValue(selectQuery),
      });

      const service = new ProgressService(db);
      await service.updateProgress('user-1', 'audiobook-1', { position: 120 });

      expect(insert).toHaveBeenCalledWith(progressSchema.userAudiobookProgress);
      expect(onConflictDoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          target: [
            progressSchema.userAudiobookProgress.userId,
            progressSchema.userAudiobookProgress.audiobookId,
          ],
        }),
      );
    });

    it('throws NotFoundException when audiobook does not exist', async () => {
      const selectQuery = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([]),
      };
      const db = createMockDb({
        select: jest.fn().mockReturnValue(selectQuery),
      });

      const service = new ProgressService(db);

      await expect(
        service.updateProgress('user-1', 'nonexistent', { position: 100 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('marks audiobook as completed when position is within 30 seconds of end', async () => {
      const now = new Date();
      const progressRow = {
        id: 'progress-1',
        userId: 'user-1',
        audiobookId: 'audiobook-1',
        currentPosition: 3580,
        completed: true,
        completedAt: now,
        isHidden: false,
        startedAt: now,
        updatedAt: now,
      };

      const returning = jest.fn().mockResolvedValue([progressRow]);
      const onConflictDoUpdate = jest.fn().mockReturnValue({ returning });
      const values = jest.fn().mockReturnValue({ onConflictDoUpdate });
      const insert = jest.fn().mockReturnValue({ values });

      const selectQuery = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([{ duration: 3600 }]),
      };

      const db = createMockDb({
        insert,
        select: jest.fn().mockReturnValue(selectQuery),
      });

      const service = new ProgressService(db);
      const result = await service.updateProgress('user-1', 'audiobook-1', {
        position: 3580,
      });

      // Verify the upsert set completed values
      const upsertCall = onConflictDoUpdate.mock.calls[0][0];
      expect(upsertCall.set.completed).toBe(true);
      expect(upsertCall.set.completedAt).toBeInstanceOf(Date);
      expect(result.completed).toBe(true);
    });
  });

  describe('createSession', () => {
    const baseDto = {
      startedAt: '2026-03-15T10:00:00Z',
      endedAt: '2026-03-15T10:05:00Z',
      startPosition: 100,
      endPosition: 400,
      durationSeconds: 300,
    };

    function buildSelectChain(result: any[]) {
      return {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(result),
      };
    }

    function buildInsertChain(result: any) {
      const returning = jest.fn().mockResolvedValue([result]);
      const values = jest.fn().mockReturnValue({ returning });
      const insert = jest.fn().mockReturnValue({ values });
      return { insert, values, returning };
    }

    function buildUpdateChain(result: any) {
      const returning = jest.fn().mockResolvedValue([result]);
      const where = jest.fn().mockReturnValue({ returning });
      const set = jest.fn().mockReturnValue({ where });
      const update = jest.fn().mockReturnValue({ set });
      return { update, set, where, returning };
    }

    it('creates a new session when no existing session found', async () => {
      const emptySelect = buildSelectChain([]);
      const { insert } = buildInsertChain({
        id: 'new-session',
        durationSeconds: 300,
      });

      // select is called twice (time-window, then position-overlap), both empty
      const selectFn = jest.fn().mockReturnValue(emptySelect);

      const db = createMockDb({ select: selectFn, insert });
      const service = new ProgressService(db);

      const result = await service.createSession('user-1', 'ab-1', baseDto);

      expect(result.id).toBe('new-session');
      expect(result.durationSeconds).toBe(300);
      expect(insert).toHaveBeenCalled();
    });

    it('merges with existing session within 10-minute time window', async () => {
      const existingSession = { id: 'existing-1', durationSeconds: 200 };
      const timeWindowSelect = buildSelectChain([existingSession]);

      const { update } = buildUpdateChain({
        id: 'existing-1',
        durationSeconds: 300,
      });

      const db = createMockDb({
        select: jest.fn().mockReturnValue(timeWindowSelect),
        update,
      });
      const service = new ProgressService(db);

      const result = await service.createSession('user-1', 'ab-1', baseDto);

      expect(result.id).toBe('existing-1');
      expect(result.durationSeconds).toBe(300);
      expect(update).toHaveBeenCalled();
    });

    it('merges with existing session when positions overlap on same day', async () => {
      const existingSession = { id: 'existing-2', durationSeconds: 150 };

      // First call (time-window): no match. Second call (position-overlap): match.
      const emptySelect = buildSelectChain([]);
      const overlapSelect = buildSelectChain([existingSession]);

      const selectFn = jest
        .fn()
        .mockReturnValueOnce(emptySelect)
        .mockReturnValueOnce(overlapSelect);

      const { update } = buildUpdateChain({
        id: 'existing-2',
        durationSeconds: 300,
      });

      const db = createMockDb({ select: selectFn, update });
      const service = new ProgressService(db);

      const result = await service.createSession('user-1', 'ab-1', baseDto);

      expect(result.id).toBe('existing-2');
      expect(result.durationSeconds).toBe(300);
      expect(update).toHaveBeenCalled();
    });

    it('does NOT merge sessions on different days even with position overlap', async () => {
      // Both selects return empty (time-window miss + position-overlap miss because different day)
      const emptySelect = buildSelectChain([]);
      const selectFn = jest.fn().mockReturnValue(emptySelect);

      const { insert } = buildInsertChain({
        id: 'new-session',
        durationSeconds: 300,
      });

      const db = createMockDb({ select: selectFn, insert });
      const service = new ProgressService(db);

      const result = await service.createSession('user-1', 'ab-1', baseDto);

      // Both selects returned empty, so a new session is created
      expect(result.id).toBe('new-session');
      expect(insert).toHaveBeenCalled();
      // select called twice: once for time-window, once for position-overlap
      expect(selectFn).toHaveBeenCalledTimes(2);
    });

    it('does NOT merge non-overlapping sessions on the same day', async () => {
      // Both selects return empty (no time-window match, no position overlap)
      const emptySelect = buildSelectChain([]);
      const selectFn = jest.fn().mockReturnValue(emptySelect);

      const { insert } = buildInsertChain({
        id: 'new-session',
        durationSeconds: 300,
      });

      const db = createMockDb({ select: selectFn, insert });
      const service = new ProgressService(db);

      const result = await service.createSession('user-1', 'ab-1', baseDto);

      expect(result.id).toBe('new-session');
      expect(insert).toHaveBeenCalled();
      expect(selectFn).toHaveBeenCalledTimes(2);
    });

    it('uses MAX of durations when merging via extendSession', async () => {
      // Existing session has a LARGER duration than the new one
      const existingSession = { id: 'existing-3', durationSeconds: 500 };
      const timeWindowSelect = buildSelectChain([existingSession]);

      const updateReturning = jest.fn().mockResolvedValue([
        {
          id: 'existing-3',
          durationSeconds: 500,
        },
      ]);
      const updateWhere = jest
        .fn()
        .mockReturnValue({ returning: updateReturning });
      const updateSet = jest.fn().mockReturnValue({ where: updateWhere });
      const update = jest.fn().mockReturnValue({ set: updateSet });

      const db = createMockDb({
        select: jest.fn().mockReturnValue(timeWindowSelect),
        update,
      });
      const service = new ProgressService(db);

      await service.createSession('user-1', 'ab-1', {
        ...baseDto,
        durationSeconds: 200, // smaller than existing 500
      });

      // Verify set was called with MAX(500, 200) = 500
      const setArg = updateSet.mock.calls[0][0];
      expect(setArg.durationSeconds).toBe(500);
    });
  });

  describe('getAllProgress - deduplication', () => {
    it('deduplicates results by audiobookId, keeping the most recent', async () => {
      const olderDate = new Date('2026-03-08T16:30:00Z');
      const newerDate = new Date('2026-03-08T16:31:00Z');

      // Simulate duplicate progress records from the database
      const duplicateResults = [
        {
          progress: {
            audiobookId: 'audiobook-1',
            currentPosition: 4000,
            completed: false,
            completedAt: null,
            startedAt: newerDate,
            updatedAt: newerDate,
          },
          audiobook: {
            id: 'audiobook-1',
            title: 'The Fellowship of the Ring',
            coverUrl: null,
            duration: 81501,
          },
        },
        {
          progress: {
            audiobookId: 'audiobook-1',
            currentPosition: 800,
            completed: false,
            completedAt: null,
            startedAt: olderDate,
            updatedAt: olderDate,
          },
          audiobook: {
            id: 'audiobook-1',
            title: 'The Fellowship of the Ring',
            coverUrl: null,
            duration: 81501,
          },
        },
      ];

      const selectQuery = {
        from: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue(duplicateResults),
      };

      const db = createMockDb({
        select: jest.fn().mockReturnValue(selectQuery),
      });

      const service = new ProgressService(db);
      const results = await service.getAllProgress('user-1');

      // Should return only 1 entry (deduplicated)
      expect(results).toHaveLength(1);
      // Should keep the most recently updated one (higher position)
      expect(results[0].position).toBe(4000);
      expect(results[0].updatedAt).toBe(newerDate.toISOString());
    });

    it('does not remove entries for different audiobooks', async () => {
      const now = new Date();
      const dbResults = [
        {
          progress: {
            audiobookId: 'audiobook-1',
            currentPosition: 120,
            completed: false,
            completedAt: null,
            startedAt: now,
            updatedAt: now,
          },
          audiobook: {
            id: 'audiobook-1',
            title: 'Book One',
            coverUrl: null,
            duration: 3600,
          },
        },
        {
          progress: {
            audiobookId: 'audiobook-2',
            currentPosition: 300,
            completed: false,
            completedAt: null,
            startedAt: now,
            updatedAt: now,
          },
          audiobook: {
            id: 'audiobook-2',
            title: 'Book Two',
            coverUrl: null,
            duration: 7200,
          },
        },
      ];

      const selectQuery = {
        from: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue(dbResults),
      };

      const db = createMockDb({
        select: jest.fn().mockReturnValue(selectQuery),
      });

      const service = new ProgressService(db);
      const results = await service.getAllProgress('user-1');

      expect(results).toHaveLength(2);
    });

    it('deduplicates three identical entries down to one', async () => {
      const dates = [
        new Date('2026-03-08T16:31:14Z'),
        new Date('2026-03-08T16:31:11Z'),
        new Date('2026-03-08T16:30:17Z'),
      ];

      // Reproduce the exact bug scenario from the user report
      const triplicateResults = dates.map((date, i) => ({
        progress: {
          audiobookId: 'e31fc6ce-0121-4938-8415-39955abe50dd',
          currentPosition: i === 2 ? 815 : 4075,
          completed: false,
          completedAt: null,
          startedAt: date,
          updatedAt: date,
        },
        audiobook: {
          id: 'e31fc6ce-0121-4938-8415-39955abe50dd',
          title: 'The Fellowship of the Ring',
          coverUrl: null,
          duration: 81501,
        },
      }));

      const selectQuery = {
        from: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue(triplicateResults),
      };

      const db = createMockDb({
        select: jest.fn().mockReturnValue(selectQuery),
      });

      const service = new ProgressService(db);
      const results = await service.getAllProgress('user-1');

      expect(results).toHaveLength(1);
      // Should keep the one with the latest updatedAt
      expect(results[0].updatedAt).toBe(dates[0].toISOString());
      expect(results[0].position).toBe(4075);
    });
  });

  describe('getProgress', () => {
    it('returns mapped progress when record exists', async () => {
      const now = new Date('2026-03-15T10:00:00Z');
      const completedAt = new Date('2026-03-14T08:00:00Z');

      const progressRow = {
        id: 'progress-1',
        userId: 'user-1',
        audiobookId: 'audiobook-1',
        currentPosition: 500,
        completed: true,
        completedAt,
        isHidden: false,
        startedAt: now,
        updatedAt: now,
      };

      const selectQuery = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([progressRow]),
      };

      const db = createMockDb({
        select: jest.fn().mockReturnValue(selectQuery),
      });

      const service = new ProgressService(db);
      const result = await service.getProgress('user-1', 'audiobook-1');

      expect(result).toEqual({
        audiobookId: 'audiobook-1',
        position: 500,
        completed: true,
        completedAt: completedAt.toISOString(),
        startedAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });
    });

    it('returns null when no progress record exists', async () => {
      const selectQuery = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([]),
      };

      const db = createMockDb({
        select: jest.fn().mockReturnValue(selectQuery),
      });

      const service = new ProgressService(db);
      const result = await service.getProgress('user-1', 'audiobook-1');

      expect(result).toBeNull();
    });

    it('returns completedAt as null when not completed', async () => {
      const now = new Date('2026-03-15T10:00:00Z');

      const progressRow = {
        id: 'progress-1',
        userId: 'user-1',
        audiobookId: 'audiobook-1',
        currentPosition: 120,
        completed: false,
        completedAt: null,
        isHidden: false,
        startedAt: now,
        updatedAt: now,
      };

      const selectQuery = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([progressRow]),
      };

      const db = createMockDb({
        select: jest.fn().mockReturnValue(selectQuery),
      });

      const service = new ProgressService(db);
      const result = await service.getProgress('user-1', 'audiobook-1');

      expect(result).not.toBeNull();
      expect(result!.completedAt).toBeNull();
      expect(result!.completed).toBe(false);
    });

    it('maps position from currentPosition field', async () => {
      const now = new Date();
      const progressRow = {
        id: 'progress-1',
        userId: 'user-1',
        audiobookId: 'audiobook-1',
        currentPosition: 9999,
        completed: false,
        completedAt: null,
        isHidden: false,
        startedAt: now,
        updatedAt: now,
      };

      const selectQuery = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([progressRow]),
      };

      const db = createMockDb({
        select: jest.fn().mockReturnValue(selectQuery),
      });

      const service = new ProgressService(db);
      const result = await service.getProgress('user-1', 'audiobook-1');

      expect(result!.position).toBe(9999);
    });

    it('queries the userAudiobookProgress table', async () => {
      const selectQuery = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([]),
      };

      const selectFn = jest.fn().mockReturnValue(selectQuery);
      const db = createMockDb({ select: selectFn });

      const service = new ProgressService(db);
      await service.getProgress('user-1', 'audiobook-1');

      expect(selectFn).toHaveBeenCalled();
      expect(selectQuery.from).toHaveBeenCalledWith(
        progressSchema.userAudiobookProgress,
      );
    });
  });

  describe('getListeningStats', () => {
    function buildStatsDb(overrides: {
      todayStats?: any[];
      weekStats?: any[];
      monthStats?: any[];
      allTimeStats?: any[];
      progressStats?: any[];
      allProgressResults?: any[];
    }) {
      const {
        todayStats = [{ duration: 0, sessions: 0 }],
        weekStats = [{ duration: 0, sessions: 0 }],
        monthStats = [{ duration: 0, sessions: 0 }],
        allTimeStats = [{ duration: 0 }],
        progressStats = [{ started: 0, completed: 0 }],
        allProgressResults = [],
      } = overrides;

      // getListeningStats runs 5 selects via Promise.all, then getAllProgress
      // runs its own select. The Promise.all queries resolve via .from().where(),
      // while getAllProgress uses .from().innerJoin().where().orderBy().
      const selectCalls = [
        todayStats,
        weekStats,
        monthStats,
        allTimeStats,
        progressStats,
        allProgressResults,
      ];

      let callIndex = 0;
      const selectFn = jest.fn().mockImplementation(() => {
        const idx = callIndex++;
        const result = selectCalls[idx] ?? [];

        // Build a chain object that supports both patterns:
        // .from().where() and .from().innerJoin().where().orderBy()
        const chain: any = {};
        chain.from = jest.fn().mockReturnValue(chain);
        chain.innerJoin = jest.fn().mockReturnValue(chain);
        chain.where = jest.fn().mockReturnValue(chain);
        chain.orderBy = jest.fn().mockResolvedValue(result);

        // For the simple .from().where() pattern (first 5 calls),
        // where() must resolve directly to the result
        if (idx < 5) {
          chain.where = jest.fn().mockResolvedValue(result);
        }

        return chain;
      });

      return createMockDb({ select: selectFn });
    }

    it('returns correct structure with all zero stats', async () => {
      const db = buildStatsDb({});
      const service = new ProgressService(db);
      const stats = await service.getListeningStats('user-1');

      expect(stats).toEqual({
        today: { durationSeconds: 0, sessionsCount: 0 },
        thisWeek: { durationSeconds: 0, sessionsCount: 0 },
        thisMonth: { durationSeconds: 0, sessionsCount: 0 },
        allTime: {
          durationSeconds: 0,
          audiobooksStarted: 0,
          audiobooksCompleted: 0,
        },
        recentlyPlayed: [],
      });
    });

    it('maps today stats from first query result', async () => {
      const db = buildStatsDb({
        todayStats: [{ duration: 3600, sessions: 5 }],
      });
      const service = new ProgressService(db);
      const stats = await service.getListeningStats('user-1');

      expect(stats.today.durationSeconds).toBe(3600);
      expect(stats.today.sessionsCount).toBe(5);
    });

    it('maps week stats from second query result', async () => {
      const db = buildStatsDb({
        weekStats: [{ duration: 14400, sessions: 12 }],
      });
      const service = new ProgressService(db);
      const stats = await service.getListeningStats('user-1');

      expect(stats.thisWeek.durationSeconds).toBe(14400);
      expect(stats.thisWeek.sessionsCount).toBe(12);
    });

    it('maps month stats from third query result', async () => {
      const db = buildStatsDb({
        monthStats: [{ duration: 86400, sessions: 50 }],
      });
      const service = new ProgressService(db);
      const stats = await service.getListeningStats('user-1');

      expect(stats.thisMonth.durationSeconds).toBe(86400);
      expect(stats.thisMonth.sessionsCount).toBe(50);
    });

    it('maps allTime stats including audiobooks started and completed', async () => {
      const db = buildStatsDb({
        allTimeStats: [{ duration: 360000 }],
        progressStats: [{ started: 10, completed: 3 }],
      });
      const service = new ProgressService(db);
      const stats = await service.getListeningStats('user-1');

      expect(stats.allTime.durationSeconds).toBe(360000);
      expect(stats.allTime.audiobooksStarted).toBe(10);
      expect(stats.allTime.audiobooksCompleted).toBe(3);
    });

    it('filters out completed audiobooks from recentlyPlayed', async () => {
      const now = new Date('2026-03-15T10:00:00Z');

      const db = buildStatsDb({});
      const service = new ProgressService(db);

      // Spy on getAllProgress to return controlled data
      jest.spyOn(service, 'getAllProgress').mockResolvedValue([
        {
          audiobookId: 'ab-1',
          position: 500,
          completed: true,
          completedAt: now.toISOString(),
          startedAt: now.toISOString(),
          updatedAt: now.toISOString(),
          audiobook: {
            id: 'ab-1',
            title: 'Completed Book',
            coverUrl: null,
            duration: 500,
          },
          progressPercent: 100,
        },
        {
          audiobookId: 'ab-2',
          position: 100,
          completed: false,
          completedAt: null,
          startedAt: now.toISOString(),
          updatedAt: now.toISOString(),
          audiobook: {
            id: 'ab-2',
            title: 'In Progress Book',
            coverUrl: null,
            duration: 1000,
          },
          progressPercent: 10,
        },
      ]);

      const stats = await service.getListeningStats('user-1');

      // Completed books are filtered out of recentlyPlayed
      expect(stats.recentlyPlayed).toHaveLength(1);
      expect(stats.recentlyPlayed[0].audiobookId).toBe('ab-2');
    });

    it('limits recentlyPlayed to 5 items', async () => {
      const now = new Date('2026-03-15T10:00:00Z');

      const db = buildStatsDb({});
      const service = new ProgressService(db);

      // Spy on getAllProgress to return 8 in-progress items
      jest.spyOn(service, 'getAllProgress').mockResolvedValue(
        Array.from({ length: 8 }, (_, i) => ({
          audiobookId: `ab-${i}`,
          position: 100,
          completed: false,
          completedAt: null,
          startedAt: now.toISOString(),
          updatedAt: now.toISOString(),
          audiobook: {
            id: `ab-${i}`,
            title: `Book ${i}`,
            coverUrl: null,
            duration: 1000,
          },
          progressPercent: 10,
        })),
      );

      const stats = await service.getListeningStats('user-1');

      expect(stats.recentlyPlayed.length).toBeLessThanOrEqual(5);
    });

    it('converts string duration values to numbers', async () => {
      // SQL aggregates sometimes return strings
      const db = buildStatsDb({
        todayStats: [{ duration: '1800', sessions: 3 }],
        allTimeStats: [{ duration: '99999' }],
      });
      const service = new ProgressService(db);
      const stats = await service.getListeningStats('user-1');

      expect(stats.today.durationSeconds).toBe(1800);
      expect(stats.allTime.durationSeconds).toBe(99999);
    });
  });

  describe('resetProgress', () => {
    it('deletes the progress record successfully', async () => {
      const where = jest.fn().mockResolvedValue({ rowCount: 1 });
      const deleteFn = jest.fn().mockReturnValue({ where });

      const db = createMockDb({ delete: deleteFn });
      const service = new ProgressService(db);

      await expect(
        service.resetProgress('user-1', 'audiobook-1'),
      ).resolves.toBeUndefined();

      expect(deleteFn).toHaveBeenCalledWith(
        progressSchema.userAudiobookProgress,
      );
    });

    it('throws NotFoundException when rowCount is 0', async () => {
      const where = jest.fn().mockResolvedValue({ rowCount: 0 });
      const deleteFn = jest.fn().mockReturnValue({ where });

      const db = createMockDb({ delete: deleteFn });
      const service = new ProgressService(db);

      await expect(
        service.resetProgress('user-1', 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException with correct message', async () => {
      const where = jest.fn().mockResolvedValue({ rowCount: 0 });
      const deleteFn = jest.fn().mockReturnValue({ where });

      const db = createMockDb({ delete: deleteFn });
      const service = new ProgressService(db);

      await expect(
        service.resetProgress('user-1', 'nonexistent'),
      ).rejects.toThrow('Progress record not found');
    });

    it('returns void on success (no return value)', async () => {
      const where = jest.fn().mockResolvedValue({ rowCount: 1 });
      const deleteFn = jest.fn().mockReturnValue({ where });

      const db = createMockDb({ delete: deleteFn });
      const service = new ProgressService(db);

      const result = await service.resetProgress('user-1', 'audiobook-1');
      expect(result).toBeUndefined();
    });
  });

  describe('hideProgress', () => {
    it('sets isHidden to true on the progress record', async () => {
      const where = jest.fn().mockResolvedValue({ rowCount: 1 });
      const set = jest.fn().mockReturnValue({ where });
      const update = jest.fn().mockReturnValue({ set });

      const db = createMockDb({ update });
      const service = new ProgressService(db);

      await service.hideProgress('user-1', 'audiobook-1');

      expect(update).toHaveBeenCalledWith(progressSchema.userAudiobookProgress);
      expect(set).toHaveBeenCalledWith({ isHidden: true });
    });

    it('throws NotFoundException when rowCount is 0', async () => {
      const where = jest.fn().mockResolvedValue({ rowCount: 0 });
      const set = jest.fn().mockReturnValue({ where });
      const update = jest.fn().mockReturnValue({ set });

      const db = createMockDb({ update });
      const service = new ProgressService(db);

      await expect(
        service.hideProgress('user-1', 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException with correct message', async () => {
      const where = jest.fn().mockResolvedValue({ rowCount: 0 });
      const set = jest.fn().mockReturnValue({ where });
      const update = jest.fn().mockReturnValue({ set });

      const db = createMockDb({ update });
      const service = new ProgressService(db);

      await expect(
        service.hideProgress('user-1', 'nonexistent'),
      ).rejects.toThrow('Progress record not found');
    });

    it('returns void on success', async () => {
      const where = jest.fn().mockResolvedValue({ rowCount: 1 });
      const set = jest.fn().mockReturnValue({ where });
      const update = jest.fn().mockReturnValue({ set });

      const db = createMockDb({ update });
      const service = new ProgressService(db);

      const result = await service.hideProgress('user-1', 'audiobook-1');
      expect(result).toBeUndefined();
    });

    it('succeeds when rowCount is greater than 0', async () => {
      const where = jest.fn().mockResolvedValue({ rowCount: 2 });
      const set = jest.fn().mockReturnValue({ where });
      const update = jest.fn().mockReturnValue({ set });

      const db = createMockDb({ update });
      const service = new ProgressService(db);

      await expect(
        service.hideProgress('user-1', 'audiobook-1'),
      ).resolves.toBeUndefined();
    });
  });
});
