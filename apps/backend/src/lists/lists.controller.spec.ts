jest.mock('./lists.service', () => ({
  ListsService: class ListsService {},
}));

import { ListsController } from './lists.controller';

function createController() {
  const service = {
    findAll: jest.fn().mockResolvedValue({ mine: [], public: [] }),
    getListsForItem: jest.fn().mockResolvedValue([]),
    findRecent: jest.fn().mockResolvedValue({ lists: [] }),
    findTop: jest.fn().mockResolvedValue({ items: [] }),
    findById: jest.fn().mockResolvedValue({ id: 'list-1' }),
    create: jest.fn().mockResolvedValue({ id: 'list-1' }),
    update: jest.fn().mockResolvedValue({ id: 'list-1', name: 'Updated' }),
    delete: jest.fn().mockResolvedValue(undefined),
    addItem: jest.fn().mockResolvedValue({ id: 'item-1' }),
    removeItem: jest.fn().mockResolvedValue(undefined),
    reorderItems: jest.fn().mockResolvedValue(undefined),
  };

  return {
    controller: new ListsController(service as any),
    service,
  };
}

const user = { id: 'user-1' } as any;

describe('ListsController', () => {
  it('lists current user accessible lists', async () => {
    const { controller, service } = createController();

    await expect(controller.findAll(user)).resolves.toEqual({
      mine: [],
      public: [],
    });
    expect(service.findAll).toHaveBeenCalledWith('user-1');
  });

  it('lists lists containing an item', async () => {
    const { controller, service } = createController();

    await controller.getListsForItem('audiobook', 'book-1', user);

    expect(service.getListsForItem).toHaveBeenCalledWith(
      'user-1',
      'audiobook',
      'book-1',
    );
  });

  it('clamps recent and top list limits', async () => {
    const { controller, service } = createController();

    await controller.findRecent(user, '500');
    await controller.findRecent(user, '-5');
    await controller.findTop(user, 'bad');
    await controller.findTop(user, '500');

    expect(service.findRecent).toHaveBeenNthCalledWith(1, 'user-1', 50);
    expect(service.findRecent).toHaveBeenNthCalledWith(2, 'user-1', 1);
    expect(service.findTop).toHaveBeenNthCalledWith(1, 'user-1', 10);
    expect(service.findTop).toHaveBeenNthCalledWith(2, 'user-1', 50);
  });

  it('gets, creates, updates, and deletes lists', async () => {
    const { controller, service } = createController();
    const createDto = { name: 'Favorites', isPublic: true } as any;
    const updateDto = { name: 'Updated' } as any;

    await expect(controller.findOne('list-1', user)).resolves.toEqual({
      id: 'list-1',
    });
    await expect(controller.create(createDto, user)).resolves.toEqual({
      id: 'list-1',
    });
    await expect(controller.update('list-1', updateDto, user)).resolves.toEqual(
      {
        id: 'list-1',
        name: 'Updated',
      },
    );
    await controller.delete('list-1', user);

    expect(service.findById).toHaveBeenCalledWith('list-1', 'user-1');
    expect(service.create).toHaveBeenCalledWith('user-1', createDto);
    expect(service.update).toHaveBeenCalledWith('list-1', 'user-1', updateDto);
    expect(service.delete).toHaveBeenCalledWith('list-1', 'user-1');
  });

  it('adds, removes, and reorders list items', async () => {
    const { controller, service } = createController();
    const addDto = { itemType: 'ebook', itemId: 'ebook-1' } as any;
    const reorderDto = { itemIds: ['item-2', 'item-1'] } as any;

    await expect(controller.addItem('list-1', addDto, user)).resolves.toEqual({
      id: 'item-1',
    });
    await controller.removeItem('list-1', 'item-1', user);
    await controller.reorderItems('list-1', reorderDto, user);

    expect(service.addItem).toHaveBeenCalledWith('list-1', 'user-1', addDto);
    expect(service.removeItem).toHaveBeenCalledWith(
      'list-1',
      'item-1',
      'user-1',
    );
    expect(service.reorderItems).toHaveBeenCalledWith(
      'list-1',
      'user-1',
      reorderDto,
    );
  });
});
