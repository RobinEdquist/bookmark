import { NotFoundException } from '@nestjs/common';
import * as schema from '../audiobooks/schema';
import * as ebookSchema from '../ebooks/schema';
import type { ResolvedBookMetadata } from '../common/metadata-resolver.service';
import { SeriesService } from './series.service';

function createMetadataResolver(
  audiobooks: Record<string, ResolvedBookMetadata> = {},
  ebooks: Record<string, ResolvedBookMetadata> = {},
) {
  return {
    forAudiobooks: jest
      .fn()
      .mockResolvedValue(new Map(Object.entries(audiobooks))),
    forEbooks: jest.fn().mockResolvedValue(new Map(Object.entries(ebooks))),
  } as any;
}

/**
 * Minimal drizzle stub for `getById`. Every query in that method reads from a
 * distinct table, so results are keyed by the table passed to `.from()` and the
 * stub stays independent of call ordering.
 */
function createSelectDb(resultsByTable: Map<unknown, unknown[]>) {
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
        limit: () => chain,
        offset: () => chain,
        then: (resolve: (value: unknown[]) => unknown) => resolve(rows),
      };
      return chain;
    }),
  } as any;
}

describe('SeriesService', () => {
  describe('getById', () => {
    const audiobookRow = {
      id: 'audiobook-1',
      title: 'Beautiful, Dirty, Rich (Unabridged)',
      subtitle: null,
      coverUrl: 'cover.jpg',
      coverSource: 'embedded',
      duration: 25380,
      status: 'available',
      order: '1',
    };

    const ebookRow = {
      id: 'ebook-1',
      title: 'Beautiful, Dirty, Rich (Unabridged)',
      subtitle: null,
      coverUrl: 'cover.jpg',
      coverSource: 'embedded',
      pageCount: 320,
      status: 'available',
      order: '1',
    };

    function createDb() {
      return createSelectDb(
        new Map<unknown, unknown[]>([
          [
            schema.series,
            [
              {
                id: 'series-1',
                name: 'The Gatewood Family',
                description: null,
              },
            ],
          ],
          [schema.audiobooks, [audiobookRow]],
          [ebookSchema.ebooks, [ebookRow]],
        ]),
      );
    }

    it('renders the resolved title and authors, not the raw DB columns', async () => {
      const resolver = createMetadataResolver(
        {
          'audiobook-1': {
            title: 'Beautiful, Dirty, Rich',
            subtitle: null,
            authorNames: ['J.D. Mason'],
          },
        },
        {
          'ebook-1': {
            title: 'Beautiful, Dirty, Rich',
            subtitle: null,
            authorNames: ['J.D. Mason'],
          },
        },
      );
      const service = new SeriesService(createDb(), resolver);

      const result = await service.getById('series-1');

      // The embedded "(Unabridged)" suffix must not leak through — the
      // audiobook/ebook detail pages resolve it away, so this view must too.
      expect(result.audiobooks[0]).toMatchObject({
        id: 'audiobook-1',
        title: 'Beautiful, Dirty, Rich',
        authors: [{ name: 'J.D. Mason' }],
        coverUrl: '/api/audiobooks/audiobook-1/cover',
        order: '1',
      });
      expect(result.ebooks[0]).toMatchObject({
        id: 'ebook-1',
        title: 'Beautiful, Dirty, Rich',
        authors: [{ name: 'J.D. Mason' }],
        coverUrl: '/api/ebooks/ebook-1/cover',
      });
      expect(resolver.forAudiobooks).toHaveBeenCalledWith(['audiobook-1']);
      expect(resolver.forEbooks).toHaveBeenCalledWith(['ebook-1']);
      expect(result.audiobookCount).toBe(1);
      expect(result.ebookCount).toBe(1);
    });

    it('falls back to the stored row when the resolver has no entry', async () => {
      const service = new SeriesService(createDb(), createMetadataResolver());

      const result = await service.getById('series-1');

      expect(result.audiobooks[0]?.title).toBe(
        'Beautiful, Dirty, Rich (Unabridged)',
      );
      expect(result.audiobooks[0]?.authors).toEqual([]);
    });

    it('throws when the series does not exist', async () => {
      const service = new SeriesService(
        createSelectDb(new Map([[schema.series, []]])),
        createMetadataResolver(),
      );

      await expect(service.getById('missing-series')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('updates a series name', async () => {
      const returning = jest.fn().mockResolvedValue([
        {
          id: 'series-1',
          name: 'Renamed Series',
          description: 'Description',
        },
      ]);
      const where = jest.fn().mockReturnValue({ returning });
      const set = jest.fn().mockReturnValue({ where });
      const update = jest.fn().mockReturnValue({ set });
      const db = { update } as any;
      const service = new SeriesService(db, createMetadataResolver());

      const result = await service.update('series-1', {
        name: 'Renamed Series',
      });

      expect(update).toHaveBeenCalledWith(schema.series);
      expect(set).toHaveBeenCalledWith({ name: 'Renamed Series' });
      expect(result).toEqual({
        id: 'series-1',
        name: 'Renamed Series',
        description: 'Description',
      });
    });

    it('throws when series does not exist', async () => {
      const returning = jest.fn().mockResolvedValue([]);
      const where = jest.fn().mockReturnValue({ returning });
      const set = jest.fn().mockReturnValue({ where });
      const update = jest.fn().mockReturnValue({ set });
      const db = { update } as any;
      const service = new SeriesService(db, createMetadataResolver());

      await expect(
        service.update('missing-series', { name: 'Nope' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
