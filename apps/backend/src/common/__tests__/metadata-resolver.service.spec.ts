import * as audiobookSchema from '../../audiobooks/schema';
import * as ebookSchema from '../../ebooks/schema';
import * as hardcoverSchema from '../../hardcover/schema';
import * as goodreadsSchema from '../../gr-finder/schema';
import {
  DEFAULT_METADATA_PRIORITY,
  type MetadataFieldPriority,
} from '../../app-settings/schema';
import { MetadataResolverService } from '../metadata-resolver.service';

/**
 * Every query the resolver runs reads from a distinct table, so results are
 * keyed by the table passed to `.from()` and the stub stays independent of
 * call ordering.
 */
function createDb(resultsByTable: Map<unknown, unknown[]>) {
  return {
    select: jest.fn().mockImplementation(() => {
      let rows: unknown[] = [];
      const chain: Record<string, unknown> = {
        from: (table: unknown) => {
          rows = resultsByTable.get(table) ?? [];
          return chain;
        },
        innerJoin: () => chain,
        where: () => chain,
        orderBy: () => chain,
        then: (resolve: (value: unknown[]) => unknown) => resolve(rows),
      };
      return chain;
    }),
  } as any;
}

function createService(
  resultsByTable: Map<unknown, unknown[]>,
  priority: MetadataFieldPriority = DEFAULT_METADATA_PRIORITY,
) {
  return new MetadataResolverService(createDb(resultsByTable), {
    getMetadataPriority: jest.fn().mockResolvedValue(priority),
  } as any);
}

const EXTERNAL_FIRST: MetadataFieldPriority = {
  ...DEFAULT_METADATA_PRIORITY,
  title: ['manual', 'goodreads', 'hardcover', 'embedded'],
  subtitle: ['manual', 'goodreads', 'hardcover', 'embedded'],
  author: ['manual', 'goodreads', 'hardcover', 'embedded'],
};

describe('MetadataResolverService', () => {
  describe('forAudiobooks', () => {
    const audiobookRow = {
      id: 'audiobook-1',
      title: 'Beautiful, Dirty, Rich (Unabridged)',
      subtitle: null,
      manualFields: [],
    };

    function tables(overrides: Partial<Record<string, unknown[]>> = {}) {
      return new Map<unknown, unknown[]>([
        [audiobookSchema.audiobooks, overrides.books ?? [audiobookRow]],
        [
          audiobookSchema.audiobookAuthors,
          overrides.authors ?? [{ bookId: 'audiobook-1', name: 'J. D. Mason' }],
        ],
        [hardcoverSchema.hardcoverAudiobookLinks, overrides.hardcover ?? []],
        [
          goodreadsSchema.goodreadsAudiobookLinks,
          overrides.goodreads ?? [
            {
              bookId: 'audiobook-1',
              book: {
                title: 'Beautiful, Dirty, Rich',
                subtitle: null,
                author: 'J.D. Mason',
              },
            },
          ],
        ],
      ]);
    }

    it('returns an empty map without querying when given no ids', async () => {
      const db = createDb(new Map());
      const service = new MetadataResolverService(db, {
        getMetadataPriority: jest.fn(),
      } as any);

      await expect(service.forAudiobooks([])).resolves.toEqual(new Map());
      expect(db.select).not.toHaveBeenCalled();
    });

    it('prefers the external title when it outranks embedded', async () => {
      const service = createService(tables(), EXTERNAL_FIRST);

      const result = await service.forAudiobooks(['audiobook-1']);

      expect(result.get('audiobook-1')).toEqual({
        title: 'Beautiful, Dirty, Rich',
        subtitle: null,
        authorNames: ['J.D. Mason'],
      });
    });

    it('keeps the embedded title when embedded outranks external', async () => {
      const service = createService(tables(), DEFAULT_METADATA_PRIORITY);

      const result = await service.forAudiobooks(['audiobook-1']);

      expect(result.get('audiobook-1')).toEqual({
        title: 'Beautiful, Dirty, Rich (Unabridged)',
        subtitle: null,
        authorNames: ['J. D. Mason'],
      });
    });

    it('honours manual edits over any configured priority', async () => {
      const service = createService(
        tables({
          books: [{ ...audiobookRow, manualFields: ['title'] }],
        }),
        EXTERNAL_FIRST,
      );

      const result = await service.forAudiobooks(['audiobook-1']);

      expect(result.get('audiobook-1')?.title).toBe(
        'Beautiful, Dirty, Rich (Unabridged)',
      );
    });

    it('splits multi-author Goodreads strings into separate names', async () => {
      const service = createService(
        tables({
          goodreads: [
            {
              bookId: 'audiobook-1',
              book: {
                title: 'Good Omens',
                subtitle: null,
                author: 'Terry Pratchett, Neil Gaiman',
              },
            },
          ],
        }),
        EXTERNAL_FIRST,
      );

      const result = await service.forAudiobooks(['audiobook-1']);

      expect(result.get('audiobook-1')?.authorNames).toEqual([
        'Terry Pratchett',
        'Neil Gaiman',
      ]);
    });

    it('preserves a manual author clear instead of restoring external authors', async () => {
      const service = createService(
        tables({
          books: [{ ...audiobookRow, manualFields: ['author'] }],
          authors: [],
        }),
        EXTERNAL_FIRST,
      );

      const result = await service.forAudiobooks(['audiobook-1']);

      expect(result.get('audiobook-1')?.authorNames).toEqual([]);
    });

    it('omits ids that have no matching row', async () => {
      const service = createService(tables());

      const result = await service.forAudiobooks([
        'audiobook-1',
        'audiobook-missing',
      ]);

      expect(result.has('audiobook-missing')).toBe(false);
    });
  });

  describe('forEbooks', () => {
    it('resolves ebook titles through the same chain', async () => {
      const service = createService(
        new Map<unknown, unknown[]>([
          [
            ebookSchema.ebooks,
            [
              {
                id: 'ebook-1',
                title: 'Beautiful, Dirty, Rich (Unabridged)',
                subtitle: null,
                manualFields: [],
              },
            ],
          ],
          [
            ebookSchema.ebookAuthors,
            [{ bookId: 'ebook-1', name: 'J. D. Mason' }],
          ],
          [hardcoverSchema.hardcoverEbookLinks, []],
          [
            goodreadsSchema.goodreadsEbookLinks,
            [
              {
                bookId: 'ebook-1',
                book: {
                  title: 'Beautiful, Dirty, Rich',
                  subtitle: null,
                  author: 'J.D. Mason',
                },
              },
            ],
          ],
        ]),
        EXTERNAL_FIRST,
      );

      const result = await service.forEbooks(['ebook-1']);

      expect(result.get('ebook-1')).toEqual({
        title: 'Beautiful, Dirty, Rich',
        subtitle: null,
        authorNames: ['J.D. Mason'],
      });
    });
  });
});
