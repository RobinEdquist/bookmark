import { ItunesController } from './itunes.controller';

describe('ItunesController', () => {
  it('searches iTunes and adds a total count', async () => {
    const service = {
      search: jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]),
    };
    const controller = new ItunesController(service as any);

    await expect(
      controller.search({
        term: 'Dune',
        media: 'audiobook',
        country: 'US',
      }),
    ).resolves.toEqual({
      results: [{ id: 1 }, { id: 2 }],
      total: 2,
    });
    expect(service.search).toHaveBeenCalledWith('Dune', 'audiobook', 'US');
  });
});
