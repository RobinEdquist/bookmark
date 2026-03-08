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
});
