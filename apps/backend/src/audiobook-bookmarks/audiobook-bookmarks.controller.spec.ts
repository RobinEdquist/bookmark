jest.mock('./audiobook-bookmarks.service', () => ({
  AudiobookBookmarksService: class AudiobookBookmarksService {},
}));

import { AudiobookBookmarksController } from './audiobook-bookmarks.controller';

const bookmark = {
  id: 'bookmark-1',
  audiobookId: 'audio-1',
  note: 'A great scene',
  position: 120,
  createdAt: '2026-08-07T09:00:00.000Z',
  updatedAt: '2026-08-07T09:00:00.000Z',
};

function createController() {
  const service = {
    list: jest.fn().mockResolvedValue([bookmark]),
    create: jest.fn().mockResolvedValue(bookmark),
    update: jest.fn().mockResolvedValue(bookmark),
    remove: jest.fn().mockResolvedValue(undefined),
  };

  return {
    controller: new AudiobookBookmarksController(service as any),
    service,
  };
}

const user = { id: 'user-1' } as any;

describe('AudiobookBookmarksController', () => {
  it('lists bookmarks for the current user', async () => {
    const { controller, service } = createController();

    await expect(controller.list('audio-1', user)).resolves.toEqual([bookmark]);
    expect(service.list).toHaveBeenCalledWith('user-1', 'audio-1');
  });

  it('creates a bookmark scoped to the current user', async () => {
    const { controller, service } = createController();
    const dto = { position: 120, note: 'A great scene' };

    await expect(controller.create('audio-1', dto, user)).resolves.toEqual(
      bookmark,
    );
    expect(service.create).toHaveBeenCalledWith('user-1', 'audio-1', dto);
  });

  it('updates a bookmark scoped to the current user', async () => {
    const { controller, service } = createController();
    const dto = { note: 'Updated' };

    await expect(
      controller.update('audio-1', 'bookmark-1', dto, user),
    ).resolves.toEqual(bookmark);
    expect(service.update).toHaveBeenCalledWith(
      'user-1',
      'audio-1',
      'bookmark-1',
      dto,
    );
  });

  it('deletes a bookmark scoped to the current user', async () => {
    const { controller, service } = createController();

    await expect(
      controller.remove('audio-1', 'bookmark-1', user),
    ).resolves.toBeUndefined();
    expect(service.remove).toHaveBeenCalledWith(
      'user-1',
      'audio-1',
      'bookmark-1',
    );
  });
});
