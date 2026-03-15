import { NotFoundException } from '@nestjs/common';
import * as ebookProgressSchema from './schema';

import { EbookProgressService } from './ebook-progress.service';

function createMockDb(overrides: Record<string, any> = {}) {
  return {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    ...overrides,
  } as any;
}

const now = new Date('2026-03-15T12:00:00Z');
const earlier = new Date('2026-03-10T08:00:00Z');

function makeProgressRow(overrides: Record<string, any> = {}) {
  return {
    ebookId: 'ebook-1',
    userId: 'user-1',
    cfi: '/6/4[chap01ref]!/4/2/10/2:91',
    progressPercent: 42,
    completed: false,
    completedAt: null,
    isHidden: false,
    startedAt: earlier,
    updatedAt: now,
    ...overrides,
  };
}

describe('EbookProgressService', () => {
  describe('getProgress', () => {
    it('returns mapped progress when record exists', async () => {
      const row = makeProgressRow();
      const selectQuery = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([row]),
      };
      const db = createMockDb({
        select: jest.fn().mockReturnValue(selectQuery),
      });

      const service = new EbookProgressService(db);
      const result = await service.getProgress('user-1', 'ebook-1');

      expect(result).toEqual({
        ebookId: 'ebook-1',
        cfi: row.cfi,
        progressPercent: 42,
        completed: false,
        completedAt: null,
        startedAt: earlier.toISOString(),
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

      const service = new EbookProgressService(db);
      const result = await service.getProgress('user-1', 'ebook-1');

      expect(result).toBeNull();
    });

    it('converts completedAt date to ISO string when present', async () => {
      const completedAt = new Date('2026-03-14T20:00:00Z');
      const row = makeProgressRow({
        completed: true,
        completedAt,
        progressPercent: 100,
      });
      const selectQuery = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([row]),
      };
      const db = createMockDb({
        select: jest.fn().mockReturnValue(selectQuery),
      });

      const service = new EbookProgressService(db);
      const result = await service.getProgress('user-1', 'ebook-1');

      expect(result!.completedAt).toBe(completedAt.toISOString());
      expect(result!.completed).toBe(true);
    });

    it('returns null cfi when cfi is null in the record', async () => {
      const row = makeProgressRow({ cfi: null });
      const selectQuery = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue([row]),
      };
      const db = createMockDb({
        select: jest.fn().mockReturnValue(selectQuery),
      });

      const service = new EbookProgressService(db);
      const result = await service.getProgress('user-1', 'ebook-1');

      expect(result!.cfi).toBeNull();
    });
  });

  describe('updateProgress', () => {
    function buildInsertChain(returnRow: any) {
      const returning = jest.fn().mockResolvedValue([returnRow]);
      const onConflictDoUpdate = jest.fn().mockReturnValue({ returning });
      const values = jest.fn().mockReturnValue({ onConflictDoUpdate });
      const insert = jest.fn().mockReturnValue({ values });
      return { insert, values, onConflictDoUpdate, returning };
    }

    function buildEbookSelect(result: any[]) {
      return {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockResolvedValue(result),
      };
    }

    it('throws NotFoundException when ebook does not exist', async () => {
      const selectQuery = buildEbookSelect([]);
      const db = createMockDb({
        select: jest.fn().mockReturnValue(selectQuery),
      });

      const service = new EbookProgressService(db);

      await expect(
        service.updateProgress('user-1', 'nonexistent', {
          progressPercent: 50,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('uses onConflictDoUpdate to upsert progress', async () => {
      const row = makeProgressRow({ progressPercent: 50 });
      const { insert, onConflictDoUpdate } = buildInsertChain(row);
      const selectQuery = buildEbookSelect([{ id: 'ebook-1' }]);

      const db = createMockDb({
        insert,
        select: jest.fn().mockReturnValue(selectQuery),
      });

      const service = new EbookProgressService(db);
      await service.updateProgress('user-1', 'ebook-1', {
        progressPercent: 50,
      });

      expect(insert).toHaveBeenCalledWith(
        ebookProgressSchema.userEbookProgress,
      );
      expect(onConflictDoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          target: [
            ebookProgressSchema.userEbookProgress.userId,
            ebookProgressSchema.userEbookProgress.ebookId,
          ],
        }),
      );
    });

    it('returns mapped response after upsert', async () => {
      const row = makeProgressRow({ progressPercent: 50 });
      const { insert } = buildInsertChain(row);
      const selectQuery = buildEbookSelect([{ id: 'ebook-1' }]);

      const db = createMockDb({
        insert,
        select: jest.fn().mockReturnValue(selectQuery),
      });

      const service = new EbookProgressService(db);
      const result = await service.updateProgress('user-1', 'ebook-1', {
        progressPercent: 50,
      });

      expect(result).toEqual({
        ebookId: 'ebook-1',
        cfi: row.cfi,
        progressPercent: 50,
        completed: false,
        completedAt: null,
        startedAt: earlier.toISOString(),
        updatedAt: now.toISOString(),
      });
    });

    it('marks as completed when progressPercent is >= 95', async () => {
      const row = makeProgressRow({
        progressPercent: 97,
        completed: true,
        completedAt: now,
      });
      const { insert, onConflictDoUpdate } = buildInsertChain(row);
      const selectQuery = buildEbookSelect([{ id: 'ebook-1' }]);

      const db = createMockDb({
        insert,
        select: jest.fn().mockReturnValue(selectQuery),
      });

      const service = new EbookProgressService(db);
      const result = await service.updateProgress('user-1', 'ebook-1', {
        progressPercent: 97,
      });

      // Check values passed to insert
      const valuesArg = insert.mock.results[0].value.values.mock.calls[0][0];
      expect(valuesArg.completed).toBe(true);
      expect(valuesArg.completedAt).toBeInstanceOf(Date);

      // Check conflict update set
      const upsertArg = onConflictDoUpdate.mock.calls[0][0];
      expect(upsertArg.set.completed).toBe(true);
      expect(upsertArg.set.completedAt).toBeInstanceOf(Date);

      expect(result.completed).toBe(true);
      expect(result.completedAt).toBe(now.toISOString());
    });

    it('marks as completed at exactly 95%', async () => {
      const row = makeProgressRow({
        progressPercent: 95,
        completed: true,
        completedAt: now,
      });
      const { insert } = buildInsertChain(row);
      const selectQuery = buildEbookSelect([{ id: 'ebook-1' }]);

      const db = createMockDb({
        insert,
        select: jest.fn().mockReturnValue(selectQuery),
      });

      const service = new EbookProgressService(db);
      const result = await service.updateProgress('user-1', 'ebook-1', {
        progressPercent: 95,
      });

      const valuesArg = insert.mock.results[0].value.values.mock.calls[0][0];
      expect(valuesArg.completed).toBe(true);
      expect(result.completed).toBe(true);
    });

    it('does not mark as completed when progressPercent is below 95', async () => {
      const row = makeProgressRow({ progressPercent: 94 });
      const { insert } = buildInsertChain(row);
      const selectQuery = buildEbookSelect([{ id: 'ebook-1' }]);

      const db = createMockDb({
        insert,
        select: jest.fn().mockReturnValue(selectQuery),
      });

      const service = new EbookProgressService(db);
      await service.updateProgress('user-1', 'ebook-1', {
        progressPercent: 94,
      });

      const valuesArg = insert.mock.results[0].value.values.mock.calls[0][0];
      expect(valuesArg.completed).toBe(false);
      expect(valuesArg.completedAt).toBeNull();
    });

    it('passes cfi to values when provided in dto', async () => {
      const cfi = '/6/4[chap05]!/4/2/8:50';
      const row = makeProgressRow({ cfi });
      const { insert } = buildInsertChain(row);
      const selectQuery = buildEbookSelect([{ id: 'ebook-1' }]);

      const db = createMockDb({
        insert,
        select: jest.fn().mockReturnValue(selectQuery),
      });

      const service = new EbookProgressService(db);
      await service.updateProgress('user-1', 'ebook-1', {
        progressPercent: 30,
        cfi,
      });

      const valuesArg = insert.mock.results[0].value.values.mock.calls[0][0];
      expect(valuesArg.cfi).toBe(cfi);
    });

    it('passes null cfi when not provided in dto', async () => {
      const row = makeProgressRow({ cfi: null });
      const { insert } = buildInsertChain(row);
      const selectQuery = buildEbookSelect([{ id: 'ebook-1' }]);

      const db = createMockDb({
        insert,
        select: jest.fn().mockReturnValue(selectQuery),
      });

      const service = new EbookProgressService(db);
      await service.updateProgress('user-1', 'ebook-1', {
        progressPercent: 30,
      });

      const valuesArg = insert.mock.results[0].value.values.mock.calls[0][0];
      expect(valuesArg.cfi).toBeNull();
    });

    it('resets isHidden to false on conflict update', async () => {
      const row = makeProgressRow();
      const { insert, onConflictDoUpdate } = buildInsertChain(row);
      const selectQuery = buildEbookSelect([{ id: 'ebook-1' }]);

      const db = createMockDb({
        insert,
        select: jest.fn().mockReturnValue(selectQuery),
      });

      const service = new EbookProgressService(db);
      await service.updateProgress('user-1', 'ebook-1', {
        progressPercent: 50,
      });

      const upsertArg = onConflictDoUpdate.mock.calls[0][0];
      expect(upsertArg.set.isHidden).toBe(false);
    });
  });

  describe('getAllProgress', () => {
    it('returns mapped results with ebook data', async () => {
      const row = makeProgressRow();
      const results = [
        {
          progress: row,
          ebook: {
            id: 'ebook-1',
            title: 'Test Ebook',
            coverUrl: 'cover.jpg',
            format: 'epub',
          },
        },
      ];

      const selectQuery = {
        from: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue(results),
      };

      const db = createMockDb({
        select: jest.fn().mockReturnValue(selectQuery),
      });

      const service = new EbookProgressService(db);
      const result = await service.getAllProgress('user-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        ebookId: 'ebook-1',
        cfi: row.cfi,
        progressPercent: 42,
        completed: false,
        completedAt: null,
        startedAt: earlier.toISOString(),
        updatedAt: now.toISOString(),
        ebook: {
          id: 'ebook-1',
          title: 'Test Ebook',
          coverUrl: 'cover.jpg',
          format: 'epub',
        },
      });
    });

    it('returns empty array when no progress exists', async () => {
      const selectQuery = {
        from: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue([]),
      };

      const db = createMockDb({
        select: jest.fn().mockReturnValue(selectQuery),
      });

      const service = new EbookProgressService(db);
      const result = await service.getAllProgress('user-1');

      expect(result).toEqual([]);
    });

    it('maps multiple results correctly', async () => {
      const results = [
        {
          progress: makeProgressRow({
            ebookId: 'ebook-1',
            progressPercent: 80,
          }),
          ebook: {
            id: 'ebook-1',
            title: 'First Book',
            coverUrl: null,
            format: 'epub',
          },
        },
        {
          progress: makeProgressRow({
            ebookId: 'ebook-2',
            progressPercent: 20,
          }),
          ebook: {
            id: 'ebook-2',
            title: 'Second Book',
            coverUrl: 'cover2.jpg',
            format: 'pdf',
          },
        },
      ];

      const selectQuery = {
        from: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue(results),
      };

      const db = createMockDb({
        select: jest.fn().mockReturnValue(selectQuery),
      });

      const service = new EbookProgressService(db);
      const result = await service.getAllProgress('user-1');

      expect(result).toHaveLength(2);
      expect(result[0].ebookId).toBe('ebook-1');
      expect(result[0].ebook.title).toBe('First Book');
      expect(result[1].ebookId).toBe('ebook-2');
      expect(result[1].ebook.format).toBe('pdf');
    });

    it('performs the query with innerJoin and where clause', async () => {
      const selectQuery = {
        from: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue([]),
      };

      const db = createMockDb({
        select: jest.fn().mockReturnValue(selectQuery),
      });

      const service = new EbookProgressService(db);
      await service.getAllProgress('user-1');

      expect(db.select).toHaveBeenCalled();
      expect(selectQuery.from).toHaveBeenCalled();
      expect(selectQuery.innerJoin).toHaveBeenCalled();
      expect(selectQuery.where).toHaveBeenCalled();
      expect(selectQuery.orderBy).toHaveBeenCalled();
    });
  });

  describe('resetProgress', () => {
    it('deletes the progress record successfully', async () => {
      const where = jest.fn().mockResolvedValue({ rowCount: 1 });
      const deleteFn = jest.fn().mockReturnValue({ where });

      const db = createMockDb({ delete: deleteFn });

      const service = new EbookProgressService(db);
      await service.resetProgress('user-1', 'ebook-1');

      expect(deleteFn).toHaveBeenCalledWith(
        ebookProgressSchema.userEbookProgress,
      );
      expect(where).toHaveBeenCalled();
    });

    it('throws NotFoundException when no rows affected', async () => {
      const where = jest.fn().mockResolvedValue({ rowCount: 0 });
      const deleteFn = jest.fn().mockReturnValue({ where });

      const db = createMockDb({ delete: deleteFn });

      const service = new EbookProgressService(db);

      await expect(
        service.resetProgress('user-1', 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException with correct message', async () => {
      const where = jest.fn().mockResolvedValue({ rowCount: 0 });
      const deleteFn = jest.fn().mockReturnValue({ where });

      const db = createMockDb({ delete: deleteFn });

      const service = new EbookProgressService(db);

      await expect(service.resetProgress('user-1', 'ebook-1')).rejects.toThrow(
        'Progress record not found',
      );
    });
  });

  describe('hideProgress', () => {
    it('sets isHidden to true on the progress record', async () => {
      const where = jest.fn().mockResolvedValue({ rowCount: 1 });
      const set = jest.fn().mockReturnValue({ where });
      const update = jest.fn().mockReturnValue({ set });

      const db = createMockDb({ update });

      const service = new EbookProgressService(db);
      await service.hideProgress('user-1', 'ebook-1');

      expect(update).toHaveBeenCalledWith(
        ebookProgressSchema.userEbookProgress,
      );
      expect(set).toHaveBeenCalledWith({ isHidden: true });
      expect(where).toHaveBeenCalled();
    });

    it('throws NotFoundException when no rows affected', async () => {
      const where = jest.fn().mockResolvedValue({ rowCount: 0 });
      const set = jest.fn().mockReturnValue({ where });
      const update = jest.fn().mockReturnValue({ set });

      const db = createMockDb({ update });

      const service = new EbookProgressService(db);

      await expect(
        service.hideProgress('user-1', 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException with correct message', async () => {
      const where = jest.fn().mockResolvedValue({ rowCount: 0 });
      const set = jest.fn().mockReturnValue({ where });
      const update = jest.fn().mockReturnValue({ set });

      const db = createMockDb({ update });

      const service = new EbookProgressService(db);

      await expect(service.hideProgress('user-1', 'ebook-1')).rejects.toThrow(
        'Progress record not found',
      );
    });

    it('resolves without error when row is updated', async () => {
      const where = jest.fn().mockResolvedValue({ rowCount: 1 });
      const set = jest.fn().mockReturnValue({ where });
      const update = jest.fn().mockReturnValue({ set });

      const db = createMockDb({ update });

      const service = new EbookProgressService(db);

      await expect(
        service.hideProgress('user-1', 'ebook-1'),
      ).resolves.toBeUndefined();
    });
  });
});
