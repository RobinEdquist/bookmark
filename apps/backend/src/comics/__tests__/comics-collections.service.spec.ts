/**
 * Focused unit tests for deterministic logic in ComicsCollectionsService.
 * Full DB-level coverage (findAll cover loop, findOne blacklist subquery) is
 * covered by E2E tests — those paths are NOT tested here.
 */

// ws-events.service transitively imports events.gateway, which pulls in the
// ESM-only `@thallesp/nestjs-better-auth` package that Jest's CJS runtime
// cannot `require`. Stub it out at the factory level so the import chain is
// fully severed.
jest.mock('../../events/ws-events.service', () => ({
  WsEventsService: class {},
}));

import { NotFoundException } from '@nestjs/common';
import { ComicsCollectionsService } from '../comics-collections.service';

// ---------------------------------------------------------------------------
// chainMock — builds a chainable thenable mock for drizzle-style query chains.
// Each method in `methods` returns `self`, so you can chain arbitrarily.
// `await chain` resolves to `resolvedValue`.
// ---------------------------------------------------------------------------
function chainMock(resolvedValue: unknown = []) {
  const self: Record<string, jest.Mock> = {};
  const methods = [
    'from',
    'where',
    'limit',
    'offset',
    'orderBy',
    'innerJoin',
    'leftJoin',
  ];
  for (const m of methods) {
    self[m] = jest.fn().mockReturnValue(self);
  }
  self.then = jest
    .fn()
    .mockImplementation((resolve: (v: unknown) => unknown) =>
      Promise.resolve(resolvedValue).then(resolve),
    );
  return self;
}

// ---------------------------------------------------------------------------
// Helpers to build full-featured db mocks with insert/update/delete support.
// ---------------------------------------------------------------------------

/**
 * insertMock — wraps .insert().values().returning() and .onConflictDoNothing()
 * `returningValue` is what .returning() resolves to (default []).
 */
function insertMock(returningValue: unknown[] = []) {
  const returning = jest.fn().mockResolvedValue(returningValue);
  const onConflictDoNothing = jest.fn().mockResolvedValue(undefined);
  const values = jest.fn().mockReturnValue({ returning, onConflictDoNothing });
  const insert = jest.fn().mockReturnValue({ values });
  return { insert, values, returning, onConflictDoNothing };
}

/**
 * updateMock — wraps .update().set().where() per call in a loop.
 * Returns a fresh chain on each .update() call so assertions are per-call.
 */
function buildUpdateMock() {
  // We collect all the `set` calls so tests can assert per-call arguments.
  const setCalls: jest.Mock[] = [];
  const update = jest.fn().mockImplementation(() => {
    const where = jest.fn().mockResolvedValue(undefined);
    const set = jest.fn().mockReturnValue({ where });
    setCalls.push(set);
    return { set };
  });
  return { update, setCalls };
}

/**
 * deleteMock — wraps .delete().where()
 */
function deleteMock() {
  const where = jest.fn().mockResolvedValue(undefined);
  const del = jest.fn().mockReturnValue({ where });
  return { delete: del, where };
}

// ---------------------------------------------------------------------------
// Typed stubs for event services used in assertions.
// ---------------------------------------------------------------------------
interface MockAppEvents {
  comicCollectionCreated: jest.Mock;
  comicCollectionUpdated: jest.Mock;
  comicCollectionDeleted: jest.Mock;
  comicSeriesUpdated: jest.Mock;
}

interface MockWsEvents {
  comicCollectionCreated: jest.Mock;
  comicCollectionUpdated: jest.Mock;
  comicCollectionDeleted: jest.Mock;
  comicSeriesUpdated: jest.Mock;
}

// ---------------------------------------------------------------------------
// buildService — constructs ComicsCollectionsService with a partial db stub
// and jest-mock event services.
// ---------------------------------------------------------------------------
function buildService(db: Record<string, unknown>) {
  const coverService = {
    getCoverUrl: jest.fn().mockReturnValue(null),
  } as never;
  const appEvents: MockAppEvents = {
    comicCollectionCreated: jest.fn(),
    comicCollectionUpdated: jest.fn(),
    comicCollectionDeleted: jest.fn(),
    comicSeriesUpdated: jest.fn(),
  };
  const wsEvents: MockWsEvents = {
    comicCollectionCreated: jest.fn(),
    comicCollectionUpdated: jest.fn(),
    comicCollectionDeleted: jest.fn(),
    comicSeriesUpdated: jest.fn(),
  };

  const service = new ComicsCollectionsService(
    db as never,
    coverService,
    appEvents as never,
    wsEvents as never,
  );
  return { service, appEvents, wsEvents };
}

// ===========================================================================
// addSeries — position computation
// ===========================================================================

describe('ComicsCollectionsService.addSeries — position computation', () => {
  it('inserts with position = max + 1 when the collection exists and has members', async () => {
    // Call 1 (select): existence check → collection found
    // Call 2 (select): max-position query → max = 2
    const selectCallCount = { n: 0 };
    const select = jest.fn().mockImplementation(() => {
      selectCallCount.n++;
      if (selectCallCount.n === 1) {
        // Existence check: return [{ id: 'col-1' }]
        return chainMock([{ id: 'col-1' }]);
      }
      // Max-position query: return [{ max: 2 }]
      return chainMock([{ max: 2 }]);
    });

    const { insert, values, onConflictDoNothing } = insertMock();
    const db = { select, insert };

    const { service } = buildService(db);
    await service.addSeries('col-1', 'series-7');

    // insert().values() should have been called with position = max + 1 = 3
    expect(values).toHaveBeenCalledWith({
      collectionId: 'col-1',
      seriesId: 'series-7',
      position: 3,
    });
    expect(onConflictDoNothing).toHaveBeenCalled();
  });

  it('inserts with position 0 when the collection is empty (max = -1)', async () => {
    const selectCallCount = { n: 0 };
    const select = jest.fn().mockImplementation(() => {
      selectCallCount.n++;
      if (selectCallCount.n === 1) {
        return chainMock([{ id: 'col-empty' }]);
      }
      // coalesce(max(position), -1) → -1 for empty collection
      return chainMock([{ max: -1 }]);
    });

    const { insert, values } = insertMock();
    const db = { select, insert };

    const { service } = buildService(db);
    await service.addSeries('col-empty', 'series-1');

    expect(values).toHaveBeenCalledWith({
      collectionId: 'col-empty',
      seriesId: 'series-1',
      position: 0,
    });
  });
});

// ===========================================================================
// addSeries — NotFoundException when collection does not exist
// ===========================================================================

describe('ComicsCollectionsService.addSeries — not found', () => {
  it('throws NotFoundException when the collection does not exist', async () => {
    // Existence check returns [] → not found
    const select = jest.fn().mockReturnValue(chainMock([]));
    const { insert } = insertMock();
    const db = { select, insert };

    const { service } = buildService(db);
    await expect(service.addSeries('missing-col', 'series-1')).rejects.toThrow(
      NotFoundException,
    );

    // Should not proceed to the insert
    expect(insert).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// create — emits both event services
// ===========================================================================

describe('ComicsCollectionsService.create — event emission', () => {
  it('calls appEvents.comicCollectionCreated and wsEvents.comicCollectionCreated with the new id', async () => {
    // insert().values().returning() → [{ id: 'c1' }]
    const { insert } = insertMock([{ id: 'c1' }]);
    const db = { insert };

    const { service, appEvents, wsEvents } = buildService(db);
    const result = await service.create({ name: 'My Collection' });

    expect(result).toEqual({ id: 'c1' });
    expect(appEvents.comicCollectionCreated).toHaveBeenCalledWith('c1');
    expect(wsEvents.comicCollectionCreated).toHaveBeenCalledWith('c1');
  });

  it('calls each event service exactly once per create call', async () => {
    const { insert } = insertMock([{ id: 'c2' }]);
    const db = { insert };

    const { service, appEvents, wsEvents } = buildService(db);
    await service.create({ name: 'Another', description: 'desc' });

    expect(appEvents.comicCollectionCreated).toHaveBeenCalledTimes(1);
    expect(wsEvents.comicCollectionCreated).toHaveBeenCalledTimes(1);
  });
});

// ===========================================================================
// reorder — issues one update per id with index as position
// ===========================================================================

describe('ComicsCollectionsService.reorder — per-id position updates', () => {
  it('calls db.update().set().where() for each seriesId with ascending position', async () => {
    const { update, setCalls } = buildUpdateMock();
    // reorder also calls appEvents / wsEvents but not db.select
    const db = { update };

    const { service } = buildService(db);
    await service.reorder('col-1', ['a', 'b', 'c']);

    // Exactly 3 updates — one per seriesId
    expect(update).toHaveBeenCalledTimes(3);

    // Each set() receives the correct position by index
    expect(setCalls[0]).toHaveBeenCalledWith({ position: 0 });
    expect(setCalls[1]).toHaveBeenCalledWith({ position: 1 });
    expect(setCalls[2]).toHaveBeenCalledWith({ position: 2 });
  });

  it('issues no updates for an empty seriesIds array', async () => {
    const { update } = buildUpdateMock();
    const db = { update };

    const { service } = buildService(db);
    await service.reorder('col-1', []);

    expect(update).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// remove — NotFoundException when collection does not exist
// ===========================================================================

describe('ComicsCollectionsService.remove — not found', () => {
  it('throws NotFoundException when the collection does not exist', async () => {
    // Existence check returns [] → not found
    const select = jest.fn().mockReturnValue(chainMock([]));
    const { delete: del } = deleteMock();
    const db = { select, delete: del };

    const { service } = buildService(db);
    await expect(service.remove('ghost-col')).rejects.toThrow(
      NotFoundException,
    );

    // Should not proceed to the delete
    expect(del).not.toHaveBeenCalled();
  });

  it('does not throw when the collection exists (delete proceeds)', async () => {
    const select = jest.fn().mockReturnValue(chainMock([{ id: 'real-col' }]));
    const { delete: del } = deleteMock();
    const db = { select, delete: del };

    const { service, appEvents, wsEvents } = buildService(db);
    await expect(service.remove('real-col')).resolves.not.toThrow();

    expect(del).toHaveBeenCalled();
    expect(appEvents.comicCollectionDeleted).toHaveBeenCalledWith('real-col');
    expect(wsEvents.comicCollectionDeleted).toHaveBeenCalledWith('real-col');
  });
});

// covered by E2E: findAll (per-collection cover loop), findOne (blacklist subquery)
