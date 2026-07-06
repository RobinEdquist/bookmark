jest.mock('./comic-progress.service', () => ({
  ComicProgressService: class ComicProgressService {},
}));

import { ComicProgressController } from './comic-progress.controller';

function createController() {
  const service = {
    getOnDeck: jest.fn().mockResolvedValue([{ comicBookId: 'book-1' }]),
    getProgress: jest.fn().mockResolvedValue({
      comicBookId: 'book-1',
      currentPage: 5,
      pageCount: 20,
      status: 'reading',
    }),
    updateProgress: jest.fn().mockResolvedValue({
      comicBookId: 'book-1',
      currentPage: 10,
      pageCount: 20,
      status: 'reading',
    }),
    resetProgress: jest.fn().mockResolvedValue(undefined),
    hideProgress: jest.fn().mockResolvedValue(undefined),
  };

  return {
    controller: new ComicProgressController(service as any),
    service,
  };
}

const user = { id: 'user-1' } as any;

describe('ComicProgressController', () => {
  it('gets on-deck comics for the current user', async () => {
    const { controller, service } = createController();

    await expect(controller.getOnDeck(user)).resolves.toEqual([
      { comicBookId: 'book-1' },
    ]);
    expect(service.getOnDeck).toHaveBeenCalledWith('user-1');
  });

  it('returns existing progress', async () => {
    const { controller, service } = createController();

    await expect(controller.getProgress('book-1', user)).resolves.toEqual({
      comicBookId: 'book-1',
      currentPage: 5,
      pageCount: 20,
      status: 'reading',
    });
    expect(service.getProgress).toHaveBeenCalledWith('user-1', 'book-1');
  });

  it('returns default progress when no record exists', async () => {
    const { controller, service } = createController();
    service.getProgress.mockResolvedValue(null);

    const result = await controller.getProgress('book-1', user);

    expect(result).toMatchObject({
      comicBookId: 'book-1',
      currentPage: 0,
      pageCount: 0,
      status: 'unread',
    });
    expect(new Date(result.startedAt).toString()).not.toBe('Invalid Date');
    expect(new Date(result.updatedAt).toString()).not.toBe('Invalid Date');
  });

  it('updates, resets, and hides progress', async () => {
    const { controller, service } = createController();
    const dto = { currentPage: 10 } as any;

    await expect(
      controller.updateProgress('book-1', dto, user),
    ).resolves.toEqual({
      comicBookId: 'book-1',
      currentPage: 10,
      pageCount: 20,
      status: 'reading',
    });
    await controller.resetProgress('book-1', user);
    await controller.hideProgress('book-1', user);

    expect(service.updateProgress).toHaveBeenCalledWith(
      'user-1',
      'book-1',
      dto,
    );
    expect(service.resetProgress).toHaveBeenCalledWith('user-1', 'book-1');
    expect(service.hideProgress).toHaveBeenCalledWith('user-1', 'book-1');
  });
});
