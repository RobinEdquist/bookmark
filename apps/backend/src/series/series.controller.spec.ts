jest.mock('./series.service', () => ({
  SeriesService: class SeriesService {},
}));

import { SeriesController } from './series.controller';

function createController() {
  const service = {
    getAll: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    getRecentlyUpdated: jest.fn().mockResolvedValue({ items: [] }),
    getById: jest.fn().mockResolvedValue({ id: 'series-1' }),
    update: jest.fn().mockResolvedValue({ success: true }),
  };

  return {
    controller: new SeriesController(service as any),
    service,
  };
}

describe('SeriesController', () => {
  it('lists series with parsed pagination and sorting', async () => {
    const { controller, service } = createController();

    await expect(
      controller.getAll('10', '20', 'dune', 'name', 'asc'),
    ).resolves.toEqual({ items: [], total: 0 });
    expect(service.getAll).toHaveBeenCalledWith(10, 20, 'dune', 'name', 'asc');
  });

  it('passes undefined for missing optional list parameters', async () => {
    const { controller, service } = createController();

    await controller.getAll();

    expect(service.getAll).toHaveBeenCalledWith(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    );
  });

  it('gets recently updated series with parsed limit', async () => {
    const { controller, service } = createController();

    await expect(controller.getRecentlyUpdated('5')).resolves.toEqual({
      items: [],
    });
    expect(service.getRecentlyUpdated).toHaveBeenCalledWith(5);
  });

  it('gets and updates series by id', async () => {
    const { controller, service } = createController();
    const dto = { name: 'New Name' } as any;

    await expect(controller.getById('series-1')).resolves.toEqual({
      id: 'series-1',
    });
    await expect(controller.update('series-1', dto)).resolves.toEqual({
      success: true,
    });
    expect(service.getById).toHaveBeenCalledWith('series-1');
    expect(service.update).toHaveBeenCalledWith('series-1', dto);
  });
});
