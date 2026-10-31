import { getTableName, type SQL } from 'drizzle-orm';
import { PgDialect, type PgTable } from 'drizzle-orm/pg-core';
import { PeopleAdminService } from './people-admin.service';

const dialect = new PgDialect();

function toQuery(query: SQL) {
  const { sql, params } = dialect.sqlToQuery(query);
  return { sql: sql.replace(/\s+/g, ' ').trim(), params };
}

type Write =
  | { kind: 'execute'; sql: string; params: unknown[] }
  | {
      kind: 'insert';
      table: string;
      values: unknown;
      onConflictDoNothing: boolean;
    }
  | { kind: 'delete'; table: string; sql: string; params: unknown[] };

/** Answers each awaited select with the next queued result and records writes in order. */
function fakeDb(selectResults: unknown[]) {
  const queue = [...selectResults];
  const writes: Write[] = [];

  const selectChain = () => {
    const chain: Record<string, unknown> = {};
    for (const method of ['from', 'where', 'limit']) {
      chain[method] = jest.fn(() => chain);
    }
    chain.then = (
      resolve: (value: unknown) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve(queue.shift() ?? []).then(resolve, reject);
    return chain;
  };

  const tx = {
    select: jest.fn(() => selectChain()),
    execute: jest.fn(async (query: SQL) => {
      writes.push({ kind: 'execute', ...toQuery(query) });
    }),
    insert: jest.fn((table: PgTable) => ({
      values: jest.fn((values: unknown) => {
        const write = {
          kind: 'insert' as const,
          table: getTableName(table),
          values,
          onConflictDoNothing: false,
        };
        writes.push(write);
        return {
          onConflictDoNothing: jest.fn(async () => {
            write.onConflictDoNothing = true;
          }),
        };
      }),
    })),
    delete: jest.fn((table: PgTable) => ({
      where: jest.fn(async (condition: SQL) => {
        writes.push({
          kind: 'delete',
          table: getTableName(table),
          ...toQuery(condition),
        });
      }),
    })),
  };
  const db = {
    ...tx,
    transaction: jest.fn(async (fn: (transaction: typeof tx) => unknown) =>
      fn(tx),
    ),
  };
  return { db, writes };
}

const noLinkCounts = {
  audiobookAuthorCount: 0,
  ebookAuthorCount: 0,
  audiobookNarratorCount: 0,
};

function indexOfWrite(writes: Write[], match: (write: Write) => boolean) {
  const index = writes.findIndex(match);
  expect(index).toBeGreaterThanOrEqual(0);
  return index;
}

const isPeopleDelete = (write: Write) =>
  write.kind === 'delete' && write.table === 'people';

describe('PeopleAdminService.merge', () => {
  it('moves comic credits to the target before deleting the source', async () => {
    const { db, writes } = fakeDb([
      [{ id: 'source-id', name: 'Alan Moore' }],
      [{ id: 'target-id', name: 'Alan  Moore' }],
      [noLinkCounts],
      [{ count: 2 }],
    ]);
    const service = new PeopleAdminService(db as never);

    const result = await service.merge('source-id', 'target-id');

    expect(result).toEqual({
      id: 'target-id',
      name: 'Alan  Moore',
      audiobookAuthorLinksMerged: 0,
      ebookAuthorLinksMerged: 0,
      audiobookNarratorLinksMerged: 0,
      comicCreatorLinksMerged: 2,
    });

    const moveIndex = indexOfWrite(
      writes,
      (write) =>
        write.kind === 'execute' &&
        write.sql.startsWith('UPDATE comic_book_creators'),
    );
    const move = writes[moveIndex] as Extract<Write, { kind: 'execute' }>;
    // A duplicate is the same book and role, matching the table's primary key.
    expect(move.sql).toContain('existing.book_id = cbc.book_id');
    expect(move.sql).toContain('existing.role = cbc.role');
    expect(move.params).toEqual(['target-id', 'source-id', 'target-id']);

    const cleanupIndex = indexOfWrite(
      writes,
      (write) =>
        write.kind === 'delete' && write.table === 'comic_book_creators',
    );
    expect(writes[cleanupIndex]).toMatchObject({ params: ['source-id'] });

    expect(moveIndex).toBeLessThan(cleanupIndex);
    expect(cleanupIndex).toBeLessThan(indexOfWrite(writes, isPeopleDelete));
  });
});

describe('PeopleAdminService.split', () => {
  it('gives every replacement person each comic credit with its role and order', async () => {
    const { db, writes } = fakeDb([
      [{ id: 'source-id', name: 'Moore & Gibbons' }],
      [noLinkCounts],
      [{ count: 2 }],
      [{ id: 'moore-id', name: 'Moore' }],
      [{ id: 'gibbons-id', name: 'Gibbons' }],
      [],
      [],
      [],
      [
        { bookId: 'book-1', role: 'writer', order: 0 },
        { bookId: 'book-2', role: 'penciller', order: 1 },
      ],
    ]);
    const service = new PeopleAdminService(db as never);

    const result = await service.split('source-id', ['Moore', 'Gibbons']);

    expect(result).toMatchObject({
      id: 'source-id',
      names: ['Moore', 'Gibbons'],
      comicCreatorLinksSplit: 2,
    });

    const insertIndex = indexOfWrite(
      writes,
      (write) =>
        write.kind === 'insert' && write.table === 'comic_book_creators',
    );
    expect(writes[insertIndex]).toMatchObject({
      onConflictDoNothing: true,
      values: [
        { bookId: 'book-1', personId: 'moore-id', role: 'writer', order: 0 },
        { bookId: 'book-1', personId: 'gibbons-id', role: 'writer', order: 0 },
        { bookId: 'book-2', personId: 'moore-id', role: 'penciller', order: 1 },
        {
          bookId: 'book-2',
          personId: 'gibbons-id',
          role: 'penciller',
          order: 1,
        },
      ],
    });

    const cleanupIndex = indexOfWrite(
      writes,
      (write) =>
        write.kind === 'delete' && write.table === 'comic_book_creators',
    );
    expect(writes[cleanupIndex]).toMatchObject({ params: ['source-id'] });

    expect(insertIndex).toBeLessThan(cleanupIndex);
    expect(cleanupIndex).toBeLessThan(indexOfWrite(writes, isPeopleDelete));
  });
});
