jest.mock('./ebook-progress.service', () => ({
  EbookProgressService: class EbookProgressService {},
}));

import { EbookProgressController } from './ebook-progress.controller';

function createController() {
  const service = {
    getAllProgress: jest.fn().mockResolvedValue([{ ebookId: 'ebook-1' }]),
    getProgress: jest.fn().mockResolvedValue({
      ebookId: 'ebook-1',
      progressPercent: 25,
      completed: false,
    }),
    updateProgress: jest.fn().mockResolvedValue({
      ebookId: 'ebook-1',
      progressPercent: 50,
      completed: false,
    }),
    resetProgress: jest.fn().mockResolvedValue(undefined),
    hideProgress: jest.fn().mockResolvedValue(undefined),
  };

  return {
    controller: new EbookProgressController(service as any),
    service,
  };
}

const user = { id: 'user-1' } as any;

describe('EbookProgressController', () => {
  it('gets all progress for the current user', async () => {
    const { controller, service } = createController();

    await expect(controller.getAllProgress(user)).resolves.toEqual([
      { ebookId: 'ebook-1' },
    ]);
    expect(service.getAllProgress).toHaveBeenCalledWith('user-1');
  });

  it('returns existing progress', async () => {
    const { controller, service } = createController();

    await expect(controller.getProgress('ebook-1', user)).resolves.toEqual({
      ebookId: 'ebook-1',
      progressPercent: 25,
      completed: false,
    });
    expect(service.getProgress).toHaveBeenCalledWith('user-1', 'ebook-1');
  });

  it('returns default progress when no record exists', async () => {
    const { controller, service } = createController();
    service.getProgress.mockResolvedValue(null);

    const result = await controller.getProgress('ebook-1', user);

    expect(result).toMatchObject({
      ebookId: 'ebook-1',
      cfi: null,
      progressPercent: 0,
      completed: false,
      completedAt: null,
    });
    expect(new Date(result.startedAt).toString()).not.toBe('Invalid Date');
    expect(new Date(result.updatedAt).toString()).not.toBe('Invalid Date');
  });

  it('updates, resets, and hides progress', async () => {
    const { controller, service } = createController();
    const dto = { progressPercent: 50 } as any;

    await expect(
      controller.updateProgress('ebook-1', dto, user),
    ).resolves.toEqual({
      ebookId: 'ebook-1',
      progressPercent: 50,
      completed: false,
    });
    await controller.resetProgress('ebook-1', user);
    await controller.hideProgress('ebook-1', user);

    expect(service.updateProgress).toHaveBeenCalledWith(
      'user-1',
      'ebook-1',
      dto,
    );
    expect(service.resetProgress).toHaveBeenCalledWith('user-1', 'ebook-1');
    expect(service.hideProgress).toHaveBeenCalledWith('user-1', 'ebook-1');
  });
});
