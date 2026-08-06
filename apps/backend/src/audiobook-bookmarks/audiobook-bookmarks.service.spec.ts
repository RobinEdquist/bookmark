import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import * as bookmarksSchema from './schema';
import { AudiobookBookmarksService } from './audiobook-bookmarks.service';

const NOW = new Date('2026-08-07T09:00:00.000Z');

function bookmarkRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'bookmark-1',
    userId: 'user-1',
    audiobookId: 'audiobook-1',
    note: 'A great scene',
    position: 120,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
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

/** Select chain that resolves at `.where()` (audiobook lookup, replay lookup). */
function selectResolvingAtWhere(rows: unknown[]) {
  return {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue(rows),
  };
}

describe('AudiobookBookmarksService', () => {
  describe('list', () => {
    it('returns bookmarks mapped to DTOs with ISO dates', async () => {
      const orderBy = jest.fn().mockResolvedValue([bookmarkRow()]);
      const selectQuery = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy,
      };
      const db = createMockDb({
        select: jest.fn().mockReturnValue(selectQuery),
      });

      const service = new AudiobookBookmarksService(db);
      const result = await service.list('user-1', 'audiobook-1');

      expect(result).toEqual([
        {
          id: 'bookmark-1',
          audiobookId: 'audiobook-1',
          note: 'A great scene',
          position: 120,
          createdAt: NOW.toISOString(),
          updatedAt: NOW.toISOString(),
        },
      ]);
      expect(selectQuery.from).toHaveBeenCalledWith(
        bookmarksSchema.audiobookBookmarks,
      );
    });
  });

  describe('create', () => {
    function createInsertChain(returningRows: unknown[]) {
      const returning = jest.fn().mockResolvedValue(returningRows);
      const onConflictDoNothing = jest.fn().mockReturnValue({ returning });
      const values = jest.fn().mockReturnValue({ onConflictDoNothing });
      const insert = jest.fn().mockReturnValue({ values });
      return { insert, values, onConflictDoNothing, returning };
    }

    it('inserts a bookmark and returns the DTO', async () => {
      const { insert, values } = createInsertChain([bookmarkRow()]);
      const db = createMockDb({
        insert,
        select: jest
          .fn()
          .mockReturnValue(
            selectResolvingAtWhere([{ id: 'audiobook-1', duration: 3600 }]),
          ),
      });

      const service = new AudiobookBookmarksService(db);
      const result = await service.create('user-1', 'audiobook-1', {
        position: 120,
        note: '  A great scene  ',
      });

      expect(insert).toHaveBeenCalledWith(bookmarksSchema.audiobookBookmarks);
      expect(values).toHaveBeenCalledWith({
        userId: 'user-1',
        audiobookId: 'audiobook-1',
        note: 'A great scene',
        position: 120,
      });
      expect(result.id).toBe('bookmark-1');
    });

    it('passes a client-supplied id through to the insert', async () => {
      const { insert, values } = createInsertChain([
        bookmarkRow({ id: 'client-id-1' }),
      ]);
      const db = createMockDb({
        insert,
        select: jest
          .fn()
          .mockReturnValue(
            selectResolvingAtWhere([{ id: 'audiobook-1', duration: 3600 }]),
          ),
      });

      const service = new AudiobookBookmarksService(db);
      await service.create('user-1', 'audiobook-1', {
        id: 'client-id-1',
        position: 120,
      });

      expect(values).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'client-id-1' }),
      );
    });

    it('stores whitespace-only notes as null', async () => {
      const { insert, values } = createInsertChain([
        bookmarkRow({ note: null }),
      ]);
      const db = createMockDb({
        insert,
        select: jest
          .fn()
          .mockReturnValue(
            selectResolvingAtWhere([{ id: 'audiobook-1', duration: 3600 }]),
          ),
      });

      const service = new AudiobookBookmarksService(db);
      const result = await service.create('user-1', 'audiobook-1', {
        position: 120,
        note: '   ',
      });

      expect(values).toHaveBeenCalledWith(
        expect.objectContaining({ note: null }),
      );
      expect(result.note).toBeNull();
    });

    it('throws NotFoundException when the audiobook does not exist', async () => {
      const db = createMockDb({
        select: jest.fn().mockReturnValue(selectResolvingAtWhere([])),
      });

      const service = new AudiobookBookmarksService(db);

      await expect(
        service.create('user-1', 'missing', { position: 120 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when position exceeds the duration', async () => {
      const db = createMockDb({
        select: jest
          .fn()
          .mockReturnValue(
            selectResolvingAtWhere([{ id: 'audiobook-1', duration: 3600 }]),
          ),
      });

      const service = new AudiobookBookmarksService(db);

      await expect(
        service.create('user-1', 'audiobook-1', { position: 3601 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows any position when the audiobook duration is unknown', async () => {
      const { insert } = createInsertChain([bookmarkRow({ position: 99999 })]);
      const db = createMockDb({
        insert,
        select: jest
          .fn()
          .mockReturnValue(
            selectResolvingAtWhere([{ id: 'audiobook-1', duration: null }]),
          ),
      });

      const service = new AudiobookBookmarksService(db);

      await expect(
        service.create('user-1', 'audiobook-1', { position: 99999 }),
      ).resolves.toMatchObject({ position: 99999 });
    });

    it('returns the existing bookmark when the same user replays a create', async () => {
      const { insert } = createInsertChain([]);
      const existing = bookmarkRow({ id: 'client-id-1' });
      const select = jest
        .fn()
        // audiobook existence check
        .mockReturnValueOnce(
          selectResolvingAtWhere([{ id: 'audiobook-1', duration: 3600 }]),
        )
        // replay lookup by id
        .mockReturnValueOnce(selectResolvingAtWhere([existing]));
      const db = createMockDb({ insert, select });

      const service = new AudiobookBookmarksService(db);
      const result = await service.create('user-1', 'audiobook-1', {
        id: 'client-id-1',
        position: 120,
      });

      expect(result.id).toBe('client-id-1');
    });

    it("throws ConflictException when the id belongs to another user's bookmark", async () => {
      const { insert } = createInsertChain([]);
      const foreign = bookmarkRow({ id: 'client-id-1', userId: 'user-2' });
      const select = jest
        .fn()
        .mockReturnValueOnce(
          selectResolvingAtWhere([{ id: 'audiobook-1', duration: 3600 }]),
        )
        .mockReturnValueOnce(selectResolvingAtWhere([foreign]));
      const db = createMockDb({ insert, select });

      const service = new AudiobookBookmarksService(db);

      await expect(
        service.create('user-1', 'audiobook-1', {
          id: 'client-id-1',
          position: 120,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    function createUpdateChain(returningRows: unknown[]) {
      const returning = jest.fn().mockResolvedValue(returningRows);
      const where = jest.fn().mockReturnValue({ returning });
      const set = jest.fn().mockReturnValue({ where });
      const update = jest.fn().mockReturnValue({ set });
      return { update, set, where, returning };
    }

    it('rejects an empty patch with BadRequestException', async () => {
      const service = new AudiobookBookmarksService(createMockDb());

      await expect(
        service.update('user-1', 'audiobook-1', 'bookmark-1', {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('updates only the provided fields and clears empty notes', async () => {
      const { update, set } = createUpdateChain([bookmarkRow({ note: null })]);
      const db = createMockDb({ update });

      const service = new AudiobookBookmarksService(db);
      const result = await service.update(
        'user-1',
        'audiobook-1',
        'bookmark-1',
        { note: '' },
      );

      expect(set).toHaveBeenCalledWith({ note: null });
      expect(result.note).toBeNull();
    });

    it('validates the position against the audiobook duration', async () => {
      const db = createMockDb({
        select: jest
          .fn()
          .mockReturnValue(
            selectResolvingAtWhere([{ id: 'audiobook-1', duration: 3600 }]),
          ),
      });

      const service = new AudiobookBookmarksService(db);

      await expect(
        service.update('user-1', 'audiobook-1', 'bookmark-1', {
          position: 9999,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when no owned row matches', async () => {
      const { update } = createUpdateChain([]);
      const db = createMockDb({ update });

      const service = new AudiobookBookmarksService(db);

      await expect(
        service.update('user-1', 'audiobook-1', 'bookmark-1', {
          note: 'hello',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes the bookmark scoped to the owner', async () => {
      const where = jest.fn().mockResolvedValue({ rowCount: 1 });
      const db = createMockDb({
        delete: jest.fn().mockReturnValue({ where }),
      });

      const service = new AudiobookBookmarksService(db);

      await expect(
        service.remove('user-1', 'audiobook-1', 'bookmark-1'),
      ).resolves.toBeUndefined();
    });

    it('throws NotFoundException when nothing was deleted', async () => {
      const where = jest.fn().mockResolvedValue({ rowCount: 0 });
      const db = createMockDb({
        delete: jest.fn().mockReturnValue({ where }),
      });

      const service = new AudiobookBookmarksService(db);

      await expect(
        service.remove('user-1', 'audiobook-1', 'bookmark-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
