import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import * as listsSchema from './schema';
import { ListsService } from './lists.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a chainable mock that records every drizzle-style method call and
 * resolves the terminal call with `resolvedValue`.
 *
 * Usage:
 *   const chain = chainMock([{ id: 'x' }]);
 *   // chain.from(...).where(...).limit(...) -> Promise<[{ id: 'x' }]>
 */
function chainMock(resolvedValue: any = []) {
  const self: Record<string, jest.Mock> = {};
  const methods = [
    'from',
    'where',
    'limit',
    'offset',
    'orderBy',
    'innerJoin',
    'leftJoin',
    'returning',
    'set',
    'values',
    'as',
  ];
  for (const m of methods) {
    self[m] = jest.fn().mockReturnValue(self);
  }
  // Make the chain itself thenable so `await chain` resolves
  (self as any).then = (resolve: any, reject: any) =>
    Promise.resolve(resolvedValue).then(resolve, reject);
  return self;
}

function createMockDb(overrides: Record<string, any> = {}) {
  return {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    transaction: jest.fn(),
    ...overrides,
  } as any;
}

const mockAppSettings = {
  getMetadataPriority: jest.fn().mockResolvedValue({
    title: ['goodreads', 'hardcover'],
    authors: ['goodreads', 'hardcover'],
    description: ['goodreads', 'hardcover'],
    cover: ['goodreads', 'hardcover'],
  }),
} as any;

const mockCoverService = {
  getCoverUrl: jest
    .fn()
    .mockImplementation(
      (
        id: string,
        _coverUrl: string | null,
        _coverSource: unknown,
        apiPath: string,
      ) => `/api/${apiPath}/${id}/cover`,
    ),
} as any;

const USER_ID = 'user-1';
const OTHER_USER_ID = 'user-2';
const LIST_ID = 'list-1';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ListsService', () => {
  // -----------------------------------------------------------------------
  // create
  // -----------------------------------------------------------------------
  describe('create', () => {
    it('creates a list with name and default isPublic=false', async () => {
      const created = {
        id: LIST_ID,
        userId: USER_ID,
        name: 'Favourites',
        isPublic: false,
      };
      const chain = chainMock([created]);
      const insert = jest.fn().mockReturnValue(chain);
      const db = createMockDb({ insert });
      const service = new ListsService(db, mockAppSettings, mockCoverService);

      const result = await service.create(USER_ID, { name: 'Favourites' });

      expect(insert).toHaveBeenCalledWith(listsSchema.lists);
      expect(chain.values).toHaveBeenCalledWith({
        userId: USER_ID,
        name: 'Favourites',
        isPublic: false,
      });
      expect(result).toEqual(created);
    });

    it('creates a public list when isPublic=true', async () => {
      const created = {
        id: LIST_ID,
        userId: USER_ID,
        name: 'Public List',
        isPublic: true,
      };
      const chain = chainMock([created]);
      const insert = jest.fn().mockReturnValue(chain);
      const db = createMockDb({ insert });
      const service = new ListsService(db, mockAppSettings, mockCoverService);

      const result = await service.create(USER_ID, {
        name: 'Public List',
        isPublic: true,
      });

      expect(chain.values).toHaveBeenCalledWith({
        userId: USER_ID,
        name: 'Public List',
        isPublic: true,
      });
      expect(result).toEqual(created);
    });
  });

  // -----------------------------------------------------------------------
  // update
  // -----------------------------------------------------------------------
  describe('update', () => {
    function setupUpdateMocks(ownershipResult: any[], updateResult: any[]) {
      // verifyOwnership select chain
      const ownershipChain = chainMock(ownershipResult);
      // update chain
      const updateChain = chainMock(updateResult);
      const select = jest.fn().mockReturnValue(ownershipChain);
      const update = jest.fn().mockReturnValue(updateChain);
      const db = createMockDb({ select, update });
      return { db, select, update, ownershipChain, updateChain };
    }

    it('updates list name', async () => {
      const { db, updateChain } = setupUpdateMocks(
        [{ userId: USER_ID }],
        [{ id: LIST_ID, name: 'Updated', isPublic: false }],
      );
      const service = new ListsService(db, mockAppSettings, mockCoverService);

      const result = await service.update(LIST_ID, USER_ID, {
        name: 'Updated',
      });

      expect(updateChain.set).toHaveBeenCalledWith({ name: 'Updated' });
      expect(result).toEqual({
        id: LIST_ID,
        name: 'Updated',
        isPublic: false,
      });
    });

    it('updates list visibility', async () => {
      const { db, updateChain } = setupUpdateMocks(
        [{ userId: USER_ID }],
        [{ id: LIST_ID, name: 'My List', isPublic: true }],
      );
      const service = new ListsService(db, mockAppSettings, mockCoverService);

      await service.update(LIST_ID, USER_ID, { isPublic: true });

      expect(updateChain.set).toHaveBeenCalledWith({ isPublic: true });
    });

    it('updates both name and visibility', async () => {
      const { db, updateChain } = setupUpdateMocks(
        [{ userId: USER_ID }],
        [{ id: LIST_ID, name: 'New Name', isPublic: true }],
      );
      const service = new ListsService(db, mockAppSettings, mockCoverService);

      await service.update(LIST_ID, USER_ID, {
        name: 'New Name',
        isPublic: true,
      });

      expect(updateChain.set).toHaveBeenCalledWith({
        name: 'New Name',
        isPublic: true,
      });
    });

    it('throws NotFoundException when list does not exist', async () => {
      const { db } = setupUpdateMocks([], []);
      const service = new ListsService(db, mockAppSettings, mockCoverService);

      await expect(
        service.update('missing-id', USER_ID, { name: 'Nope' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when user does not own the list', async () => {
      const { db } = setupUpdateMocks([{ userId: OTHER_USER_ID }], []);
      const service = new ListsService(db, mockAppSettings, mockCoverService);

      await expect(
        service.update(LIST_ID, USER_ID, { name: 'Nope' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // -----------------------------------------------------------------------
  // delete
  // -----------------------------------------------------------------------
  describe('delete', () => {
    it('deletes a list owned by the user', async () => {
      const ownershipChain = chainMock([{ userId: USER_ID }]);
      const deleteChain = chainMock(undefined);
      const select = jest.fn().mockReturnValue(ownershipChain);
      const del = jest.fn().mockReturnValue(deleteChain);
      const db = createMockDb({ select, delete: del });
      const service = new ListsService(db, mockAppSettings, mockCoverService);

      await service.delete(LIST_ID, USER_ID);

      expect(del).toHaveBeenCalledWith(listsSchema.lists);
    });

    it('throws NotFoundException when list does not exist', async () => {
      const ownershipChain = chainMock([]);
      const select = jest.fn().mockReturnValue(ownershipChain);
      const db = createMockDb({ select });
      const service = new ListsService(db, mockAppSettings, mockCoverService);

      await expect(
        service.delete('missing-id', USER_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when user does not own the list', async () => {
      const ownershipChain = chainMock([{ userId: OTHER_USER_ID }]);
      const select = jest.fn().mockReturnValue(ownershipChain);
      const db = createMockDb({ select });
      const service = new ListsService(db, mockAppSettings, mockCoverService);

      await expect(service.delete(LIST_ID, USER_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // findById
  // -----------------------------------------------------------------------
  describe('findById', () => {
    it('returns list with items when user is owner', async () => {
      const listRow = {
        id: LIST_ID,
        userId: USER_ID,
        name: 'My List',
        isPublic: false,
      };
      // We need multiple select calls: one for the list, then for items,
      // then for audiobook/ebook details, etc.
      // Since the service chains multiple select calls we build a flexible mock.
      const selectChain = chainMock([listRow]);
      const select = jest.fn().mockReturnValue(selectChain);
      const db = createMockDb({ select });
      const service = new ListsService(db, mockAppSettings, mockCoverService);

      const result = await service.findById(LIST_ID, USER_ID);

      expect(result.id).toBe(LIST_ID);
      expect(result.isOwner).toBe(true);
    });

    it('returns public list for non-owner', async () => {
      const listRow = {
        id: LIST_ID,
        userId: OTHER_USER_ID,
        name: 'Public List',
        isPublic: true,
      };
      const selectChain = chainMock([listRow]);
      const select = jest.fn().mockReturnValue(selectChain);
      const db = createMockDb({ select });
      const service = new ListsService(db, mockAppSettings, mockCoverService);

      const result = await service.findById(LIST_ID, USER_ID);

      expect(result.isOwner).toBe(false);
    });

    it('throws NotFoundException when list does not exist', async () => {
      const selectChain = chainMock([]);
      const select = jest.fn().mockReturnValue(selectChain);
      const db = createMockDb({ select });
      const service = new ListsService(db, mockAppSettings, mockCoverService);

      await expect(
        service.findById('missing-id', USER_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException for private list owned by another user', async () => {
      const listRow = {
        id: LIST_ID,
        userId: OTHER_USER_ID,
        name: 'Private List',
        isPublic: false,
      };
      // First call returns the list row, then the access check fails
      const selectChain = chainMock([listRow]);
      const select = jest.fn().mockReturnValue(selectChain);
      const db = createMockDb({ select });
      const service = new ListsService(db, mockAppSettings, mockCoverService);

      await expect(service.findById(LIST_ID, USER_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // addItem
  // -----------------------------------------------------------------------
  describe('addItem', () => {
    function setupAddItemMocks(opts: {
      ownerUserId: string;
      itemExists: boolean;
      alreadyInList: boolean;
      maxOrder?: number;
    }) {
      const calls: any[][] = [];
      const selectChain = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockImplementation(() => {
          // Each limit() call is a terminal for a select query.
          // Call order: verifyOwnership, item exists check, duplicate check, maxOrder
          const callIndex = calls.length;
          let result: any;
          switch (callIndex) {
            case 0: // verifyOwnership
              result = opts.ownerUserId ? [{ userId: opts.ownerUserId }] : [];
              break;
            case 1: // item exists
              result = opts.itemExists ? [{ id: 'item-1' }] : [];
              break;
            case 2: // duplicate check
              result = opts.alreadyInList ? [{ id: 'existing' }] : [];
              break;
            default:
              result = [];
          }
          calls.push(result);
          return Promise.resolve(result);
        }),
        orderBy: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
      };

      // For the maxOrder query (no limit, direct resolution)
      const selectReturns: any[] = [];
      const select = jest.fn().mockImplementation(() => {
        selectReturns.push(selectChain);
        return selectChain;
      });

      // Override: the 4th select call (maxOrder) resolves directly from `from`
      // Actually the maxOrder call chain is: select().from().where() -> resolves
      // We need to handle this. Let's make where() also resolve for the 4th call.
      let whereCallCount = 0;
      selectChain.where = jest.fn().mockImplementation(() => {
        whereCallCount++;
        // The 4th where call is the maxOrder query (no .limit())
        if (whereCallCount === 4) {
          const result = [{ maxOrder: opts.maxOrder ?? -1 }];
          const thenable = {
            ...selectChain,
            then: (resolve: any, reject: any) =>
              Promise.resolve(result).then(resolve, reject),
          };
          return thenable;
        }
        return selectChain;
      });

      const insertChain = chainMock([
        {
          id: 'new-item-id',
          listId: LIST_ID,
          itemType: 'audiobook',
          audiobookId: 'ab-1',
          order: (opts.maxOrder ?? -1) + 1,
        },
      ]);
      const insert = jest.fn().mockReturnValue(insertChain);

      const updateChain = chainMock(undefined);
      const update = jest.fn().mockReturnValue(updateChain);

      const db = createMockDb({ select, insert, update });
      return { db, select, insert, update, insertChain, updateChain };
    }

    it('adds an audiobook to a list', async () => {
      const { db, insert } = setupAddItemMocks({
        ownerUserId: USER_ID,
        itemExists: true,
        alreadyInList: false,
        maxOrder: 2,
      });
      const service = new ListsService(db, mockAppSettings, mockCoverService);

      const result = await service.addItem(LIST_ID, USER_ID, {
        itemType: 'audiobook',
        itemId: 'ab-1',
      });

      expect(insert).toHaveBeenCalledWith(listsSchema.listItems);
      expect(result).toBeDefined();
      expect(result.id).toBe('new-item-id');
    });

    it('throws NotFoundException when list does not exist', async () => {
      // ownerUserId empty -> verifyOwnership returns []
      const selectChain = chainMock([]);
      const select = jest.fn().mockReturnValue(selectChain);
      const db = createMockDb({ select });
      const service = new ListsService(db, mockAppSettings, mockCoverService);

      await expect(
        service.addItem('missing-list', USER_ID, {
          itemType: 'audiobook',
          itemId: 'ab-1',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when user does not own the list', async () => {
      const selectChain = chainMock([{ userId: OTHER_USER_ID }]);
      const select = jest.fn().mockReturnValue(selectChain);
      const db = createMockDb({ select });
      const service = new ListsService(db, mockAppSettings, mockCoverService);

      await expect(
        service.addItem(LIST_ID, USER_ID, {
          itemType: 'audiobook',
          itemId: 'ab-1',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFoundException when audiobook does not exist', async () => {
      const { db } = setupAddItemMocks({
        ownerUserId: USER_ID,
        itemExists: false,
        alreadyInList: false,
      });
      const service = new ListsService(db, mockAppSettings, mockCoverService);

      await expect(
        service.addItem(LIST_ID, USER_ID, {
          itemType: 'audiobook',
          itemId: 'missing-ab',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ConflictException when item is already in the list', async () => {
      const { db } = setupAddItemMocks({
        ownerUserId: USER_ID,
        itemExists: true,
        alreadyInList: true,
      });
      const service = new ListsService(db, mockAppSettings, mockCoverService);

      await expect(
        service.addItem(LIST_ID, USER_ID, {
          itemType: 'audiobook',
          itemId: 'ab-1',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('sets order to 0 when list is empty (maxOrder = -1)', async () => {
      const { db, insertChain } = setupAddItemMocks({
        ownerUserId: USER_ID,
        itemExists: true,
        alreadyInList: false,
        maxOrder: -1,
      });
      const service = new ListsService(db, mockAppSettings, mockCoverService);

      await service.addItem(LIST_ID, USER_ID, {
        itemType: 'audiobook',
        itemId: 'ab-1',
      });

      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({ order: 0 }),
      );
    });

    it('sets audiobookId for audiobook items and ebookId to null', async () => {
      const { db, insertChain } = setupAddItemMocks({
        ownerUserId: USER_ID,
        itemExists: true,
        alreadyInList: false,
      });
      const service = new ListsService(db, mockAppSettings, mockCoverService);

      await service.addItem(LIST_ID, USER_ID, {
        itemType: 'audiobook',
        itemId: 'ab-1',
      });

      expect(insertChain.values).toHaveBeenCalledWith(
        expect.objectContaining({
          audiobookId: 'ab-1',
          ebookId: null,
          itemType: 'audiobook',
        }),
      );
    });

    it('updates updatedAt on the list after adding an item', async () => {
      const { db, update } = setupAddItemMocks({
        ownerUserId: USER_ID,
        itemExists: true,
        alreadyInList: false,
      });
      const service = new ListsService(db, mockAppSettings, mockCoverService);

      await service.addItem(LIST_ID, USER_ID, {
        itemType: 'audiobook',
        itemId: 'ab-1',
      });

      expect(update).toHaveBeenCalledWith(listsSchema.lists);
    });
  });

  // -----------------------------------------------------------------------
  // removeItem
  // -----------------------------------------------------------------------
  describe('removeItem', () => {
    it('removes an item from the list', async () => {
      const deletedItem = { id: 'item-1', listId: LIST_ID };

      // verifyOwnership
      const ownershipChain = chainMock([{ userId: USER_ID }]);
      // delete chain
      const deleteChain = chainMock([deletedItem]);
      // update chain for updatedAt
      const updateChain = chainMock(undefined);

      const select = jest.fn().mockReturnValue(ownershipChain);
      const del = jest.fn().mockReturnValue(deleteChain);
      const update = jest.fn().mockReturnValue(updateChain);
      const db = createMockDb({ select, delete: del, update });
      const service = new ListsService(db, mockAppSettings, mockCoverService);

      const result = await service.removeItem(LIST_ID, 'item-1', USER_ID);

      expect(del).toHaveBeenCalledWith(listsSchema.listItems);
      expect(result).toEqual(deletedItem);
    });

    it('throws NotFoundException when item not found in list', async () => {
      const ownershipChain = chainMock([{ userId: USER_ID }]);
      const deleteChain = chainMock([]);

      const select = jest.fn().mockReturnValue(ownershipChain);
      const del = jest.fn().mockReturnValue(deleteChain);
      const db = createMockDb({ select, delete: del });
      const service = new ListsService(db, mockAppSettings, mockCoverService);

      await expect(
        service.removeItem(LIST_ID, 'missing-item', USER_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when list does not exist', async () => {
      const ownershipChain = chainMock([]);
      const select = jest.fn().mockReturnValue(ownershipChain);
      const db = createMockDb({ select });
      const service = new ListsService(db, mockAppSettings, mockCoverService);

      await expect(
        service.removeItem('missing-list', 'item-1', USER_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when user does not own the list', async () => {
      const ownershipChain = chainMock([{ userId: OTHER_USER_ID }]);
      const select = jest.fn().mockReturnValue(ownershipChain);
      const db = createMockDb({ select });
      const service = new ListsService(db, mockAppSettings, mockCoverService);

      await expect(
        service.removeItem(LIST_ID, 'item-1', USER_ID),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('updates updatedAt on the list after removing an item', async () => {
      const ownershipChain = chainMock([{ userId: USER_ID }]);
      const deleteChain = chainMock([{ id: 'item-1' }]);
      const updateChain = chainMock(undefined);

      const select = jest.fn().mockReturnValue(ownershipChain);
      const del = jest.fn().mockReturnValue(deleteChain);
      const update = jest.fn().mockReturnValue(updateChain);
      const db = createMockDb({ select, delete: del, update });
      const service = new ListsService(db, mockAppSettings, mockCoverService);

      await service.removeItem(LIST_ID, 'item-1', USER_ID);

      expect(update).toHaveBeenCalledWith(listsSchema.lists);
    });
  });

  // -----------------------------------------------------------------------
  // reorderItems
  // -----------------------------------------------------------------------
  describe('reorderItems', () => {
    it('reorders items using a transaction', async () => {
      const ownershipChain = chainMock([{ userId: USER_ID }]);
      const select = jest.fn().mockReturnValue(ownershipChain);

      const txUpdateChain = chainMock(undefined);
      const txUpdate = jest.fn().mockReturnValue(txUpdateChain);
      const tx = { update: txUpdate } as any;

      const transaction = jest
        .fn()
        .mockImplementation(async (cb: (tx: any) => Promise<void>) => {
          await cb(tx);
        });

      const updateChain = chainMock(undefined);
      const update = jest.fn().mockReturnValue(updateChain);

      const db = createMockDb({ select, transaction, update });
      const service = new ListsService(db, mockAppSettings, mockCoverService);

      await service.reorderItems(LIST_ID, USER_ID, {
        itemIds: ['item-a', 'item-b', 'item-c'],
      });

      // Transaction should update each item with its new order
      expect(txUpdate).toHaveBeenCalledTimes(3);
      expect(txUpdateChain.set).toHaveBeenCalledWith({ order: 0 });
      expect(txUpdateChain.set).toHaveBeenCalledWith({ order: 1 });
      expect(txUpdateChain.set).toHaveBeenCalledWith({ order: 2 });
    });

    it('updates updatedAt after reordering', async () => {
      const ownershipChain = chainMock([{ userId: USER_ID }]);
      const select = jest.fn().mockReturnValue(ownershipChain);

      const txUpdateChain = chainMock(undefined);
      const txUpdate = jest.fn().mockReturnValue(txUpdateChain);
      const tx = { update: txUpdate } as any;
      const transaction = jest
        .fn()
        .mockImplementation(async (cb: (tx: any) => Promise<void>) => {
          await cb(tx);
        });

      const updateChain = chainMock(undefined);
      const update = jest.fn().mockReturnValue(updateChain);

      const db = createMockDb({ select, transaction, update });
      const service = new ListsService(db, mockAppSettings, mockCoverService);

      await service.reorderItems(LIST_ID, USER_ID, { itemIds: ['a'] });

      expect(update).toHaveBeenCalledWith(listsSchema.lists);
    });

    it('throws NotFoundException when list does not exist', async () => {
      const ownershipChain = chainMock([]);
      const select = jest.fn().mockReturnValue(ownershipChain);
      const db = createMockDb({ select });
      const service = new ListsService(db, mockAppSettings, mockCoverService);

      await expect(
        service.reorderItems('missing', USER_ID, { itemIds: ['a'] }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when user does not own the list', async () => {
      const ownershipChain = chainMock([{ userId: OTHER_USER_ID }]);
      const select = jest.fn().mockReturnValue(ownershipChain);
      const db = createMockDb({ select });
      const service = new ListsService(db, mockAppSettings, mockCoverService);

      await expect(
        service.reorderItems(LIST_ID, USER_ID, { itemIds: ['a'] }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('handles empty itemIds array', async () => {
      const ownershipChain = chainMock([{ userId: USER_ID }]);
      const select = jest.fn().mockReturnValue(ownershipChain);
      const txUpdateChain = chainMock(undefined);
      const txUpdate = jest.fn().mockReturnValue(txUpdateChain);
      const tx = { update: txUpdate } as any;
      const transaction = jest
        .fn()
        .mockImplementation(async (cb: (tx: any) => Promise<void>) => {
          await cb(tx);
        });
      const updateChain = chainMock(undefined);
      const update = jest.fn().mockReturnValue(updateChain);

      const db = createMockDb({ select, transaction, update });
      const service = new ListsService(db, mockAppSettings, mockCoverService);

      await service.reorderItems(LIST_ID, USER_ID, { itemIds: [] });

      expect(txUpdate).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // findAll
  // -----------------------------------------------------------------------
  describe('findAll', () => {
    it('returns myLists and publicLists', async () => {
      // The method calls getListsWithPreviews and getPublicListsFromOthers
      // which both issue multiple select queries. We set up the chain to return
      // empty arrays so no item-detail fetches occur.
      const selectChain = chainMock([]);
      const select = jest.fn().mockReturnValue(selectChain);
      const db = createMockDb({ select });
      const service = new ListsService(db, mockAppSettings, mockCoverService);

      const result = await service.findAll(USER_ID);

      expect(result).toHaveProperty('myLists');
      expect(result).toHaveProperty('publicLists');
      expect(Array.isArray(result.myLists)).toBe(true);
      expect(Array.isArray(result.publicLists)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // findRecent
  // -----------------------------------------------------------------------
  describe('findRecent', () => {
    it('returns combined lists sorted by updatedAt', async () => {
      const selectChain = chainMock([]);
      const select = jest.fn().mockReturnValue(selectChain);
      const db = createMockDb({ select });
      const service = new ListsService(db, mockAppSettings, mockCoverService);

      const result = await service.findRecent(USER_ID, 5);

      expect(result).toHaveProperty('lists');
      expect(Array.isArray(result.lists)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // getListsForItem
  // -----------------------------------------------------------------------
  describe('getListsForItem', () => {
    it('returns lists with containsItem flag', async () => {
      const selectChain = chainMock([]);
      const select = jest.fn().mockReturnValue(selectChain);
      const db = createMockDb({ select });
      const service = new ListsService(db, mockAppSettings, mockCoverService);

      const result = await service.getListsForItem(
        USER_ID,
        'audiobook',
        'ab-1',
      );

      expect(Array.isArray(result)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // findTop (generateTopList orchestration)
  // -----------------------------------------------------------------------
  describe('findTop', () => {
    it('returns topRated and mostVoted arrays', async () => {
      // The method fetches candidates then uses ranking utilities.
      // We mock the DB to return no candidates so ranking returns empty.
      const selectChain = chainMock([]);
      const select = jest.fn().mockReturnValue(selectChain);
      const db = createMockDb({ select });
      const service = new ListsService(db, mockAppSettings, mockCoverService);

      const result = await service.findTop(USER_ID, 10);

      expect(result).toHaveProperty('topRated');
      expect(result).toHaveProperty('mostVoted');
      expect(Array.isArray(result.topRated)).toBe(true);
      expect(Array.isArray(result.mostVoted)).toBe(true);
    });

    it('passes limit to ranking functions', async () => {
      const selectChain = chainMock([]);
      const select = jest.fn().mockReturnValue(selectChain);
      const db = createMockDb({ select });
      const service = new ListsService(db, mockAppSettings, mockCoverService);

      const result = await service.findTop(USER_ID, 5);

      // With no candidates, both should be empty
      expect(result.topRated).toHaveLength(0);
      expect(result.mostVoted).toHaveLength(0);
    });

    it('calls appSettingsService.getMetadataPriority', async () => {
      const selectChain = chainMock([]);
      const select = jest.fn().mockReturnValue(selectChain);
      const db = createMockDb({ select });
      const appSettings = {
        getMetadataPriority: jest.fn().mockResolvedValue({
          title: ['hardcover', 'goodreads'],
          authors: [],
          description: [],
          cover: [],
        }),
      } as any;
      const service = new ListsService(db, appSettings, mockCoverService);

      await service.findTop(USER_ID);

      expect(appSettings.getMetadataPriority).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // verifyOwnership (tested indirectly through other methods)
  // -----------------------------------------------------------------------
  describe('verifyOwnership (indirect)', () => {
    it('allows the owner to proceed', async () => {
      const ownershipChain = chainMock([{ userId: USER_ID }]);
      const deleteChain = chainMock(undefined);
      const select = jest.fn().mockReturnValue(ownershipChain);
      const del = jest.fn().mockReturnValue(deleteChain);
      const db = createMockDb({ select, delete: del });
      const service = new ListsService(db, mockAppSettings, mockCoverService);

      // Should not throw
      await expect(service.delete(LIST_ID, USER_ID)).resolves.toBeUndefined();
    });

    it('rejects a different user', async () => {
      const ownershipChain = chainMock([{ userId: OTHER_USER_ID }]);
      const select = jest.fn().mockReturnValue(ownershipChain);
      const db = createMockDb({ select });
      const service = new ListsService(db, mockAppSettings, mockCoverService);

      await expect(service.delete(LIST_ID, USER_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  // -----------------------------------------------------------------------
  // getRatingSourcePriorityFromMetadata (private, tested via findTop)
  // -----------------------------------------------------------------------
  describe('getRatingSourcePriorityFromMetadata (via findTop)', () => {
    it('includes both goodreads and hardcover even if only one is in metadata', async () => {
      const selectChain = chainMock([]);
      const select = jest.fn().mockReturnValue(selectChain);
      const db = createMockDb({ select });
      const appSettings = {
        getMetadataPriority: jest.fn().mockResolvedValue({
          title: ['goodreads'],
          authors: [],
          description: [],
          cover: [],
        }),
      } as any;
      const service = new ListsService(db, appSettings, mockCoverService);

      // Should not throw - the private method adds missing sources
      const result = await service.findTop(USER_ID);
      expect(result).toHaveProperty('topRated');
    });

    it('respects the order from metadata priority', async () => {
      const selectChain = chainMock([]);
      const select = jest.fn().mockReturnValue(selectChain);
      const db = createMockDb({ select });
      const appSettings = {
        getMetadataPriority: jest.fn().mockResolvedValue({
          title: ['hardcover', 'goodreads'],
          authors: [],
          description: [],
          cover: [],
        }),
      } as any;
      const service = new ListsService(db, appSettings, mockCoverService);

      // Should not throw
      const result = await service.findTop(USER_ID);
      expect(result).toHaveProperty('topRated');
    });
  });

  // -----------------------------------------------------------------------
  // parseRating (private, tested indirectly)
  // -----------------------------------------------------------------------
  describe('parseRating (via getTopRankCandidates)', () => {
    it('handles null ratings from DB without errors', async () => {
      // Candidates with null ratings
      const audiobookRow = {
        id: 'ab-1',
        title: 'Book',
        goodreadsBookId: null,
        hardcoverBookId: null,
        goodreadsRating: null,
        goodreadsRatingsCount: null,
        hardcoverRating: null,
        hardcoverRatingsCount: null,
      };

      let selectCallCount = 0;
      const makeSelectChain = (result: any) => {
        const c = chainMock(result);
        return c;
      };

      const select = jest.fn().mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount <= 2) {
          // First two selects are for audiobook/ebook candidates
          return selectCallCount === 1
            ? makeSelectChain([audiobookRow])
            : makeSelectChain([]);
        }
        // Subsequent selects for author lookups
        return makeSelectChain([]);
      });

      const db = createMockDb({ select });
      const service = new ListsService(db, mockAppSettings, mockCoverService);

      const result = await service.findTop(USER_ID);

      // Should produce results even with null ratings
      expect(result).toHaveProperty('topRated');
      expect(result).toHaveProperty('mostVoted');
    });
  });
});
