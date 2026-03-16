import { createMockDb, createChainMock, buildEbook } from '@test-utils';
import { OpdsService } from '../opds.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_URL = 'http://localhost:3000/api/ebooks/opds';

function makeEbook(overrides: Record<string, any> = {}) {
  return buildEbook({
    id: 'ebook-1',
    title: 'Test Ebook',
    description: 'A test description',
    coverUrl: 'cover.jpg',
    coverSource: null,
    publishedDate: '2024-01-01',
    language: 'en',
    isbn: '1234567890',
    format: 'epub',
    status: 'available',
    updatedAt: new Date('2026-01-15T12:00:00.000Z'),
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OpdsService', () => {
  // -----------------------------------------------------------------------
  // escapeXml (tested via buildRootCatalog output)
  // -----------------------------------------------------------------------
  describe('escapeXml (via buildRootCatalog)', () => {
    it('escapes &, <, >, ", and \' in the baseUrl', async () => {
      const db = createMockDb();
      const service = new OpdsService(db as any);

      const result = await service.buildRootCatalog(
        'http://example.com?a=1&b=2<>"\'',
      );

      expect(result).toContain(
        'http://example.com?a=1&amp;b=2&lt;&gt;&quot;&apos;',
      );
      expect(result).not.toContain('&b=2<>"\'');
    });
  });

  // -----------------------------------------------------------------------
  // truncateDescription (tested via buildEbookEntries output)
  // -----------------------------------------------------------------------
  describe('truncateDescription (via buildAllEbooksFeed)', () => {
    it('returns no summary element when description is null', async () => {
      const db = createMockDb();
      const service = new OpdsService(db as any);

      const ebook = makeEbook({ description: null });

      const countChain = createChainMock(['from', 'where']);
      countChain.where.mockResolvedValueOnce([{ total: 1 }]);

      const ebooksChain = createChainMock([
        'from',
        'where',
        'orderBy',
        'limit',
        'offset',
      ]);
      ebooksChain.offset.mockResolvedValueOnce([ebook]);

      const authorsChain = createChainMock([
        'from',
        'innerJoin',
        'where',
        'orderBy',
      ]);
      authorsChain.orderBy.mockResolvedValueOnce([]);

      db.select
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(ebooksChain)
        .mockReturnValueOnce(authorsChain);

      const result = await service.buildAllEbooksFeed(BASE_URL, 1, 20);

      expect(result).not.toContain('<summary>');
    });

    it('strips HTML tags from description', async () => {
      const db = createMockDb();
      const service = new OpdsService(db as any);

      const ebook = makeEbook({
        description: '<p>Hello <strong>world</strong></p>',
      });

      const countChain = createChainMock(['from', 'where']);
      countChain.where.mockResolvedValueOnce([{ total: 1 }]);

      const ebooksChain = createChainMock([
        'from',
        'where',
        'orderBy',
        'limit',
        'offset',
      ]);
      ebooksChain.offset.mockResolvedValueOnce([ebook]);

      const authorsChain = createChainMock([
        'from',
        'innerJoin',
        'where',
        'orderBy',
      ]);
      authorsChain.orderBy.mockResolvedValueOnce([]);

      db.select
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(ebooksChain)
        .mockReturnValueOnce(authorsChain);

      const result = await service.buildAllEbooksFeed(BASE_URL, 1, 20);

      expect(result).toContain('<summary>Hello world</summary>');
      expect(result).not.toContain('<p>');
      expect(result).not.toContain('<strong>');
    });

    it('truncates description with "..." when over maxLength', async () => {
      const db = createMockDb();
      const service = new OpdsService(db as any);

      const longText = 'A'.repeat(600);
      const ebook = makeEbook({ description: longText });

      const countChain = createChainMock(['from', 'where']);
      countChain.where.mockResolvedValueOnce([{ total: 1 }]);

      const ebooksChain = createChainMock([
        'from',
        'where',
        'orderBy',
        'limit',
        'offset',
      ]);
      ebooksChain.offset.mockResolvedValueOnce([ebook]);

      const authorsChain = createChainMock([
        'from',
        'innerJoin',
        'where',
        'orderBy',
      ]);
      authorsChain.orderBy.mockResolvedValueOnce([]);

      db.select
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(ebooksChain)
        .mockReturnValueOnce(authorsChain);

      const result = await service.buildAllEbooksFeed(BASE_URL, 1, 20);

      // Should have 500 A's + '...'
      expect(result).toContain('A'.repeat(500) + '...');
    });

    it('returns full text when under maxLength', async () => {
      const db = createMockDb();
      const service = new OpdsService(db as any);

      const shortText = 'Short description';
      const ebook = makeEbook({ description: shortText });

      const countChain = createChainMock(['from', 'where']);
      countChain.where.mockResolvedValueOnce([{ total: 1 }]);

      const ebooksChain = createChainMock([
        'from',
        'where',
        'orderBy',
        'limit',
        'offset',
      ]);
      ebooksChain.offset.mockResolvedValueOnce([ebook]);

      const authorsChain = createChainMock([
        'from',
        'innerJoin',
        'where',
        'orderBy',
      ]);
      authorsChain.orderBy.mockResolvedValueOnce([]);

      db.select
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(ebooksChain)
        .mockReturnValueOnce(authorsChain);

      const result = await service.buildAllEbooksFeed(BASE_URL, 1, 20);

      expect(result).toContain('<summary>Short description</summary>');
      expect(result).not.toContain('...');
    });
  });

  // -----------------------------------------------------------------------
  // buildRootCatalog
  // -----------------------------------------------------------------------
  describe('buildRootCatalog', () => {
    it('returns valid XML with 3 entries', async () => {
      const db = createMockDb();
      const service = new OpdsService(db as any);

      const result = await service.buildRootCatalog(BASE_URL);

      expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(result).toContain('<title>All Ebooks</title>');
      expect(result).toContain('<title>By Author</title>');
      expect(result).toContain('<title>By Series</title>');
      expect(result).toContain('<title>Ebook Library</title>');
    });

    it('escapes special characters in baseUrl', async () => {
      const db = createMockDb();
      const service = new OpdsService(db as any);

      const urlWithSpecial = 'http://host.com/path?foo=1&bar=2';
      const result = await service.buildRootCatalog(urlWithSpecial);

      expect(result).toContain('http://host.com/path?foo=1&amp;bar=2');
      // Raw & should not appear (except inside &amp;)
      expect(result).not.toMatch(/&bar/);
    });
  });

  // -----------------------------------------------------------------------
  // buildAllEbooksFeed
  // -----------------------------------------------------------------------
  describe('buildAllEbooksFeed', () => {
    it('queries for available ebooks only and returns entries', async () => {
      const db = createMockDb();
      const service = new OpdsService(db as any);

      const ebook = makeEbook();

      const countChain = createChainMock(['from', 'where']);
      countChain.where.mockResolvedValueOnce([{ total: 1 }]);

      const ebooksChain = createChainMock([
        'from',
        'where',
        'orderBy',
        'limit',
        'offset',
      ]);
      ebooksChain.offset.mockResolvedValueOnce([ebook]);

      const authorsChain = createChainMock([
        'from',
        'innerJoin',
        'where',
        'orderBy',
      ]);
      authorsChain.orderBy.mockResolvedValueOnce([{ name: 'Author One' }]);

      db.select
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(ebooksChain)
        .mockReturnValueOnce(authorsChain);

      const result = await service.buildAllEbooksFeed(BASE_URL, 1, 20);

      expect(result).toContain('<title>All Ebooks</title>');
      expect(result).toContain('<title>Test Ebook</title>');
      expect(result).toContain('<author><name>Author One</name></author>');
    });

    it('includes next pagination link when there are multiple pages', async () => {
      const db = createMockDb();
      const service = new OpdsService(db as any);

      const ebook = makeEbook();

      const countChain = createChainMock(['from', 'where']);
      countChain.where.mockResolvedValueOnce([{ total: 25 }]);

      const ebooksChain = createChainMock([
        'from',
        'where',
        'orderBy',
        'limit',
        'offset',
      ]);
      ebooksChain.offset.mockResolvedValueOnce([ebook]);

      const authorsChain = createChainMock([
        'from',
        'innerJoin',
        'where',
        'orderBy',
      ]);
      authorsChain.orderBy.mockResolvedValueOnce([]);

      db.select
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(ebooksChain)
        .mockReturnValueOnce(authorsChain);

      const result = await service.buildAllEbooksFeed(BASE_URL, 1, 20);

      expect(result).toContain('rel="next"');
      expect(result).toContain('page=2');
    });

    it('does not include next link on last page', async () => {
      const db = createMockDb();
      const service = new OpdsService(db as any);

      const ebook = makeEbook();

      const countChain = createChainMock(['from', 'where']);
      countChain.where.mockResolvedValueOnce([{ total: 25 }]);

      const ebooksChain = createChainMock([
        'from',
        'where',
        'orderBy',
        'limit',
        'offset',
      ]);
      ebooksChain.offset.mockResolvedValueOnce([ebook]);

      const authorsChain = createChainMock([
        'from',
        'innerJoin',
        'where',
        'orderBy',
      ]);
      authorsChain.orderBy.mockResolvedValueOnce([]);

      db.select
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(ebooksChain)
        .mockReturnValueOnce(authorsChain);

      const result = await service.buildAllEbooksFeed(BASE_URL, 2, 20);

      expect(result).not.toContain('rel="next"');
    });

    it('does not include previous link on first page', async () => {
      const db = createMockDb();
      const service = new OpdsService(db as any);

      const ebook = makeEbook();

      const countChain = createChainMock(['from', 'where']);
      countChain.where.mockResolvedValueOnce([{ total: 25 }]);

      const ebooksChain = createChainMock([
        'from',
        'where',
        'orderBy',
        'limit',
        'offset',
      ]);
      ebooksChain.offset.mockResolvedValueOnce([ebook]);

      const authorsChain = createChainMock([
        'from',
        'innerJoin',
        'where',
        'orderBy',
      ]);
      authorsChain.orderBy.mockResolvedValueOnce([]);

      db.select
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(ebooksChain)
        .mockReturnValueOnce(authorsChain);

      const result = await service.buildAllEbooksFeed(BASE_URL, 1, 20);

      expect(result).not.toContain('rel="previous"');
    });
  });

  // -----------------------------------------------------------------------
  // buildAuthorsNavigationFeed
  // -----------------------------------------------------------------------
  describe('buildAuthorsNavigationFeed', () => {
    it('lists authors with ebook counts', async () => {
      const db = createMockDb();
      const service = new OpdsService(db as any);

      const authorsNavChain = createChainMock([
        'from',
        'innerJoin',
        'where',
        'groupBy',
        'orderBy',
      ]);
      authorsNavChain.orderBy.mockResolvedValueOnce([
        { id: 'author-1', name: 'Jane Austen', count: 3 },
        { id: 'author-2', name: 'Mark Twain', count: 1 },
      ]);

      db.select.mockReturnValueOnce(authorsNavChain);

      const result = await service.buildAuthorsNavigationFeed(BASE_URL);

      expect(result).toContain('<title>Authors</title>');
      expect(result).toContain('<title>Jane Austen</title>');
      expect(result).toContain('3 ebooks');
      expect(result).toContain('<title>Mark Twain</title>');
      expect(result).toContain('1 ebook');
      // Verify singular vs plural
      expect(result).not.toMatch(/1 ebooks/);
    });
  });

  // -----------------------------------------------------------------------
  // buildAuthorFeed
  // -----------------------------------------------------------------------
  describe('buildAuthorFeed', () => {
    it('throws Error when author not found', async () => {
      const db = createMockDb();
      const service = new OpdsService(db as any);

      const authorChain = createChainMock(['from', 'where', 'limit']);
      authorChain.limit.mockResolvedValueOnce([]);

      db.select.mockReturnValueOnce(authorChain);

      await expect(
        service.buildAuthorFeed(BASE_URL, 'nonexistent-author'),
      ).rejects.toThrow('Author not found');
    });

    it('returns ebooks by author', async () => {
      const db = createMockDb();
      const service = new OpdsService(db as any);

      const ebook = makeEbook();

      // 1. author lookup
      const authorChain = createChainMock(['from', 'where', 'limit']);
      authorChain.limit.mockResolvedValueOnce([
        { id: 'author-1', name: 'Jane Austen' },
      ]);

      // 2. ebookAuthors lookup for author's ebook IDs
      const ebookIdsChain = createChainMock(['from', 'where']);
      ebookIdsChain.where.mockResolvedValueOnce([{ ebookId: ebook.id }]);

      // 3. all available ebooks
      const allEbooksChain = createChainMock(['from', 'where', 'orderBy']);
      allEbooksChain.orderBy.mockResolvedValueOnce([ebook]);

      // 4. buildEbookEntries: authors for the ebook
      const entryAuthorsChain = createChainMock([
        'from',
        'innerJoin',
        'where',
        'orderBy',
      ]);
      entryAuthorsChain.orderBy.mockResolvedValueOnce([
        { name: 'Jane Austen' },
      ]);

      db.select
        .mockReturnValueOnce(authorChain)
        .mockReturnValueOnce(ebookIdsChain)
        .mockReturnValueOnce(allEbooksChain)
        .mockReturnValueOnce(entryAuthorsChain);

      const result = await service.buildAuthorFeed(BASE_URL, 'author-1');

      expect(result).toContain('<title>Jane Austen</title>');
      expect(result).toContain('<title>Test Ebook</title>');
      expect(result).toContain('<author><name>Jane Austen</name></author>');
    });
  });

  // -----------------------------------------------------------------------
  // buildSeriesNavigationFeed
  // -----------------------------------------------------------------------
  describe('buildSeriesNavigationFeed', () => {
    it('lists series with ebook counts', async () => {
      const db = createMockDb();
      const service = new OpdsService(db as any);

      const seriesNavChain = createChainMock([
        'from',
        'innerJoin',
        'where',
        'groupBy',
        'orderBy',
      ]);
      seriesNavChain.orderBy.mockResolvedValueOnce([
        { id: 'series-1', name: 'Dune', count: 5 },
        { id: 'series-2', name: 'Foundation', count: 1 },
      ]);

      db.select.mockReturnValueOnce(seriesNavChain);

      const result = await service.buildSeriesNavigationFeed(BASE_URL);

      expect(result).toContain('<title>Series</title>');
      expect(result).toContain('<title>Dune</title>');
      expect(result).toContain('5 ebooks');
      expect(result).toContain('<title>Foundation</title>');
      expect(result).toContain('1 ebook');
      expect(result).not.toMatch(/1 ebooks/);
    });
  });

  // -----------------------------------------------------------------------
  // buildSeriesFeed
  // -----------------------------------------------------------------------
  describe('buildSeriesFeed', () => {
    it('throws Error when series not found', async () => {
      const db = createMockDb();
      const service = new OpdsService(db as any);

      const seriesChain = createChainMock(['from', 'where', 'limit']);
      seriesChain.limit.mockResolvedValueOnce([]);

      db.select.mockReturnValueOnce(seriesChain);

      await expect(
        service.buildSeriesFeed(BASE_URL, 'nonexistent-series'),
      ).rejects.toThrow('Series not found');
    });

    it('returns ebooks ordered by series position', async () => {
      const db = createMockDb();
      const service = new OpdsService(db as any);

      const ebook1 = makeEbook({ id: 'ebook-1', title: 'Book One' });
      const ebook2 = makeEbook({ id: 'ebook-2', title: 'Book Two' });

      // 1. series lookup
      const seriesChain = createChainMock(['from', 'where', 'limit']);
      seriesChain.limit.mockResolvedValueOnce([
        { id: 'series-1', name: 'Dune' },
      ]);

      // 2. ebooks in series (ordered by position)
      const ebooksInSeriesChain = createChainMock([
        'from',
        'innerJoin',
        'where',
        'orderBy',
      ]);
      ebooksInSeriesChain.orderBy.mockResolvedValueOnce([
        { ebook: ebook1, order: '1.0' },
        { ebook: ebook2, order: '2.0' },
      ]);

      // 3-4. buildEbookEntries: authors for each ebook
      const authors1Chain = createChainMock([
        'from',
        'innerJoin',
        'where',
        'orderBy',
      ]);
      authors1Chain.orderBy.mockResolvedValueOnce([{ name: 'Frank Herbert' }]);

      const authors2Chain = createChainMock([
        'from',
        'innerJoin',
        'where',
        'orderBy',
      ]);
      authors2Chain.orderBy.mockResolvedValueOnce([{ name: 'Frank Herbert' }]);

      db.select
        .mockReturnValueOnce(seriesChain)
        .mockReturnValueOnce(ebooksInSeriesChain)
        .mockReturnValueOnce(authors1Chain)
        .mockReturnValueOnce(authors2Chain);

      const result = await service.buildSeriesFeed(BASE_URL, 'series-1');

      expect(result).toContain('<title>Dune</title>');
      expect(result).toContain('<title>Book One</title>');
      expect(result).toContain('<title>Book Two</title>');
      // Verify Book One appears before Book Two in the output
      const bookOneIdx = result.indexOf('Book One');
      const bookTwoIdx = result.indexOf('Book Two');
      expect(bookOneIdx).toBeLessThan(bookTwoIdx);
    });

    it('filters to available status only', async () => {
      const db = createMockDb();
      const service = new OpdsService(db as any);

      const availableEbook = makeEbook({
        id: 'ebook-1',
        title: 'Available Book',
        status: 'available',
      });
      const missingEbook = makeEbook({
        id: 'ebook-2',
        title: 'Missing Book',
        status: 'missing',
      });

      // 1. series lookup
      const seriesChain = createChainMock(['from', 'where', 'limit']);
      seriesChain.limit.mockResolvedValueOnce([
        { id: 'series-1', name: 'Test Series' },
      ]);

      // 2. ebooks in series - includes missing ebook
      const ebooksInSeriesChain = createChainMock([
        'from',
        'innerJoin',
        'where',
        'orderBy',
      ]);
      ebooksInSeriesChain.orderBy.mockResolvedValueOnce([
        { ebook: availableEbook, order: '1.0' },
        { ebook: missingEbook, order: '2.0' },
      ]);

      // 3. buildEbookEntries: only the available ebook gets author lookup
      const authorsChain = createChainMock([
        'from',
        'innerJoin',
        'where',
        'orderBy',
      ]);
      authorsChain.orderBy.mockResolvedValueOnce([{ name: 'Author' }]);

      db.select
        .mockReturnValueOnce(seriesChain)
        .mockReturnValueOnce(ebooksInSeriesChain)
        .mockReturnValueOnce(authorsChain);

      const result = await service.buildSeriesFeed(BASE_URL, 'series-1');

      expect(result).toContain('Available Book');
      expect(result).not.toContain('Missing Book');
    });
  });

  // -----------------------------------------------------------------------
  // buildEbookEntries (tested via buildAllEbooksFeed)
  // -----------------------------------------------------------------------
  describe('buildEbookEntries (via buildAllEbooksFeed)', () => {
    it('includes author names in entry', async () => {
      const db = createMockDb();
      const service = new OpdsService(db as any);

      const ebook = makeEbook();

      const countChain = createChainMock(['from', 'where']);
      countChain.where.mockResolvedValueOnce([{ total: 1 }]);

      const ebooksChain = createChainMock([
        'from',
        'where',
        'orderBy',
        'limit',
        'offset',
      ]);
      ebooksChain.offset.mockResolvedValueOnce([ebook]);

      const authorsChain = createChainMock([
        'from',
        'innerJoin',
        'where',
        'orderBy',
      ]);
      authorsChain.orderBy.mockResolvedValueOnce([
        { name: 'Author A' },
        { name: 'Author B' },
      ]);

      db.select
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(ebooksChain)
        .mockReturnValueOnce(authorsChain);

      const result = await service.buildAllEbooksFeed(BASE_URL, 1, 20);

      expect(result).toContain('<author><name>Author A</name></author>');
      expect(result).toContain('<author><name>Author B</name></author>');
    });

    it('includes cover link when coverUrl is set', async () => {
      const db = createMockDb();
      const service = new OpdsService(db as any);

      const ebook = makeEbook({ coverUrl: 'cover.jpg' });

      const countChain = createChainMock(['from', 'where']);
      countChain.where.mockResolvedValueOnce([{ total: 1 }]);

      const ebooksChain = createChainMock([
        'from',
        'where',
        'orderBy',
        'limit',
        'offset',
      ]);
      ebooksChain.offset.mockResolvedValueOnce([ebook]);

      const authorsChain = createChainMock([
        'from',
        'innerJoin',
        'where',
        'orderBy',
      ]);
      authorsChain.orderBy.mockResolvedValueOnce([]);

      db.select
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(ebooksChain)
        .mockReturnValueOnce(authorsChain);

      const result = await service.buildAllEbooksFeed(BASE_URL, 1, 20);

      expect(result).toContain('rel="http://opds-spec.org/image"');
      expect(result).toContain(`/${ebook.id}/cover`);
      expect(result).toContain('rel="http://opds-spec.org/image/thumbnail"');
    });

    it('includes ISBN when available', async () => {
      const db = createMockDb();
      const service = new OpdsService(db as any);

      const ebook = makeEbook({ isbn: '978-0-123456-78-9' });

      const countChain = createChainMock(['from', 'where']);
      countChain.where.mockResolvedValueOnce([{ total: 1 }]);

      const ebooksChain = createChainMock([
        'from',
        'where',
        'orderBy',
        'limit',
        'offset',
      ]);
      ebooksChain.offset.mockResolvedValueOnce([ebook]);

      const authorsChain = createChainMock([
        'from',
        'innerJoin',
        'where',
        'orderBy',
      ]);
      authorsChain.orderBy.mockResolvedValueOnce([]);

      db.select
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(ebooksChain)
        .mockReturnValueOnce(authorsChain);

      const result = await service.buildAllEbooksFeed(BASE_URL, 1, 20);

      expect(result).toContain('urn:isbn:978-0-123456-78-9');
    });

    it('includes language when available', async () => {
      const db = createMockDb();
      const service = new OpdsService(db as any);

      const ebook = makeEbook({ language: 'sv' });

      const countChain = createChainMock(['from', 'where']);
      countChain.where.mockResolvedValueOnce([{ total: 1 }]);

      const ebooksChain = createChainMock([
        'from',
        'where',
        'orderBy',
        'limit',
        'offset',
      ]);
      ebooksChain.offset.mockResolvedValueOnce([ebook]);

      const authorsChain = createChainMock([
        'from',
        'innerJoin',
        'where',
        'orderBy',
      ]);
      authorsChain.orderBy.mockResolvedValueOnce([]);

      db.select
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(ebooksChain)
        .mockReturnValueOnce(authorsChain);

      const result = await service.buildAllEbooksFeed(BASE_URL, 1, 20);

      expect(result).toContain('<dc:language');
      expect(result).toContain('sv</dc:language>');
    });

    it('includes download link with acquisition rel', async () => {
      const db = createMockDb();
      const service = new OpdsService(db as any);

      const ebook = makeEbook();

      const countChain = createChainMock(['from', 'where']);
      countChain.where.mockResolvedValueOnce([{ total: 1 }]);

      const ebooksChain = createChainMock([
        'from',
        'where',
        'orderBy',
        'limit',
        'offset',
      ]);
      ebooksChain.offset.mockResolvedValueOnce([ebook]);

      const authorsChain = createChainMock([
        'from',
        'innerJoin',
        'where',
        'orderBy',
      ]);
      authorsChain.orderBy.mockResolvedValueOnce([]);

      db.select
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(ebooksChain)
        .mockReturnValueOnce(authorsChain);

      const result = await service.buildAllEbooksFeed(BASE_URL, 1, 20);

      expect(result).toContain('rel="http://opds-spec.org/acquisition"');
      expect(result).toContain(`/${ebook.id}/download`);
      expect(result).toContain('type="application/epub+zip"');
    });
  });
});
