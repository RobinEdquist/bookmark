jest.mock('./progress.service', () => ({
  ProgressService: class ProgressService {},
}));

import { ProgressController } from './progress.controller';

function createController() {
  const service = {
    getAllProgress: jest.fn().mockResolvedValue([{ audiobookId: 'audio-1' }]),
    getListeningStats: jest.fn().mockResolvedValue({ totalSeconds: 60 }),
    getMobileListeningStats: jest.fn().mockResolvedValue({ days: [] }),
    getProgress: jest.fn().mockResolvedValue({
      audiobookId: 'audio-1',
      position: 10,
      completed: false,
    }),
    updateProgress: jest.fn().mockResolvedValue({
      audiobookId: 'audio-1',
      position: 20,
      completed: false,
    }),
    createSession: jest
      .fn()
      .mockResolvedValue({ id: 'session-1', durationSeconds: 120 }),
    resetProgress: jest.fn().mockResolvedValue(undefined),
    hideProgress: jest.fn().mockResolvedValue(undefined),
  };

  return {
    controller: new ProgressController(service as any),
    service,
  };
}

const user = { id: 'user-1' } as any;

describe('ProgressController', () => {
  it('delegates aggregate progress and stats requests', async () => {
    const { controller, service } = createController();

    await expect(controller.getAllProgress(user)).resolves.toEqual([
      { audiobookId: 'audio-1' },
    ]);
    await expect(controller.getListeningStats(user)).resolves.toEqual({
      totalSeconds: 60,
    });
    await expect(controller.getMobileListeningStats(user)).resolves.toEqual({
      days: [],
    });

    expect(service.getAllProgress).toHaveBeenCalledWith('user-1');
    expect(service.getListeningStats).toHaveBeenCalledWith('user-1');
    expect(service.getMobileListeningStats).toHaveBeenCalledWith('user-1');
  });

  it('returns existing progress from the service', async () => {
    const { controller, service } = createController();

    await expect(controller.getProgress('audio-1', user)).resolves.toEqual({
      audiobookId: 'audio-1',
      position: 10,
      completed: false,
    });
    expect(service.getProgress).toHaveBeenCalledWith('user-1', 'audio-1');
  });

  it('returns default progress when no record exists', async () => {
    const { controller, service } = createController();
    service.getProgress.mockResolvedValue(null);

    const result = await controller.getProgress('audio-1', user);

    expect(result).toMatchObject({
      audiobookId: 'audio-1',
      position: 0,
      completed: false,
      completedAt: null,
    });
    expect(new Date(result.startedAt).toString()).not.toBe('Invalid Date');
    expect(new Date(result.updatedAt).toString()).not.toBe('Invalid Date');
  });

  it('updates progress and rethrows service failures after logging', async () => {
    const { controller, service } = createController();
    const dto = { position: 20 } as any;

    await expect(
      controller.updateProgress('audio-1', dto, user),
    ).resolves.toEqual({
      audiobookId: 'audio-1',
      position: 20,
      completed: false,
    });
    expect(service.updateProgress).toHaveBeenCalledWith(
      'user-1',
      'audio-1',
      dto,
    );

    const error = new Error('db failed');
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    service.updateProgress.mockRejectedValueOnce(error);
    await expect(controller.updateProgress('audio-1', dto, user)).rejects.toBe(
      error,
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      '[ProgressController.updateProgress] failed',
      expect.objectContaining({
        userId: 'user-1',
        audiobookId: 'audio-1',
        dto,
      }),
    );
    consoleSpy.mockRestore();
  });

  it('creates sessions and mutates progress state', async () => {
    const { controller, service } = createController();
    const sessionDto = { startTime: '2026-01-01', durationSeconds: 120 } as any;

    await expect(
      controller.createSession('audio-1', sessionDto, user),
    ).resolves.toEqual({
      id: 'session-1',
      durationSeconds: 120,
    });
    await controller.resetProgress('audio-1', user);
    await controller.hideProgress('audio-1', user);

    expect(service.createSession).toHaveBeenCalledWith(
      'user-1',
      'audio-1',
      sessionDto,
    );
    expect(service.resetProgress).toHaveBeenCalledWith('user-1', 'audio-1');
    expect(service.hideProgress).toHaveBeenCalledWith('user-1', 'audio-1');
  });
});
