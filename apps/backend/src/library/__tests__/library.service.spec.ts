import { LibraryService } from '../library.service';
import { createMockDb, createChainMock, type MockDb } from '@test-utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockCoverService(overrides: Record<string, any> = {}) {
  return {
    getCoverUrl: jest
      .fn()
      .mockImplementation(
        (
          id: string,
          _coverUrl: string | null,
          _coverSource: string | null,
          apiPath: string,
        ) => `/api/${apiPath}/${id}/cover`,
      ),
    ...overrides,
  } as any;
}

function createMockMetadataResolver() {
  return {
    forAudiobooks: jest.fn().mockResolvedValue(new Map()),
    forEbooks: jest.fn().mockResolvedValue(new Map()),
  };
}

function createMockMetadataEntityService() {
  return {
    findPeopleByNames: jest.fn().mockResolvedValue(new Map()),
  };
}

/**
 * Sets up the 7 sequential db.select chains and 1 db.execute call for getStats.
 * Returns a handle so individual tests can override resolved values.
 */
function setupGetStatsChains(
  db: MockDb,
  values?: Partial<{
    audiobookCount: any[];
    duration: any[];
    seriesCount: any[];
    ebookCount: any[];
    pages: any[];
    comicSeriesCount: any[];
    comicBookCount: any[];
    authorRows: any[];
  }>,
) {
  const audiobookChain = createChainMock(['from', 'where']);
  audiobookChain.where.mockResolvedValueOnce(
    values?.audiobookCount ?? [{ count: 0 }],
  );

  const durationChain = createChainMock(['from', 'where']);
  durationChain.where.mockResolvedValueOnce(
    values?.duration ?? [{ total: null }],
  );

  const seriesChain = createChainMock(['from']);
  seriesChain.from.mockResolvedValueOnce(values?.seriesCount ?? [{ count: 0 }]);

  const ebookChain = createChainMock(['from', 'where']);
  ebookChain.where.mockResolvedValueOnce(values?.ebookCount ?? [{ count: 0 }]);

  const pagesChain = createChainMock(['from', 'where']);
  pagesChain.where.mockResolvedValueOnce(values?.pages ?? [{ total: null }]);

  const comicSeriesChain = createChainMock(['from', 'where']);
  comicSeriesChain.where.mockResolvedValueOnce(
    values?.comicSeriesCount ?? [{ count: 0 }],
  );

  const comicBookChain = createChainMock(['from', 'where']);
  comicBookChain.where.mockResolvedValueOnce(
    values?.comicBookCount ?? [{ count: 0 }],
  );

  db.select
    .mockReturnValueOnce(audiobookChain)
    .mockReturnValueOnce(durationChain)
    .mockReturnValueOnce(seriesChain)
    .mockReturnValueOnce(ebookChain)
    .mockReturnValueOnce(pagesChain)
    .mockReturnValueOnce(comicSeriesChain)
    .mockReturnValueOnce(comicBookChain);

  db.execute.mockResolvedValueOnce({
    rows: values?.authorRows ?? [{ count: 0 }],
  });

  return {
    audiobookChain,
    durationChain,
    seriesChain,
    ebookChain,
    pagesChain,
    comicSeriesChain,
    comicBookChain,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LibraryService', () => {
  let db: MockDb;
  let coverService: ReturnType<typeof createMockCoverService>;
  let metadataResolver: ReturnType<typeof createMockMetadataResolver>;
  let metadataEntityService: ReturnType<typeof createMockMetadataEntityService>;
  let service: LibraryService;

  beforeEach(() => {
    db = createMockDb();
    coverService = createMockCoverService();
    metadataResolver = createMockMetadataResolver();
    metadataEntityService = createMockMetadataEntityService();
    service = new LibraryService(
      db as any,
      coverService,
      metadataResolver as any,
      metadataEntityService as any,
    );
  });

  // -------------------------------------------------------------------------
  // getStats
  // -------------------------------------------------------------------------

  describe('getStats', () => {
    it('returns correct counts and totals when data exists', async () => {
      setupGetStatsChains(db, {
        audiobookCount: [{ count: 42 }],
        duration: [{ total: '86400' }],
        seriesCount: [{ count: 5 }],
        ebookCount: [{ count: 18 }],
        pages: [{ total: '4500' }],
        comicSeriesCount: [{ count: 7 }],
        comicBookCount: [{ count: 33 }],
        authorRows: [{ count: 10 }],
      });

      const stats = await service.getStats();

      expect(stats).toEqual({
        audiobookCount: 42,
        totalDuration: 86400,
        seriesCount: 5,
        authorCount: 10,
        ebookCount: 18,
        totalPages: 4500,
        comicSeriesCount: 7,
        comicBookCount: 33,
      });
    });

    it('returns zeros when database returns empty results', async () => {
      setupGetStatsChains(db, {
        audiobookCount: [{ count: 0 }],
        duration: [{ total: '0' }],
        seriesCount: [{ count: 0 }],
        ebookCount: [{ count: 0 }],
        pages: [{ total: '0' }],
        comicSeriesCount: [{ count: 0 }],
        comicBookCount: [{ count: 0 }],
        authorRows: [{ count: 0 }],
      });

      const stats = await service.getStats();

      expect(stats).toEqual({
        audiobookCount: 0,
        totalDuration: 0,
        seriesCount: 0,
        authorCount: 0,
        ebookCount: 0,
        totalPages: 0,
        comicSeriesCount: 0,
        comicBookCount: 0,
      });
    });

    it('handles null duration total gracefully', async () => {
      setupGetStatsChains(db, {
        audiobookCount: [{ count: 3 }],
        duration: [{ total: null }],
        seriesCount: [{ count: 1 }],
        ebookCount: [{ count: 0 }],
        pages: [{ total: '0' }],
        authorRows: [{ count: 2 }],
      });

      const stats = await service.getStats();

      expect(stats.totalDuration).toBe(0);
    });

    it('handles null page total gracefully', async () => {
      setupGetStatsChains(db, {
        audiobookCount: [{ count: 0 }],
        duration: [{ total: '0' }],
        seriesCount: [{ count: 0 }],
        ebookCount: [{ count: 1 }],
        pages: [{ total: null }],
        authorRows: [{ count: 0 }],
      });

      const stats = await service.getStats();

      expect(stats.totalPages).toBe(0);
    });

    it('handles undefined result rows with defaults', async () => {
      setupGetStatsChains(db, {
        audiobookCount: [undefined],
        duration: [undefined],
        seriesCount: [undefined],
        ebookCount: [undefined],
        pages: [undefined],
        authorRows: [{ count: 0 }],
      });

      const stats = await service.getStats();

      expect(stats.audiobookCount).toBe(0);
      expect(stats.totalDuration).toBe(0);
      expect(stats.seriesCount).toBe(0);
      expect(stats.ebookCount).toBe(0);
      expect(stats.totalPages).toBe(0);
    });

    it('invokes db.select seven times and db.execute once', async () => {
      setupGetStatsChains(db);

      await service.getStats();

      expect(db.select).toHaveBeenCalledTimes(7);
      expect(db.execute).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // searchLibrary
  // -------------------------------------------------------------------------

  describe('searchLibrary', () => {
    it('returns empty arrays when no results match', async () => {
      db.execute.mockResolvedValue({ rows: [] });

      const result = await service.searchLibrary('nonexistent');

      expect(result).toEqual({ audiobooks: [], ebooks: [] });
    });

    it('calls coverService.getCoverUrl for audiobook results', async () => {
      db.execute
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'ab-1',
              title: 'Test Book',
              subtitle: null,
              cover_url: 'cover.jpg',
              cover_source: 'local',
              similarity: 0.8,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }); // ebooks query

      const authorChain = createChainMock(['from', 'innerJoin', 'where']);
      authorChain.where.mockResolvedValueOnce([
        { id: 'author-1', name: 'Author One' },
      ]);
      db.select.mockReturnValueOnce(authorChain);

      await service.searchLibrary('Test');

      expect(coverService.getCoverUrl).toHaveBeenCalledWith(
        'ab-1',
        'cover.jpg',
        'local',
        'audiobooks',
      );
    });

    it('calls coverService.getCoverUrl for ebook results', async () => {
      db.execute
        .mockResolvedValueOnce({ rows: [] }) // audiobooks query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'eb-1',
              title: 'Ebook One',
              subtitle: null,
              cover_url: 'ebook-cover.jpg',
              cover_source: 'local',
              similarity: 0.7,
            },
          ],
        });

      const authorChain = createChainMock(['from', 'innerJoin', 'where']);
      authorChain.where.mockResolvedValueOnce([
        { id: 'author-2', name: 'Author Two' },
      ]);
      db.select.mockReturnValueOnce(authorChain);

      await service.searchLibrary('Ebook');

      expect(coverService.getCoverUrl).toHaveBeenCalledWith(
        'eb-1',
        'ebook-cover.jpg',
        'local',
        'ebooks',
      );
    });

    it('only queries audiobooks when contentType is audiobooks', async () => {
      db.execute.mockResolvedValueOnce({ rows: [] });

      const result = await service.searchLibrary('query', 'audiobooks');

      expect(db.execute).toHaveBeenCalledTimes(1);
      expect(result.ebooks).toEqual([]);
    });

    it('only queries ebooks when contentType is ebooks', async () => {
      db.execute.mockResolvedValueOnce({ rows: [] });

      const result = await service.searchLibrary('query', 'ebooks');

      expect(db.execute).toHaveBeenCalledTimes(1);
      expect(result.audiobooks).toEqual([]);
    });

    it('sorts results by similarity descending', async () => {
      db.execute
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'ab-1',
              title: 'Low Match',
              subtitle: null,
              cover_url: null,
              cover_source: null,
              similarity: 0.4,
            },
            {
              id: 'ab-2',
              title: 'High Match',
              subtitle: null,
              cover_url: null,
              cover_source: null,
              similarity: 0.9,
            },
            {
              id: 'ab-3',
              title: 'Mid Match',
              subtitle: null,
              cover_url: null,
              cover_source: null,
              similarity: 0.6,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }); // ebooks

      const authorChain = createChainMock(['from', 'innerJoin', 'where']);
      authorChain.where.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(authorChain);

      const result = await service.searchLibrary('Match');

      expect(result.audiobooks[0].similarity).toBe(0.9);
      expect(result.audiobooks[1].similarity).toBe(0.6);
      expect(result.audiobooks[2].similarity).toBe(0.4);
    });

    it('fetches authors for all audiobook results in one query', async () => {
      db.execute
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'ab-1',
              title: 'Book',
              subtitle: null,
              cover_url: null,
              cover_source: null,
              similarity: 0.8,
            },
            {
              id: 'ab-2',
              title: 'Other Book',
              subtitle: null,
              cover_url: null,
              cover_source: null,
              similarity: 0.5,
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }); // ebooks

      const authorChain = createChainMock(['from', 'innerJoin', 'where']);
      authorChain.where.mockResolvedValueOnce([
        { bookId: 'ab-1', id: 'p-1', name: 'Jane Doe' },
        { bookId: 'ab-1', id: 'p-2', name: 'John Doe' },
        { bookId: 'ab-2', id: 'p-3', name: 'Ann Other' },
      ]);
      db.select.mockReturnValueOnce(authorChain);

      const result = await service.searchLibrary('Book');

      expect(result.audiobooks[0].authors).toEqual([
        { id: 'p-1', name: 'Jane Doe' },
        { id: 'p-2', name: 'John Doe' },
      ]);
      expect(result.audiobooks[1].authors).toEqual([
        { id: 'p-3', name: 'Ann Other' },
      ]);
      expect(db.select).toHaveBeenCalledTimes(1);
    });

    it('shows the resolved title, subtitle and authors', async () => {
      db.execute.mockResolvedValueOnce({
        rows: [
          {
            id: 'ab-1',
            title: 'Martin, George R R - ASOIAF 2 - A Clash of Kings',
            subtitle: 'Unabridged',
            cover_url: null,
            cover_source: null,
            similarity: 0.8,
          },
        ],
      });

      const authorChain = createChainMock(['from', 'innerJoin', 'where']);
      authorChain.where.mockResolvedValueOnce([
        { bookId: 'ab-1', id: 'p-1', name: 'George R R Martin' },
      ]);
      db.select.mockReturnValueOnce(authorChain);

      metadataResolver.forAudiobooks.mockResolvedValueOnce(
        new Map([
          [
            'ab-1',
            {
              title: 'A Clash of Kings',
              subtitle: 'A Song of Ice and Fire, Book 2',
              authorNames: ['George R.R. Martin'],
            },
          ],
        ]),
      );
      metadataEntityService.findPeopleByNames.mockResolvedValueOnce(
        new Map([
          ['george r.r. martin', { id: 'p-9', name: 'George R.R. Martin' }],
        ]),
      );

      const result = await service.searchLibrary('clash', 'audiobooks');

      expect(metadataResolver.forAudiobooks).toHaveBeenCalledWith(['ab-1']);
      expect(metadataEntityService.findPeopleByNames).toHaveBeenCalledWith([
        'George R.R. Martin',
      ]);
      expect(result.audiobooks[0]).toMatchObject({
        title: 'A Clash of Kings',
        subtitle: 'A Song of Ice and Fire, Book 2',
        authors: [{ id: 'p-9', name: 'George R.R. Martin' }],
      });
    });

    it("keeps the book's own author ids when embedded authors win", async () => {
      db.execute.mockResolvedValueOnce({
        rows: [
          {
            id: 'eb-1',
            title: 'Book',
            subtitle: null,
            cover_url: null,
            cover_source: null,
            similarity: 0.8,
          },
        ],
      });

      const authorChain = createChainMock(['from', 'innerJoin', 'where']);
      authorChain.where.mockResolvedValueOnce([
        { bookId: 'eb-1', id: 'p-1', name: 'Jane Doe' },
      ]);
      db.select.mockReturnValueOnce(authorChain);

      metadataResolver.forEbooks.mockResolvedValueOnce(
        new Map([
          [
            'eb-1',
            { title: 'Book', subtitle: null, authorNames: ['Jane Doe'] },
          ],
        ]),
      );

      const result = await service.searchLibrary('Book', 'ebooks');

      expect(metadataResolver.forEbooks).toHaveBeenCalledWith(['eb-1']);
      expect(metadataEntityService.findPeopleByNames).toHaveBeenCalledWith([]);
      expect(result.ebooks[0].authors).toEqual([
        { id: 'p-1', name: 'Jane Doe' },
      ]);
    });

    it('drops resolved authors with no person to link to', async () => {
      db.execute.mockResolvedValueOnce({
        rows: [
          {
            id: 'ab-1',
            title: 'Book',
            subtitle: null,
            cover_url: null,
            cover_source: null,
            similarity: 0.8,
          },
        ],
      });

      const authorChain = createChainMock(['from', 'innerJoin', 'where']);
      authorChain.where.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce(authorChain);

      metadataResolver.forAudiobooks.mockResolvedValueOnce(
        new Map([
          [
            'ab-1',
            { title: 'Book', subtitle: null, authorNames: ['Not Imported'] },
          ],
        ]),
      );

      const result = await service.searchLibrary('Book', 'audiobooks');

      expect(result.audiobooks[0].authors).toEqual([]);
    });

    it('skips resolution when nothing matches', async () => {
      db.execute.mockResolvedValue({ rows: [] });

      await service.searchLibrary('nonexistent');

      expect(metadataResolver.forAudiobooks).not.toHaveBeenCalled();
      expect(metadataResolver.forEbooks).not.toHaveBeenCalled();
      expect(db.select).not.toHaveBeenCalled();
    });
  });
});
