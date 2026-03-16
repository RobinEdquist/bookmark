import { NotFoundException } from '@nestjs/common';
import { createMockDb, createChainMock, type MockDb } from '@test-utils';
import { GrFinderService } from '../gr-finder.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const AUDIOBOOK_ID = 'audiobook-1';
const EBOOK_ID = 'ebook-1';
const GOODREADS_ID = '12345';
const GR_FINDER_URL = 'http://gr-finder:3000';

const mockBookDetails = {
  title: 'The Great Gatsby',
  author: 'F. Scott Fitzgerald',
  cover_url: 'https://covers.example.com/gatsby.jpg',
  rating: 4.2,
  url: 'https://www.goodreads.com/book/show/12345',
  description: 'A novel about the American Dream.',
  genres: ['Fiction', 'Classics'],
  rating_count: 5000,
};

const mockSearchResponse = {
  query: 'The Great Gatsby',
  count: 1,
  results: [
    {
      title: 'The Great Gatsby',
      author: 'F. Scott Fitzgerald',
      goodreads_id: GOODREADS_ID,
      cover_url: 'https://covers.example.com/gatsby.jpg',
      avg_rating: '4.2',
      url: 'https://www.goodreads.com/book/show/12345',
    },
  ],
};

const mockGoodreadsBookRecord = {
  id: 'gr-book-1',
  goodreadsId: GOODREADS_ID,
  title: 'The Great Gatsby',
  author: 'F. Scott Fitzgerald',
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const originalEnv = process.env;
let mockFetch: jest.Mock;

beforeEach(() => {
  process.env = { ...originalEnv, GR_FINDER_URL };
  mockFetch = jest.fn();
  global.fetch = mockFetch;
});

afterEach(() => {
  process.env = originalEnv;
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GrFinderService', () => {
  let db: MockDb;
  let service: GrFinderService;

  beforeEach(() => {
    db = createMockDb();
    service = new GrFinderService(db as any);
  });

  // -----------------------------------------------------------------------
  // isConfigured
  // -----------------------------------------------------------------------
  describe('isConfigured', () => {
    it('returns true when GR_FINDER_URL is set', () => {
      expect(service.isConfigured()).toBe(true);
    });

    it('returns false when GR_FINDER_URL is not set', () => {
      delete process.env.GR_FINDER_URL;
      expect(service.isConfigured()).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // search
  // -----------------------------------------------------------------------
  describe('search', () => {
    it('calls fetch with correct URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockSearchResponse),
      });

      const result = await service.search('The Great Gatsby');

      expect(mockFetch).toHaveBeenCalledWith(
        `${GR_FINDER_URL}/search?q=The+Great+Gatsby`,
        expect.objectContaining({ method: 'GET' }),
      );
      expect(result).toEqual(mockSearchResponse);
    });

    it('throws when not configured', async () => {
      delete process.env.GR_FINDER_URL;

      await expect(service.search('query')).rejects.toThrow(
        'GR_FINDER_URL is not configured',
      );
    });

    it('throws on non-OK response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: jest.fn().mockResolvedValue('Server error'),
      });

      await expect(service.search('query')).rejects.toThrow(
        'Search failed: Internal Server Error',
      );
    });
  });

  // -----------------------------------------------------------------------
  // searchByMediaId
  // -----------------------------------------------------------------------
  describe('searchByMediaId', () => {
    it('uses custom query directly when provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockSearchResponse),
      });

      const result = await service.searchByMediaId(
        'audiobook',
        AUDIOBOOK_ID,
        'custom search term',
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('q=custom+search+term'),
        expect.any(Object),
      );
      expect(result.query).toBe('custom search term');
    });

    it('builds query from audiobook title and authors', async () => {
      // Mock audiobook select
      const audiobookSelectChain = createChainMock(['from', 'where', 'limit']);
      audiobookSelectChain.limit.mockResolvedValue([
        { title: 'The Great Gatsby', subtitle: null },
      ]);

      // Mock authors select
      const authorsSelectChain = createChainMock([
        'from',
        'innerJoin',
        'where',
        'orderBy',
      ]);
      authorsSelectChain.orderBy.mockResolvedValue([
        { name: 'F. Scott Fitzgerald' },
      ]);

      db.select
        .mockReturnValueOnce(audiobookSelectChain)
        .mockReturnValueOnce(authorsSelectChain);

      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockSearchResponse),
      });

      const result = await service.searchByMediaId('audiobook', AUDIOBOOK_ID);

      expect(result.query).toBe('The Great Gatsby F. Scott Fitzgerald');
    });

    it('throws NotFoundException for missing audiobook', async () => {
      const selectChain = createChainMock(['from', 'where', 'limit']);
      selectChain.limit.mockResolvedValue([]);
      db.select.mockReturnValue(selectChain);

      await expect(
        service.searchByMediaId('audiobook', 'nonexistent'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('builds query from ebook title and authors', async () => {
      const ebookSelectChain = createChainMock(['from', 'where', 'limit']);
      ebookSelectChain.limit.mockResolvedValue([
        { title: 'Dune', subtitle: 'A Science Fiction Epic' },
      ]);

      const authorsSelectChain = createChainMock([
        'from',
        'innerJoin',
        'where',
        'orderBy',
      ]);
      authorsSelectChain.orderBy.mockResolvedValue([{ name: 'Frank Herbert' }]);

      db.select
        .mockReturnValueOnce(ebookSelectChain)
        .mockReturnValueOnce(authorsSelectChain);

      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockSearchResponse),
      });

      const result = await service.searchByMediaId('ebook', EBOOK_ID);

      expect(result.query).toBe('Dune: A Science Fiction Epic Frank Herbert');
    });

    it('throws NotFoundException for missing ebook', async () => {
      const selectChain = createChainMock(['from', 'where', 'limit']);
      selectChain.limit.mockResolvedValue([]);
      db.select.mockReturnValue(selectChain);

      await expect(
        service.searchByMediaId('ebook', 'nonexistent'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // getBookDetails
  // -----------------------------------------------------------------------
  describe('getBookDetails', () => {
    it('calls correct URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockBookDetails),
      });

      const result = await service.getBookDetails(GOODREADS_ID);

      expect(mockFetch).toHaveBeenCalledWith(
        `${GR_FINDER_URL}/book/${GOODREADS_ID}`,
        expect.objectContaining({ method: 'GET' }),
      );
      expect(result).toEqual(mockBookDetails);
    });

    it('throws on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: jest.fn().mockResolvedValue('Book not found'),
      });

      await expect(service.getBookDetails(GOODREADS_ID)).rejects.toThrow(
        'Failed to fetch book details: Not Found',
      );
    });

    it('throws when not configured', async () => {
      delete process.env.GR_FINDER_URL;

      await expect(service.getBookDetails(GOODREADS_ID)).rejects.toThrow(
        'GR_FINDER_URL is not configured',
      );
    });
  });

  // -----------------------------------------------------------------------
  // linkMediaToGoodreads
  // -----------------------------------------------------------------------
  describe('linkMediaToGoodreads', () => {
    it('verifies audiobook exists, fetches details, creates book record and link', async () => {
      // Mock: verify audiobook exists
      const verifyChain = createChainMock(['from', 'where', 'limit']);
      verifyChain.limit.mockResolvedValue([{ id: AUDIOBOOK_ID }]);

      // Mock: findOrCreateGoodreadsBook - check existing
      const findExistingChain = createChainMock(['from', 'where', 'limit']);
      findExistingChain.limit.mockResolvedValue([]);

      db.select
        .mockReturnValueOnce(verifyChain)
        .mockReturnValueOnce(findExistingChain);

      // Mock: fetch book details
      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(mockBookDetails),
      });

      // Mock: insert goodreads book (create new)
      const insertChain = createChainMock(['values', 'returning']);
      insertChain.returning.mockResolvedValue([mockGoodreadsBookRecord]);
      insertChain.values.mockReturnValue(insertChain);
      db.insert.mockReturnValue(insertChain);

      // Mock: delete existing link
      const deleteChain = createChainMock(['where']);
      deleteChain.where.mockResolvedValue(undefined);
      db.delete.mockReturnValue(deleteChain);

      const result = await service.linkMediaToGoodreads(
        'audiobook',
        AUDIOBOOK_ID,
        GOODREADS_ID,
      );

      expect(result).toEqual(mockGoodreadsBookRecord);
      expect(mockFetch).toHaveBeenCalledWith(
        `${GR_FINDER_URL}/book/${GOODREADS_ID}`,
        expect.any(Object),
      );
      expect(db.delete).toHaveBeenCalled();
      expect(db.insert).toHaveBeenCalled();
    });

    it('throws when not configured', async () => {
      delete process.env.GR_FINDER_URL;

      await expect(
        service.linkMediaToGoodreads('audiobook', AUDIOBOOK_ID, GOODREADS_ID),
      ).rejects.toThrow('Goodreads Finder is not configured');
    });

    it('throws NotFoundException for missing audiobook', async () => {
      const selectChain = createChainMock(['from', 'where', 'limit']);
      selectChain.limit.mockResolvedValue([]);
      db.select.mockReturnValue(selectChain);

      await expect(
        service.linkMediaToGoodreads('audiobook', 'nonexistent', GOODREADS_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException for missing ebook', async () => {
      const selectChain = createChainMock(['from', 'where', 'limit']);
      selectChain.limit.mockResolvedValue([]);
      db.select.mockReturnValue(selectChain);

      await expect(
        service.linkMediaToGoodreads('ebook', 'nonexistent', GOODREADS_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -----------------------------------------------------------------------
  // getGoodreadsLink
  // -----------------------------------------------------------------------
  describe('getGoodreadsLink', () => {
    it('returns linked book for audiobook', async () => {
      const selectChain = createChainMock([
        'from',
        'innerJoin',
        'where',
        'limit',
      ]);
      selectChain.limit.mockResolvedValue([mockGoodreadsBookRecord]);
      db.select.mockReturnValue(selectChain);

      const result = await service.getGoodreadsLink('audiobook', AUDIOBOOK_ID);

      expect(result).toEqual(mockGoodreadsBookRecord);
    });

    it('returns null when no link exists', async () => {
      const selectChain = createChainMock([
        'from',
        'innerJoin',
        'where',
        'limit',
      ]);
      selectChain.limit.mockResolvedValue([]);
      db.select.mockReturnValue(selectChain);

      const result = await service.getGoodreadsLink('audiobook', AUDIOBOOK_ID);

      expect(result).toBeNull();
    });

    it('returns linked book for ebook', async () => {
      const selectChain = createChainMock([
        'from',
        'innerJoin',
        'where',
        'limit',
      ]);
      selectChain.limit.mockResolvedValue([mockGoodreadsBookRecord]);
      db.select.mockReturnValue(selectChain);

      const result = await service.getGoodreadsLink('ebook', EBOOK_ID);

      expect(result).toEqual(mockGoodreadsBookRecord);
    });
  });

  // -----------------------------------------------------------------------
  // unlinkMedia
  // -----------------------------------------------------------------------
  describe('unlinkMedia', () => {
    it('deletes audiobook link', async () => {
      const deleteChain = createChainMock(['where']);
      deleteChain.where.mockResolvedValue(undefined);
      db.delete.mockReturnValue(deleteChain);

      await service.unlinkMedia('audiobook', AUDIOBOOK_ID);

      expect(db.delete).toHaveBeenCalled();
      expect(deleteChain.where).toHaveBeenCalled();
    });

    it('deletes ebook link', async () => {
      const deleteChain = createChainMock(['where']);
      deleteChain.where.mockResolvedValue(undefined);
      db.delete.mockReturnValue(deleteChain);

      await service.unlinkMedia('ebook', EBOOK_ID);

      expect(db.delete).toHaveBeenCalled();
      expect(deleteChain.where).toHaveBeenCalled();
    });
  });
});
