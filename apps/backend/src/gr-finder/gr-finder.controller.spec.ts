import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

jest.mock('./gr-finder.service', () => ({
  GrFinderService: class GrFinderService {},
}));

import { GrFinderController } from './gr-finder.controller';

function createController() {
  const service = {
    search: jest.fn().mockResolvedValue({ results: [{ id: 'gr-1' }] }),
    searchByMediaId: jest.fn().mockResolvedValue({
      query: 'Dune',
      results: [{ id: 'gr-1' }],
    }),
    getBookDetails: jest.fn().mockResolvedValue({ id: 'gr-1' }),
    getGoodreadsLink: jest.fn().mockResolvedValue({ id: 'link-1' }),
    linkMediaToGoodreads: jest.fn().mockResolvedValue({ id: 'link-1' }),
    unlinkMedia: jest.fn().mockResolvedValue(undefined),
  };

  return {
    controller: new GrFinderController(service as any),
    service,
  };
}

describe('GrFinderController', () => {
  it('reports built-in availability', () => {
    const { controller } = createController();

    expect(controller.getStatus()).toEqual({ configured: true });
  });

  it('searches Goodreads and validates query text', async () => {
    const { controller, service } = createController();

    await expect(controller.search('Dune')).resolves.toEqual({
      results: [{ id: 'gr-1' }],
    });
    expect(service.search).toHaveBeenCalledWith('Dune');
    await expect(controller.search('')).rejects.toThrow(
      'Search query is required',
    );
  });

  it('passes through expected search errors and wraps unexpected ones', async () => {
    const { controller, service } = createController();
    service.search.mockRejectedValueOnce(new BadRequestException('bad query'));

    await expect(controller.search('Dune')).rejects.toThrow(
      BadRequestException,
    );

    service.search.mockRejectedValueOnce(new Error('network down'));
    await expect(controller.search('Dune')).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('searches by audiobook and ebook', async () => {
    const { controller, service } = createController();

    await expect(
      controller.searchByAudiobook('audio-1', 'custom'),
    ).resolves.toEqual({
      query: 'Dune',
      results: [{ id: 'gr-1' }],
    });
    await expect(controller.searchByEbook('ebook-1')).resolves.toEqual({
      query: 'Dune',
      results: [{ id: 'gr-1' }],
    });
    expect(service.searchByMediaId).toHaveBeenCalledWith(
      'audiobook',
      'audio-1',
      'custom',
    );
    expect(service.searchByMediaId).toHaveBeenCalledWith(
      'ebook',
      'ebook-1',
      undefined,
    );
  });

  it('passes through expected media search errors and wraps unexpected ones', async () => {
    const { controller, service } = createController();
    service.searchByMediaId.mockRejectedValueOnce(
      new NotFoundException('missing'),
    );
    await expect(controller.searchByAudiobook('missing')).rejects.toThrow(
      NotFoundException,
    );

    service.searchByMediaId.mockRejectedValueOnce(new Error('failed'));
    await expect(controller.searchByEbook('ebook-1')).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('gets book details and maps unexpected errors', async () => {
    const { controller, service } = createController();

    await expect(controller.getBookDetails('gr-1')).resolves.toEqual({
      id: 'gr-1',
    });
    expect(service.getBookDetails).toHaveBeenCalledWith('gr-1');

    service.getBookDetails.mockRejectedValueOnce(new NotFoundException());
    await expect(controller.getBookDetails('missing')).rejects.toThrow(
      NotFoundException,
    );

    service.getBookDetails.mockRejectedValueOnce(new Error('scraper failed'));
    await expect(controller.getBookDetails('gr-1')).rejects.toThrow(
      InternalServerErrorException,
    );
  });

  it('gets, links, and unlinks audiobook Goodreads records', async () => {
    const { controller, service } = createController();

    await expect(controller.getAudiobookLink('audio-1')).resolves.toEqual({
      link: { id: 'link-1' },
    });
    await expect(
      controller.linkAudiobook('audio-1', { goodreadsId: 'gr-1' }),
    ).resolves.toEqual({ success: true, link: { id: 'link-1' } });
    expect(service.linkMediaToGoodreads).toHaveBeenCalledWith(
      'audiobook',
      'audio-1',
      'gr-1',
    );
    await controller.unlinkAudiobook('audio-1');
    expect(service.unlinkMedia).toHaveBeenCalledWith('audiobook', 'audio-1');
    await expect(
      controller.linkAudiobook('audio-1', { goodreadsId: '' }),
    ).rejects.toThrow('Goodreads ID is required');
  });

  it('gets, links, and unlinks ebook Goodreads records', async () => {
    const { controller, service } = createController();

    await expect(controller.getEbookLink('ebook-1')).resolves.toEqual({
      link: { id: 'link-1' },
    });
    await expect(
      controller.linkEbook('ebook-1', { goodreadsId: 'gr-1' }),
    ).resolves.toEqual({ success: true, link: { id: 'link-1' } });
    expect(service.linkMediaToGoodreads).toHaveBeenCalledWith(
      'ebook',
      'ebook-1',
      'gr-1',
    );
    await controller.unlinkEbook('ebook-1');
    expect(service.unlinkMedia).toHaveBeenCalledWith('ebook', 'ebook-1');
    await expect(
      controller.linkEbook('ebook-1', { goodreadsId: '' }),
    ).rejects.toThrow('Goodreads ID is required');
  });
});
