/**
 * Unit tests for ComicsCharactersService. The SQL itself (visibility,
 * counts, cover picks) runs against real Postgres in
 * test/comics/comic-characters.e2e-spec.ts.
 */

// ws-events.service transitively imports events.gateway, which pulls in the
// ESM-only `@thallesp/nestjs-better-auth` package that Jest's CJS runtime
// cannot `require`. Stub it out so the import chain is fully severed.
jest.mock('../../events/ws-events.service', () => ({
  WsEventsService: class {},
}));

import { NotFoundException } from '@nestjs/common';
import { ComicsCharactersService } from '../comics-characters.service';

function chainMock(resolvedValue: unknown = []) {
  const self: Record<string, jest.Mock> = {};
  for (const m of [
    'from',
    'where',
    'limit',
    'offset',
    'orderBy',
    'innerJoin',
    'groupBy',
  ]) {
    self[m] = jest.fn().mockReturnValue(self);
  }
  self.then = jest
    .fn()
    .mockImplementation((resolve: (v: unknown) => unknown) =>
      Promise.resolve(resolvedValue).then(resolve),
    );
  return self;
}

const seriesItem = (id: string, characterIds: string[]) => ({
  id,
  title: id,
  mainCharacters: characterIds.map((c) => ({ id: c, name: c })),
});

function build({
  selectResults = [] as unknown[],
  distinctOnResult = [] as unknown[],
  series = [] as unknown[],
  collections = [] as unknown[],
  covers = new Map<string, string | null>(),
} = {}) {
  const queue = [...selectResults];
  const select = jest
    .fn()
    .mockImplementation(() => chainMock(queue.length ? queue.shift() : []));
  const selectDistinctOn = jest
    .fn()
    .mockReturnValue(chainMock(distinctOnResult));
  const comicsService = {
    visibleSeriesConditions: jest.fn().mockReturnValue([]),
    findAllSeries: jest
      .fn()
      .mockResolvedValue({ series, total: series.length }),
    seriesCoverUrls: jest.fn().mockResolvedValue(covers),
  };
  const collectionsService = {
    findAll: jest
      .fn()
      .mockResolvedValue({ collections, total: collections.length }),
  };
  const service = new ComicsCharactersService(
    { select, selectDistinctOn } as never,
    comicsService as never,
    collectionsService as never,
  );
  return {
    service,
    select,
    selectDistinctOn,
    comicsService,
    collectionsService,
  };
}

describe('ComicsCharactersService.findOne', () => {
  it('throws NotFoundException for an unknown character', async () => {
    const { service } = build({ selectResults: [[]] });
    await expect(service.findOne('missing', 'user-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('lists the visible series by start year and splits solo series from team-ups', async () => {
    const { service, comicsService } = build({
      selectResults: [[{ id: 'logan', name: 'Wolverine' }]],
      series: [
        seriesItem('wolverine-1988', ['logan']),
        seriesItem('wolverine-and-cap', ['logan', 'cap']),
        seriesItem('wolverine-2003', ['logan']),
      ],
    });

    const result = await service.findOne('logan', 'user-1');

    expect(comicsService.findAllSeries).toHaveBeenCalledWith(
      expect.objectContaining({
        mainCharacterId: 'logan',
        sortBy: 'startYear',
        sortOrder: 'asc',
      }),
      'user-1',
    );
    expect(result.name).toBe('Wolverine');
    expect(result.soloSeries.map((s) => s.id)).toEqual([
      'wolverine-1988',
      'wolverine-2003',
    ]);
    expect(result.teamUps.map((s) => s.id)).toEqual(['wolverine-and-cap']);
  });

  it('asks for collections containing any of the character series', async () => {
    const collection = { id: 'c1', name: 'Wolverine solo series' };
    const { service, collectionsService } = build({
      selectResults: [[{ id: 'logan', name: 'Wolverine' }]],
      series: [seriesItem('s1', ['logan']), seriesItem('s2', ['logan', 'cap'])],
      collections: [collection],
    });

    const result = await service.findOne('logan', 'user-1');

    expect(collectionsService.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ seriesIds: ['s1', 's2'] }),
    );
    expect(result.collections).toEqual([collection]);
  });
});

describe('ComicsCharactersService.findAll', () => {
  it('skips the cover lookup when no character matches', async () => {
    const { service, selectDistinctOn } = build({
      selectResults: [[], [{ total: 0 }]],
    });

    const result = await service.findAll({ search: 'nobody' }, 'user-1');

    expect(result).toEqual({ characters: [], total: 0 });
    expect(selectDistinctOn).not.toHaveBeenCalled();
  });

  it('returns numeric series counts and each character cover', async () => {
    const { service } = build({
      selectResults: [
        [
          { id: 'logan', name: 'Wolverine', seriesCount: '3' },
          { id: 'rogue', name: 'Rogue', seriesCount: '1' },
        ],
        [{ total: '2' }],
      ],
      distinctOnResult: [
        { characterId: 'logan', series: { id: 'wolverine-1988' } },
      ],
      covers: new Map([
        ['wolverine-1988', '/api/comics/series/wolverine-1988/cover'],
      ]),
    });

    const result = await service.findAll({}, 'user-1');

    expect(result.total).toBe(2);
    expect(result.characters).toEqual([
      {
        id: 'logan',
        name: 'Wolverine',
        seriesCount: 3,
        coverUrl: '/api/comics/series/wolverine-1988/cover',
      },
      { id: 'rogue', name: 'Rogue', seriesCount: 1, coverUrl: null },
    ]);
  });
});
