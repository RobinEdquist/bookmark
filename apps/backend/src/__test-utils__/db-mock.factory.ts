/**
 * Shared mock database factory for Drizzle ORM query builder patterns.
 *
 * Usage:
 *   const db = createMockDb();
 *   db.select().from.mockReturnThis();
 *   db.select().where.mockResolvedValue([{ id: '1' }]);
 */

type ChainableMock = jest.Mock & {
  [key: string]: jest.Mock;
};

/**
 * Creates a chainable mock object where every method returns `this` by default.
 * You can override specific methods to resolve values or return different chains.
 *
 * @param methods - List of method names to create on the chain
 * @returns A mock object with all methods returning `this` for chaining
 */
export function createChainMock(methods: string[]): ChainableMock {
  const chain: Record<string, jest.Mock> = {};

  for (const method of methods) {
    chain[method] = jest.fn().mockReturnThis();
  }

  return chain as ChainableMock;
}

const SELECT_METHODS = [
  'from',
  'where',
  'orderBy',
  'limit',
  'offset',
  'innerJoin',
  'leftJoin',
  'groupBy',
  'having',
] as const;

const INSERT_METHODS = [
  'values',
  'returning',
  'onConflictDoUpdate',
  'onConflictDoNothing',
] as const;

const UPDATE_METHODS = ['set', 'where', 'returning'] as const;

const DELETE_METHODS = ['where', 'returning'] as const;

function createSelectChain() {
  return createChainMock([...SELECT_METHODS]);
}

function createInsertChain() {
  return createChainMock([...INSERT_METHODS]);
}

function createUpdateChain() {
  return createChainMock([...UPDATE_METHODS]);
}

function createDeleteChain() {
  return createChainMock([...DELETE_METHODS]);
}

export interface MockDb {
  select: jest.Mock & ReturnType<typeof createSelectChain>;
  insert: jest.Mock & ReturnType<typeof createInsertChain>;
  update: jest.Mock & ReturnType<typeof createUpdateChain>;
  delete: jest.Mock & ReturnType<typeof createDeleteChain>;
  execute: jest.Mock;
}

/**
 * Creates a mock Drizzle database with chainable query builder methods.
 *
 * Each top-level method (`select`, `insert`, `update`, `delete`) returns a chain
 * where every method returns `this` by default. Override terminal methods with
 * `mockResolvedValue()` to control query results.
 *
 * @example
 * ```ts
 * const db = createMockDb();
 *
 * // Configure a select query
 * const selectChain = createChainMock(['from', 'where', 'orderBy', 'limit']);
 * selectChain.where.mockResolvedValue([{ id: '1', title: 'Test' }]);
 * db.select.mockReturnValue(selectChain);
 *
 * // Configure an insert with returning
 * const insertChain = createChainMock(['values', 'returning', 'onConflictDoUpdate']);
 * insertChain.returning.mockResolvedValue([{ id: '1' }]);
 * insertChain.onConflictDoUpdate.mockReturnValue({ returning: insertChain.returning });
 * insertChain.values.mockReturnValue(insertChain);
 * db.insert.mockReturnValue(insertChain);
 * ```
 *
 * @param overrides - Override specific mock methods on the db
 */
export function createMockDb(
  overrides: Partial<Record<string, jest.Mock>> = {},
): MockDb {
  const selectChain = createSelectChain();
  const insertChain = createInsertChain();
  const updateChain = createUpdateChain();
  const deleteChain = createDeleteChain();

  const db = {
    select: jest.fn().mockReturnValue(selectChain),
    insert: jest.fn().mockReturnValue(insertChain),
    update: jest.fn().mockReturnValue(updateChain),
    delete: jest.fn().mockReturnValue(deleteChain),
    execute: jest.fn(),
    ...overrides,
  };

  return db as MockDb;
}
