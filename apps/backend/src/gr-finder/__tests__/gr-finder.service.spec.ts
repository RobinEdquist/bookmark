import { NotFoundException } from '@nestjs/common';
import { createMockDb, createChainMock, type MockDb } from '@test-utils';
import { GrFinderService } from '../gr-finder.service';
import type { GoodreadsScraperService } from '../goodreads-scraper.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const AUDIOBOOK_ID = 'audiobook-1';
const EBOOK_ID = 'ebook-1';
const GOODREADS_ID = '12345';

const mockScrapedDetails = {
  title: 'The Great Gatsby',
  author: 'F. Scott Fitzgerald',
  cover_url: 'https://covers.example.com/gatsby.jpg',
  rating: 4.2,
  rating_count: 5000,
  genres: ['Fiction', 'Classics'],
  description: 'A novel about the American Dream.',
  series: null,
  series_number: null,
};

const mockSearchResults = [
  {
    title: 'The Great Gatsby',
    author: 'F. Scott Fitzgerald',
    goodreads_id: GOODREADS_ID,
    cover_url: 'https://covers.example.com/gatsby.jpg',
    avg_rating: '4.2',
    url: 'https://www.goodreads.com/book/show/12345',
  },
];

const mockGoodreadsBookRecord = {
  id: 'gr-book-1',
  goodreadsId: GOODREADS_ID,
  title: 'The Great Gatsby',
  author: 'F. Scott Fitzgerald',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GrFinderService', () => {
  let db: MockDb;
  let scraper: jest.Mocked<
    Pick<GoodreadsScraperService, 'searchBooks' | 'getBookDetails'>
  >;
  let service: GrFinderService;

  beforeEach(() => {
    db = createMockDb();
    scraper = {
      searchBooks: jest.fn(),
      getBookDetails: jest.fn(),
    };
    service = new GrFinderService(
      db as any,
      scraper as unknown as GoodreadsScraperService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // search
  // -----------------------------------------------------------------------
  describe('search', () => {
    it('wraps scraper results in a search response', async () => {
      scraper.searchBooks.mockResolvedValue(mockSearchResults);

      const result = await service.search('The Great Gatsby');

      expect(scraper.searchBooks).toHaveBeenCalledWith('The Great Gatsby');
      expect(result).toEqual({
        query: 'The Great Gatsby',
        count: 1,
        results: mockSearchResults,
      });
    });

    it('propagates scraper errors', async () => {
      scraper.searchBooks.mockRejectedValue(
        new Error('Goodreads search failed with status 500'),
      );

      await expect(service.search('query')).rejects.toThrow(
        'Goodreads search failed with status 500',
      );
    });
  });

  // -----------------------------------------------------------------------
  // searchByMediaId
  // -----------------------------------------------------------------------
  describe('searchByMediaId', () => {
    it('uses custom query directly when provided', async () => {
      scraper.searchBooks.mockResolvedValue(mockSearchResults);

      const result = await service.searchByMediaId(
        'audiobook',
        AUDIOBOOK_ID,
        'custom search term',
      );

      expect(scraper.searchBooks).toHaveBeenCalledWith('custom search term');
      expect(result.query).toBe('custom search term');
    });

    it('builds query from the audiobook title', async () => {
      const audiobookSelectChain = createChainMock(['from', 'where', 'limit']);
      audiobookSelectChain.limit.mockResolvedValue([
        { title: 'The Great Gatsby', subtitle: null },
      ]);

      db.select.mockReturnValueOnce(audiobookSelectChain);
      scraper.searchBooks.mockResolvedValue(mockSearchResults);

      const result = await service.searchByMediaId('audiobook', AUDIOBOOK_ID);

      expect(result.query).toBe('The Great Gatsby');
    });

    it('throws NotFoundException for missing audiobook', async () => {
      const selectChain = createChainMock(['from', 'where', 'limit']);
      selectChain.limit.mockResolvedValue([]);
      db.select.mockReturnValue(selectChain);

      await expect(
        service.searchByMediaId('audiobook', 'nonexistent'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('builds query from ebook title and subtitle', async () => {
      const ebookSelectChain = createChainMock(['from', 'where', 'limit']);
      ebookSelectChain.limit.mockResolvedValue([
        { title: 'Dune', subtitle: 'A Science Fiction Epic' },
      ]);

      db.select.mockReturnValueOnce(ebookSelectChain);
      scraper.searchBooks.mockResolvedValue(mockSearchResults);

      const result = await service.searchByMediaId('ebook', EBOOK_ID);

      expect(result.query).toBe('Dune: A Science Fiction Epic');
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
    it('enriches scraped details with the goodreads id and URL', async () => {
      scraper.getBookDetails.mockResolvedValue(mockScrapedDetails);

      const result = await service.getBookDetails(GOODREADS_ID);

      expect(scraper.getBookDetails).toHaveBeenCalledWith(GOODREADS_ID);
      expect(result).toEqual({
        ...mockScrapedDetails,
        goodreads_id: GOODREADS_ID,
        url: `https://www.goodreads.com/book/show/${GOODREADS_ID}`,
      });
    });

    it('throws NotFoundException when the scraper finds nothing', async () => {
      scraper.getBookDetails.mockResolvedValue(null);

      await expect(service.getBookDetails(GOODREADS_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('propagates scraper errors', async () => {
      scraper.getBookDetails.mockRejectedValue(
        new Error('Failed to launch the headless browser'),
      );

      await expect(service.getBookDetails(GOODREADS_ID)).rejects.toThrow(
        'Failed to launch the headless browser',
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

      scraper.getBookDetails.mockResolvedValue(mockScrapedDetails);

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
      expect(scraper.getBookDetails).toHaveBeenCalledWith(GOODREADS_ID);
      expect(db.delete).toHaveBeenCalled();
      expect(db.insert).toHaveBeenCalled();
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
