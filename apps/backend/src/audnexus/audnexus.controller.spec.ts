import { BadRequestException } from '@nestjs/common';

jest.mock('./audnexus.service', () => ({
  AudnexusService: class AudnexusService {},
}));

import { AudnexusController } from './audnexus.controller';

function createController() {
  const service = {
    searchAudible: jest.fn().mockResolvedValue([{ asin: 'B000000001' }]),
    fetchBookByAsin: jest.fn().mockResolvedValue({ asin: 'B000000001' }),
    fetchChaptersByAsin: jest.fn().mockResolvedValue({ chapters: [] }),
  };

  return {
    controller: new AudnexusController(service as any),
    service,
  };
}

describe('AudnexusController', () => {
  it('searches Audible and adds a total count', async () => {
    const { controller, service } = createController();

    await expect(
      controller.searchAudible({
        title: 'Dune',
        author: 'Frank Herbert',
        region: 'us',
      }),
    ).resolves.toEqual({
      results: [{ asin: 'B000000001' }],
      total: 1,
    });
    expect(service.searchAudible).toHaveBeenCalledWith(
      'Dune',
      'Frank Herbert',
      'us',
    );
  });

  it('gets book details by normalized ASIN', async () => {
    const { controller, service } = createController();

    await expect(
      controller.getBookByAsin('b000000001', { region: 'uk' }),
    ).resolves.toEqual({ asin: 'B000000001' });
    expect(service.fetchBookByAsin).toHaveBeenCalledWith('B000000001', 'uk');
  });

  it('rejects invalid book ASINs', async () => {
    const { controller } = createController();

    await expect(controller.getBookByAsin('bad', {})).rejects.toThrow(
      BadRequestException,
    );
  });

  it('gets chapters by normalized ASIN', async () => {
    const { controller, service } = createController();

    await expect(
      controller.getChaptersByAsin('b000000001', { region: 'de' }),
    ).resolves.toEqual({ chapters: [] });
    expect(service.fetchChaptersByAsin).toHaveBeenCalledWith(
      'B000000001',
      'de',
    );
  });

  it('rejects invalid chapter ASINs', async () => {
    const { controller } = createController();

    await expect(
      controller.getChaptersByAsin('too-long-asin', {}),
    ).rejects.toThrow('ASIN must be exactly 10 alphanumeric characters');
  });
});
