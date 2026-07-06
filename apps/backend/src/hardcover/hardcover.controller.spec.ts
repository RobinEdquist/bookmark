import { BadRequestException } from '@nestjs/common';

jest.mock('./hardcover.service', () => ({
  HardcoverService: class HardcoverService {},
}));

import { HardcoverController } from './hardcover.controller';
import type { HardcoverService } from './hardcover.service';

function createService(): jest.Mocked<Partial<HardcoverService>> {
  return {
    getApiKey: jest.fn().mockResolvedValue('key'),
    getAutoSyncOnImport: jest.fn().mockResolvedValue(true),
    setAutoSyncOnImport: jest.fn().mockResolvedValue(undefined),
    validateApiKey: jest.fn().mockResolvedValue({ valid: true }),
    setApiKey: jest.fn().mockResolvedValue(undefined),
    searchBooks: jest.fn().mockResolvedValue({
      success: true,
      data: { results: [{ id: 'book-1' }] },
    }),
    searchByAudiobookIdPaginated: jest.fn().mockResolvedValue({
      success: true,
      query: 'Dune',
      data: { results: [{ id: 'book-1' }], page: 2 },
    }),
    getHardcoverLink: jest.fn().mockResolvedValue({ id: 'link-1' }),
    linkAudiobookToHardcover: jest.fn().mockResolvedValue({ id: 'link-1' }),
    unlinkAudiobookFromHardcover: jest.fn().mockResolvedValue(undefined),
    searchByMediaIdPaginated: jest.fn().mockResolvedValue({
      success: true,
      data: { results: [{ id: 'ebook-1' }] },
    }),
    linkMediaToHardcover: jest.fn().mockResolvedValue({ id: 'ebook-link-1' }),
    unlinkMedia: jest.fn().mockResolvedValue(undefined),
    getPendingQueueCount: jest.fn().mockResolvedValue(2),
    getFailedQueueItems: jest.fn().mockResolvedValue([{ id: 'failed-1' }]),
    dismissFailedItem: jest.fn().mockResolvedValue(undefined),
    queueAllUnlinked: jest.fn().mockResolvedValue(7),
  };
}

function createController() {
  const service = createService();
  return {
    controller: new HardcoverController(service as HardcoverService),
    service,
  };
}

const hardcoverBook = {
  id: 'hardcover-1',
  slug: 'dune',
  title: 'Dune',
};

describe('HardcoverController', () => {
  it('returns integration status', async () => {
    const { controller, service } = createController();
    service.getApiKey!.mockResolvedValue(null);
    service.getAutoSyncOnImport!.mockResolvedValue(false);

    await expect(controller.getStatus()).resolves.toEqual({
      configured: false,
      autoSyncOnImport: false,
    });
  });

  it('updates auto-sync only for boolean values', async () => {
    const { controller, service } = createController();

    await expect(controller.setAutoSync({ enabled: true })).resolves.toEqual({
      success: true,
      autoSyncOnImport: true,
    });
    expect(service.setAutoSyncOnImport).toHaveBeenCalledWith(true);
    await expect(
      controller.setAutoSync({ enabled: 'yes' as any }),
    ).rejects.toThrow(BadRequestException);
  });

  it('validates and stores API keys when valid', async () => {
    const { controller, service } = createController();

    await expect(controller.validateKey({ apiKey: 'hc-key' })).resolves.toEqual(
      {
        valid: true,
      },
    );
    expect(service.validateApiKey).toHaveBeenCalledWith('hc-key');
    expect(service.setApiKey).toHaveBeenCalledWith('hc-key');

    await expect(controller.validateKey({ apiKey: '' })).rejects.toThrow(
      'API key is required',
    );
  });

  it('does not store invalid API keys', async () => {
    const { controller, service } = createController();
    service.validateApiKey!.mockResolvedValue({ valid: false, error: 'bad' });

    await expect(
      controller.validateKey({ apiKey: 'bad-key' }),
    ).resolves.toEqual({
      valid: false,
      error: 'bad',
    });
    expect(service.setApiKey).not.toHaveBeenCalled();
  });

  it('disconnects Hardcover', async () => {
    const { controller, service } = createController();

    await expect(controller.disconnect()).resolves.toEqual({ success: true });
    expect(service.setApiKey).toHaveBeenCalledWith(null);
  });

  it('searches books and maps API errors to bad requests', async () => {
    const { controller, service } = createController();

    await expect(controller.search('Dune')).resolves.toEqual({
      results: [{ id: 'book-1' }],
    });
    await expect(controller.search('')).rejects.toThrow(
      'Search query is required',
    );

    service.searchBooks!.mockResolvedValue({
      success: false,
      error: 'offline',
    });
    await expect(controller.search('Dune')).rejects.toThrow('offline');
  });

  it('searches by audiobook with parsed pagination', async () => {
    const { controller, service } = createController();

    await expect(
      controller.searchByAudiobook('audio-1', '2', '25', 'custom'),
    ).resolves.toEqual({
      query: 'Dune',
      results: [{ id: 'book-1' }],
      page: 2,
    });
    expect(service.searchByAudiobookIdPaginated).toHaveBeenCalledWith(
      'audio-1',
      2,
      25,
      'custom',
    );
  });

  it('throws when audiobook search fails', async () => {
    const { controller, service } = createController();
    service.searchByAudiobookIdPaginated!.mockResolvedValue({
      success: false,
      error: 'not configured',
    });

    await expect(controller.searchByAudiobook('audio-1')).rejects.toThrow(
      'not configured',
    );
  });

  it('gets, links, and unlinks audiobook Hardcover records', async () => {
    const { controller, service } = createController();

    await expect(controller.getLink('audio-1')).resolves.toEqual({
      link: { id: 'link-1' },
    });
    await expect(
      controller.linkAudiobook('audio-1', { hardcoverBook }),
    ).resolves.toEqual({
      success: true,
      link: { id: 'link-1' },
    });
    expect(service.linkAudiobookToHardcover).toHaveBeenCalledWith(
      'audio-1',
      expect.objectContaining({
        id: 'hardcover-1',
        slug: 'dune',
        activities_count: 0,
      }),
    );
    await controller.unlinkAudiobook('audio-1');
    expect(service.unlinkAudiobookFromHardcover).toHaveBeenCalledWith(
      'audio-1',
    );
  });

  it('rejects incomplete audiobook link payloads', async () => {
    const { controller } = createController();

    await expect(
      controller.linkAudiobook('audio-1', {
        hardcoverBook: { id: 'x' },
      } as any),
    ).rejects.toThrow('Hardcover book data with id and slug is required');
  });

  it('searches by ebook and defaults missing query text', async () => {
    const { controller, service } = createController();

    await expect(controller.searchByEbook('ebook-1')).resolves.toEqual({
      query: '',
      results: [{ id: 'ebook-1' }],
    });
    expect(service.searchByMediaIdPaginated).toHaveBeenCalledWith(
      'ebook',
      'ebook-1',
      1,
      10,
      undefined,
    );
  });

  it('throws when ebook search fails', async () => {
    const { controller, service } = createController();
    service.searchByMediaIdPaginated!.mockResolvedValue({
      success: false,
      error: 'api failed',
    });

    await expect(controller.searchByEbook('ebook-1')).rejects.toThrow(
      'api failed',
    );
  });

  it('gets, links, and unlinks ebook Hardcover records', async () => {
    const { controller, service } = createController();

    await expect(controller.getEbookLink('ebook-1')).resolves.toEqual({
      link: { id: 'link-1' },
    });
    await expect(
      controller.linkEbook('ebook-1', { hardcoverBook }),
    ).resolves.toEqual({
      success: true,
      link: { id: 'ebook-link-1' },
    });
    expect(service.linkMediaToHardcover).toHaveBeenCalledWith(
      'ebook',
      'ebook-1',
      expect.objectContaining({
        id: 'hardcover-1',
        slug: 'dune',
        activities_count: 0,
      }),
    );
    await controller.unlinkEbook('ebook-1');
    expect(service.unlinkMedia).toHaveBeenCalledWith('ebook', 'ebook-1');
  });

  it('rejects incomplete ebook link payloads', async () => {
    const { controller } = createController();

    await expect(
      controller.linkEbook('ebook-1', { hardcoverBook: { slug: 'x' } } as any),
    ).rejects.toThrow('Hardcover book data with id and slug is required');
  });

  it('returns and mutates queue state', async () => {
    const { controller, service } = createController();

    await expect(controller.getQueueStatus()).resolves.toEqual({
      pendingCount: 2,
      failedCount: 1,
      failedItems: [{ id: 'failed-1' }],
    });
    await controller.dismissFailedItem('failed-1');
    expect(service.dismissFailedItem).toHaveBeenCalledWith('failed-1');
    await expect(controller.queueAllUnlinkedAudiobooks()).resolves.toEqual({
      queuedCount: 7,
    });
    await expect(controller.queueAllUnlinkedEbooks()).resolves.toEqual({
      queuedCount: 7,
    });
    expect(service.queueAllUnlinked).toHaveBeenCalledWith('audiobook');
    expect(service.queueAllUnlinked).toHaveBeenCalledWith('ebook');
  });
});
