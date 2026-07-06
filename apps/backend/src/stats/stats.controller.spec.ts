import { StatsController } from './stats.controller';

describe('StatsController', () => {
  it('returns stats from the service', async () => {
    const stats = {
      totals: { audiobooks: 1, ebooks: 2, comics: 3 },
    };
    const service = {
      getStats: jest.fn().mockResolvedValue(stats),
    };
    const controller = new StatsController(service as any);

    await expect(controller.getStats()).resolves.toBe(stats);
    expect(service.getStats).toHaveBeenCalledWith();
  });
});
