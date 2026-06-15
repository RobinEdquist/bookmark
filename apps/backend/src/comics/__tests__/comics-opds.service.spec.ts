import { ComicsOpdsService } from '../comics-opds.service';
import { ComicProgressService } from '../../comic-progress/comic-progress.service';

const BASE = 'http://host/api/comics/opds';

describe('ComicsOpdsService', () => {
  function build(
    dbOverrides: Record<string, unknown> = {},
    progress: Record<string, unknown> | null = null,
  ) {
    const db = { select: jest.fn(), ...dbOverrides };
    const progressService = {
      getProgress: jest.fn().mockResolvedValue(progress),
    } as unknown as ComicProgressService;
    return new ComicsOpdsService(db as never, progressService);
  }

  describe('buildRootCatalog', () => {
    it('returns valid OPDS XML with the expected sections', async () => {
      const service = build();
      const xml = await service.buildRootCatalog(BASE);
      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<title>Comic Library</title>');
      expect(xml).toContain('<title>All Series</title>');
      expect(xml).toContain('<title>Publishers</title>');
      expect(xml).toContain('<title>Collections</title>');
      expect(xml).toContain('<title>On Deck</title>');
      expect(xml).toContain('<title>Recently Added</title>');
    });

    it('escapes special characters in the base URL', async () => {
      const service = build();
      const xml = await service.buildRootCatalog('http://h/c?a=1&b=2');
      expect(xml).toContain('a=1&amp;b=2');
      expect(xml).not.toMatch(/a=1&b=2/);
    });
  });

  describe('buildIssueEntry (via a helper exposed for testing)', () => {
    it('emits a zero-based PSE stream link with pse:count', async () => {
      const service = build();
      const xml = await service.buildIssueEntryXml(
        {
          id: 'book-1',
          seriesId: 's1',
          title: 'Issue One',
          number: '1',
          summary: null,
          coverDate: null,
          coverUrl: 'abc.jpg',
          coverSource: 'embedded',
          pageCount: 22,
          container: 'cbz',
          language: null,
          updatedAt: new Date('2026-01-01T00:00:00Z'),
        } as never,
        [],
        BASE,
        'user-1',
      );
      expect(xml).toContain('rel="http://vaemendis.net/opds-pse/stream"');
      expect(xml).toContain('pse:count="22"');
      expect(xml).toContain('/api/comics/opds/books/book-1/pages/{pageNumber}');
      // download + cover point at the existing comics endpoints
      expect(xml).toContain('/api/comics/books/book-1/download');
      expect(xml).toContain('/api/comics/books/book-1/cover');
    });

    it('omits the PSE link when pageCount is null', async () => {
      const service = build();
      const xml = await service.buildIssueEntryXml(
        {
          id: 'book-2',
          seriesId: 's1',
          title: 'No Pages',
          number: '2',
          summary: null,
          coverDate: null,
          coverUrl: null,
          coverSource: null,
          pageCount: null,
          container: 'cbz',
          language: null,
          updatedAt: new Date('2026-01-01T00:00:00Z'),
        } as never,
        [],
        BASE,
        'user-1',
      );
      expect(xml).not.toContain('opds-pse/stream');
      expect(xml).toContain('/api/comics/books/book-2/download');
    });

    it('includes pse:lastRead when the user has progress', async () => {
      const service = build(
        {},
        {
          comicBookId: 'book-1',
          currentPage: 5,
          pageCount: 22,
          status: 'in_progress',
          startedAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      );
      const xml = await service.buildIssueEntryXml(
        {
          id: 'book-1',
          seriesId: 's1',
          title: 'Issue One',
          number: '1',
          summary: null,
          coverDate: null,
          coverUrl: null,
          coverSource: null,
          pageCount: 22,
          container: 'cbz',
          language: null,
          updatedAt: new Date('2026-01-01T00:00:00Z'),
        } as never,
        [],
        BASE,
        'user-1',
      );
      expect(xml).toContain('pse:lastRead="5"');
      expect(xml).toContain('pse:lastReadDate="2026-01-02T00:00:00.000Z"');
    });

    it('escapes XML-special characters in the title', async () => {
      const service = build();
      const xml = await service.buildIssueEntryXml(
        {
          id: 'book-1',
          seriesId: 's1',
          title: 'Batman & Robin <1>',
          number: '1',
          summary: null,
          coverDate: null,
          coverUrl: null,
          coverSource: null,
          pageCount: 22,
          container: 'cbz',
          language: null,
          updatedAt: new Date('2026-01-01T00:00:00Z'),
        } as never,
        [],
        BASE,
        'user-1',
      );
      expect(xml).toContain('Batman &amp; Robin &lt;1&gt;');
      expect(xml).not.toContain('<1>');
    });
  });

  describe('buildAllSeriesFeed', () => {
    it('lists available series with subsection links', async () => {
      const seriesRow = { id: 's-1', title: 'Saga', sortTitle: 'Saga' };
      // Mock the .select().from().where().orderBy() chain; orderBy resolves the
      // query (it is awaited directly).
      const orderBy = jest.fn().mockResolvedValue([seriesRow]);
      const where = jest.fn().mockReturnValue({ orderBy });
      const from = jest.fn().mockReturnValue({ where });
      const select = jest.fn().mockReturnValue({ from });
      const service = build({ select });

      const xml = await service.buildAllSeriesFeed(BASE, 'user-1');

      expect(xml).toContain('<title>All Series</title>');
      expect(xml).toContain('<title>Saga</title>');
      expect(xml).toContain(`rel="subsection" href="${BASE}/series/s-1"`);
    });
  });
});
