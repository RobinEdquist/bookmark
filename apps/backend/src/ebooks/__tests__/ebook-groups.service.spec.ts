jest.mock('../../events/ws-events.service', () => ({
  WsEventsService: class {},
}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EbookGroupsService } from '../ebook-groups.service';

function queuedDb(results: unknown[]) {
  let index = 0;
  const chain: Record<string, unknown> = {};
  const take = () => Promise.resolve(results[index++] ?? []);
  for (const method of [
    'for',
    'from',
    'where',
    'limit',
    'offset',
    'orderBy',
    'innerJoin',
    'leftJoin',
    'groupBy',
    'set',
    'values',
    'returning',
  ]) {
    chain[method] = jest.fn(() => chain);
  }
  chain.then = (
    resolve: (value: unknown) => unknown,
    reject: (reason: unknown) => unknown,
  ) => take().then(resolve, reject);

  const setCalls: unknown[] = [];
  const update = jest.fn(() => ({
    set: jest.fn((fields: unknown) => {
      setCalls.push(fields);
      return { where: jest.fn().mockResolvedValue(undefined) };
    }),
  }));
  const tx = {
    select: jest.fn(() => chain),
    insert: jest.fn(() => chain),
    update,
    delete: jest.fn(() => chain),
  };
  const db = {
    ...tx,
    transaction: jest.fn(async (fn: (transaction: typeof tx) => unknown) =>
      fn(tx),
    ),
  };
  return { db, update, setCalls };
}

function buildService(db: object) {
  const appEvents = {
    ebookGroupCreated: jest.fn(),
    ebookGroupUpdated: jest.fn(),
    ebookGroupDeleted: jest.fn(),
  };
  const wsEvents = {
    ebookGroupCreated: jest.fn(),
    ebookGroupUpdated: jest.fn(),
    ebookGroupDeleted: jest.fn(),
  };
  const service = new EbookGroupsService(
    db as never,
    { getCoverUrl: jest.fn().mockReturnValue(null) } as never,
    { forEbooks: jest.fn().mockResolvedValue(new Map()) } as never,
    {
      getEbookGroupCoverPath: jest.fn().mockReturnValue('/tmp/cover.jpg'),
    } as never,
    appEvents as never,
    wsEvents as never,
  );
  return { service, appEvents, wsEvents };
}

describe('EbookGroupsService.addEbook', () => {
  it('appends a new ebook after the current last position', async () => {
    const { db } = queuedDb([
      [{ id: 'group-1' }],
      [{ id: 'ebook-1' }],
      [],
      [{ max: 2 }],
      [],
    ]);
    const { service, appEvents } = buildService(db);

    await service.addEbook('group-1', {
      ebookId: 'ebook-1',
      role: '  Player   Guide ',
    });

    expect(db.insert).toHaveBeenCalled();
    expect((db.insert() as { values: jest.Mock }).values).toHaveBeenCalledWith({
      groupId: 'group-1',
      ebookId: 'ebook-1',
      position: 3,
      role: 'Player Guide',
    });
    expect(appEvents.ebookGroupUpdated).toHaveBeenCalledWith('group-1');
  });

  it('updates the role when the ebook is already a member', async () => {
    const { db, setCalls } = queuedDb([
      [{ id: 'group-1' }],
      [{ id: 'ebook-1' }],
      [{ ebookId: 'ebook-1' }],
    ]);
    const { service } = buildService(db);

    await service.addEbook('group-1', { ebookId: 'ebook-1', role: 'Scenario' });

    expect(db.insert).not.toHaveBeenCalled();
    expect(setCalls).toEqual([{ role: 'Scenario' }]);
  });

  it('leaves an existing role alone when the request omits one', async () => {
    const { db, update } = queuedDb([
      [{ id: 'group-1' }],
      [{ id: 'ebook-1' }],
      [{ ebookId: 'ebook-1' }],
    ]);
    const { service, appEvents } = buildService(db);

    await service.addEbook('group-1', { ebookId: 'ebook-1' });

    expect(update).not.toHaveBeenCalled();
    expect(appEvents.ebookGroupUpdated).not.toHaveBeenCalled();
  });

  it('throws when the ebook does not exist', async () => {
    const { db } = queuedDb([[{ id: 'group-1' }], []]);
    const { service } = buildService(db);

    await expect(
      service.addEbook('group-1', { ebookId: 'missing' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe('EbookGroupsService.reorder', () => {
  it('writes positions for the merged order and keeps an unlisted member', async () => {
    const { db, setCalls } = queuedDb([
      [{ id: 'group-1' }],
      [{ ebookId: 'a' }, { ebookId: 'hidden' }, { ebookId: 'b' }],
    ]);
    const { service } = buildService(db);

    await service.reorder('group-1', ['b', 'a']);

    expect(setCalls).toEqual([
      { position: 0 },
      { position: 1 },
      { position: 2 },
    ]);
    expect(db.transaction).toHaveBeenCalled();
  });

  it('rejects an ebook that is not in the group', async () => {
    const { db } = queuedDb([[{ id: 'group-1' }], [{ ebookId: 'a' }]]);
    const { service } = buildService(db);

    await expect(
      service.reorder('group-1', ['missing']),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe('EbookGroupsService.create', () => {
  it('emits a created event with the new id', async () => {
    const { db } = queuedDb([[{ id: 'group-1' }]]);
    const { service, appEvents, wsEvents } = buildService(db);

    await expect(
      service.create({ name: '  Curse of Strahd  ' }),
    ).resolves.toEqual({
      id: 'group-1',
    });
    expect(appEvents.ebookGroupCreated).toHaveBeenCalledWith('group-1');
    expect(wsEvents.ebookGroupCreated).toHaveBeenCalledWith('group-1');
  });
});
