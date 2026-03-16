import { NotFoundException } from '@nestjs/common';
import { GenresAdminService } from '../genres-admin.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chainMock(resolvedValue: any = []) {
  const self: Record<string, jest.Mock> = {};
  const methods = ['from', 'where', 'orderBy', 'limit'];
  for (const m of methods) {
    self[m] = jest.fn().mockReturnValue(self);
  }
  (self as any).then = (resolve: any, reject: any) =>
    Promise.resolve(resolvedValue).then(resolve, reject);
  return self;
}

function createMockDb() {
  return {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    execute: jest.fn(),
  } as any;
}

const GENRE_ID = 'g1';
const GENRE_NAME = 'Fantasy';

const mockGenre = { id: GENRE_ID, name: GENRE_NAME };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GenresAdminService', () => {
  // -----------------------------------------------------------------------
  // findAll
  // -----------------------------------------------------------------------
  describe('findAll', () => {
    it('returns genres with audiobook and ebook counts', async () => {
      const db = createMockDb();
      const genres = [
        { id: 'g1', name: 'Fantasy', audiobookCount: 5, ebookCount: 3 },
        { id: 'g2', name: 'Sci-Fi', audiobookCount: 2, ebookCount: 1 },
      ];
      const chain = chainMock(genres);
      db.select.mockReturnValueOnce(chain);

      const service = new GenresAdminService(db);
      const result = await service.findAll();

      expect(result).toEqual(genres);
      expect(db.select).toHaveBeenCalled();
      expect(chain.from).toHaveBeenCalled();
      expect(chain.orderBy).toHaveBeenCalled();
    });

    it('returns empty array when no genres exist', async () => {
      const db = createMockDb();
      const chain = chainMock([]);
      db.select.mockReturnValueOnce(chain);

      const service = new GenresAdminService(db);
      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // rename
  // -----------------------------------------------------------------------
  describe('rename', () => {
    it('throws NotFoundException when genre does not exist', async () => {
      const db = createMockDb();
      const chain = chainMock([]);
      db.select.mockReturnValueOnce(chain);

      const service = new GenresAdminService(db);

      await expect(service.rename('nonexistent', 'New Name')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns current genre when name is unchanged', async () => {
      const db = createMockDb();

      // First select: find genre
      const genreChain = chainMock([mockGenre]);
      db.select.mockReturnValueOnce(genreChain);

      // Second select: getGenreCounts
      const countsChain = chainMock([{ audiobookCount: 5, ebookCount: 3 }]);
      db.select.mockReturnValueOnce(countsChain);

      const service = new GenresAdminService(db);
      const result = await service.rename(GENRE_ID, GENRE_NAME);

      expect(result).toEqual({
        id: GENRE_ID,
        name: GENRE_NAME,
        audiobookCount: 5,
        ebookCount: 3,
      });
      // update should NOT have been called
      expect(db.update).not.toHaveBeenCalled();
    });

    it('returns conflict info when target name already exists (case-insensitive)', async () => {
      const db = createMockDb();

      // First select: find genre
      const genreChain = chainMock([mockGenre]);
      db.select.mockReturnValueOnce(genreChain);

      // Second select: find existing genre with same name
      const existingChain = chainMock([{ id: 'g2', name: 'Sci-Fi' }]);
      db.select.mockReturnValueOnce(existingChain);

      // Third select: getGenreCounts for source
      const countsChain = chainMock([{ audiobookCount: 3, ebookCount: 1 }]);
      db.select.mockReturnValueOnce(countsChain);

      const service = new GenresAdminService(db);
      const result = await service.rename(GENRE_ID, 'Sci-Fi');

      expect(result).toEqual({
        conflict: true,
        existingGenre: { id: 'g2', name: 'Sci-Fi' },
        sourceGenre: { id: GENRE_ID, name: GENRE_NAME },
        audiobookCount: 3,
        ebookCount: 1,
      });
      expect(db.update).not.toHaveBeenCalled();
    });

    it('renames genre when no conflict exists', async () => {
      const db = createMockDb();

      // First select: find genre
      const genreChain = chainMock([mockGenre]);
      db.select.mockReturnValueOnce(genreChain);

      // Second select: no conflict
      const conflictChain = chainMock([]);
      db.select.mockReturnValueOnce(conflictChain);

      // update chain
      const updateChain = chainMock(undefined);
      updateChain.set = jest.fn().mockReturnValue(updateChain);
      db.update.mockReturnValueOnce(updateChain);

      // Third select: getGenreCounts
      const countsChain = chainMock([{ audiobookCount: 5, ebookCount: 2 }]);
      db.select.mockReturnValueOnce(countsChain);

      const service = new GenresAdminService(db);
      const result = await service.rename(GENRE_ID, 'Science Fantasy');

      expect(result).toEqual({
        id: GENRE_ID,
        name: 'Science Fantasy',
        audiobookCount: 5,
        ebookCount: 2,
      });
      expect(db.update).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // merge
  // -----------------------------------------------------------------------
  describe('merge', () => {
    it('throws NotFoundException when source genre not found', async () => {
      const db = createMockDb();

      // First select: source not found
      const sourceChain = chainMock([]);
      db.select.mockReturnValueOnce(sourceChain);

      // Second select: target found
      const targetChain = chainMock([{ id: 'g2', name: 'Sci-Fi' }]);
      db.select.mockReturnValueOnce(targetChain);

      const service = new GenresAdminService(db);

      await expect(service.merge('nonexistent', 'g2')).rejects.toThrow(
        'Source genre not found',
      );
    });

    it('throws NotFoundException type when source genre not found', async () => {
      const db = createMockDb();

      const sourceChain = chainMock([]);
      db.select.mockReturnValueOnce(sourceChain);

      const targetChain = chainMock([{ id: 'g2', name: 'Sci-Fi' }]);
      db.select.mockReturnValueOnce(targetChain);

      const service = new GenresAdminService(db);

      await expect(service.merge('nonexistent', 'g2')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws NotFoundException when target genre not found', async () => {
      const db = createMockDb();

      // First select: source found
      const sourceChain = chainMock([mockGenre]);
      db.select.mockReturnValueOnce(sourceChain);

      // Second select: target not found
      const targetChain = chainMock([]);
      db.select.mockReturnValueOnce(targetChain);

      const service = new GenresAdminService(db);

      await expect(service.merge(GENRE_ID, 'nonexistent')).rejects.toThrow(
        'Target genre not found',
      );
    });

    it('throws NotFoundException type when target genre not found', async () => {
      const db = createMockDb();

      const sourceChain = chainMock([mockGenre]);
      db.select.mockReturnValueOnce(sourceChain);

      const targetChain = chainMock([]);
      db.select.mockReturnValueOnce(targetChain);

      const service = new GenresAdminService(db);

      await expect(
        service.merge(GENRE_ID, 'nonexistent'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('executes merge operations and returns result', async () => {
      const db = createMockDb();
      const targetGenre = { id: 'g2', name: 'Sci-Fi' };

      // First select: source
      const sourceChain = chainMock([mockGenre]);
      db.select.mockReturnValueOnce(sourceChain);

      // Second select: target
      const targetChain = chainMock([targetGenre]);
      db.select.mockReturnValueOnce(targetChain);

      // Third select: getGenreCounts for source
      const countsChain = chainMock([{ audiobookCount: 3, ebookCount: 2 }]);
      db.select.mockReturnValueOnce(countsChain);

      // execute calls (move audiobook links, move ebook links)
      db.execute.mockResolvedValue(undefined);

      // delete chains (delete leftover audiobook links, ebook links, source genre)
      const deleteChain = chainMock(undefined);
      db.delete.mockReturnValue(deleteChain);

      const service = new GenresAdminService(db);
      const result = await service.merge(GENRE_ID, 'g2');

      expect(result).toEqual({
        id: 'g2',
        name: 'Sci-Fi',
        audiobooksMerged: 3,
        ebooksMerged: 2,
      });
      // Two execute calls for moving audiobook and ebook links
      expect(db.execute).toHaveBeenCalledTimes(2);
      // Three delete calls: audiobookGenres, ebookGenres, genres
      expect(db.delete).toHaveBeenCalledTimes(3);
    });

    it('deletes source genre after merging links', async () => {
      const db = createMockDb();
      const targetGenre = { id: 'g2', name: 'Sci-Fi' };

      const sourceChain = chainMock([mockGenre]);
      db.select.mockReturnValueOnce(sourceChain);

      const targetChain = chainMock([targetGenre]);
      db.select.mockReturnValueOnce(targetChain);

      const countsChain = chainMock([{ audiobookCount: 0, ebookCount: 0 }]);
      db.select.mockReturnValueOnce(countsChain);

      db.execute.mockResolvedValue(undefined);

      const deleteChain = chainMock(undefined);
      db.delete.mockReturnValue(deleteChain);

      const service = new GenresAdminService(db);
      await service.merge(GENRE_ID, 'g2');

      // Last delete call should be for the genres table (source genre)
      expect(db.delete).toHaveBeenCalledTimes(3);
    });
  });

  // -----------------------------------------------------------------------
  // delete
  // -----------------------------------------------------------------------
  describe('delete', () => {
    it('throws NotFoundException when genre does not exist', async () => {
      const db = createMockDb();
      const chain = chainMock([]);
      db.select.mockReturnValueOnce(chain);

      const service = new GenresAdminService(db);

      await expect(service.delete('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deletes the genre when it exists', async () => {
      const db = createMockDb();

      // select: find genre
      const selectChain = chainMock([mockGenre]);
      db.select.mockReturnValueOnce(selectChain);

      // delete chain
      const deleteChain = chainMock(undefined);
      db.delete.mockReturnValueOnce(deleteChain);

      const service = new GenresAdminService(db);
      await service.delete(GENRE_ID);

      expect(db.delete).toHaveBeenCalled();
    });
  });
});
