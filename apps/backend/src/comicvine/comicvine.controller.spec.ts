jest.mock('./comicvine.service', () => ({
  ComicvineService: class ComicvineService {},
}));

import { ComicvineController } from './comicvine.controller';
import type { ComicvineService } from './comicvine.service';

type ComicvineServiceMock = jest.Mocked<
  Pick<
    ComicvineService,
    | 'getApiKey'
    | 'getAutoSyncOnImport'
    | 'validateApiKey'
    | 'setApiKey'
    | 'setAutoSyncOnImport'
    | 'searchVolumes'
    | 'getSeriesLink'
    | 'searchVolumesForSeries'
    | 'getVolumeIssuesPaged'
    | 'linkSeriesToVolume'
    | 'unlinkSeries'
    | 'getBookLink'
    | 'linkBookToIssue'
    | 'unlinkBook'
    | 'searchIssuesForBook'
    | 'getPendingCount'
    | 'getQueueItems'
    | 'dismissItem'
    | 'queueAllUnlinkedSeries'
  >
>;

function createService(): ComicvineServiceMock {
  return {
    getApiKey: jest.fn().mockResolvedValue('cv-key'),
    getAutoSyncOnImport: jest.fn().mockResolvedValue(true),
    validateApiKey: jest.fn().mockResolvedValue({ valid: true }),
    setApiKey: jest.fn().mockResolvedValue(undefined),
    setAutoSyncOnImport: jest.fn().mockResolvedValue(undefined),
    searchVolumes: jest.fn().mockResolvedValue({ results: [{ id: 1 }] }),
    getSeriesLink: jest.fn().mockResolvedValue({ id: 'series-link' }),
    searchVolumesForSeries: jest
      .fn()
      .mockResolvedValue({ query: 'Saga', results: [{ id: 2 }] }),
    getVolumeIssuesPaged: jest.fn().mockResolvedValue({ results: [{ id: 3 }] }),
    linkSeriesToVolume: jest.fn().mockResolvedValue({ id: 'series-link' }),
    unlinkSeries: jest.fn().mockResolvedValue(undefined),
    getBookLink: jest.fn().mockResolvedValue({ id: 'book-link' }),
    linkBookToIssue: jest.fn().mockResolvedValue({ id: 'book-link' }),
    unlinkBook: jest.fn().mockResolvedValue(undefined),
    searchIssuesForBook: jest.fn().mockResolvedValue({ results: [{ id: 4 }] }),
    getPendingCount: jest.fn().mockResolvedValue(5),
    getQueueItems: jest.fn().mockResolvedValue([
      { id: 'pending-1', status: 'pending' },
      { id: 'review-1', status: 'needs_review' },
      { id: 'failed-1', status: 'failed' },
    ]),
    dismissItem: jest.fn().mockResolvedValue(undefined),
    queueAllUnlinkedSeries: jest.fn().mockResolvedValue(6),
  };
}

function createController() {
  const service = createService();
  return {
    controller: new ComicvineController(service as unknown as ComicvineService),
    service,
  };
}

describe('ComicvineController', () => {
  it('returns integration status', async () => {
    const { controller, service } = createController();
    service.getApiKey.mockResolvedValue(null);
    service.getAutoSyncOnImport.mockResolvedValue(false);

    await expect(controller.getStatus()).resolves.toEqual({
      configured: false,
      autoSyncOnImport: false,
    });
  });

  it('validates and stores API keys when valid', async () => {
    const { controller, service } = createController();

    await expect(controller.validateKey({ apiKey: 'cv-key' })).resolves.toEqual(
      {
        valid: true,
      },
    );
    expect(service.validateApiKey).toHaveBeenCalledWith('cv-key');
    expect(service.setApiKey).toHaveBeenCalledWith('cv-key');
    await expect(controller.validateKey({ apiKey: '' })).rejects.toThrow(
      'API key is required',
    );
  });

  it('does not store invalid API keys', async () => {
    const { controller, service } = createController();
    service.validateApiKey.mockResolvedValue({ valid: false, error: 'bad' });

    await expect(controller.validateKey({ apiKey: 'bad' })).resolves.toEqual({
      valid: false,
      error: 'bad',
    });
    expect(service.setApiKey).not.toHaveBeenCalled();
  });

  it('disconnects and updates auto sync', async () => {
    const { controller, service } = createController();

    await expect(controller.disconnect()).resolves.toEqual({ success: true });
    expect(service.setApiKey).toHaveBeenCalledWith(null);

    await expect(controller.setAutoSync({ enabled: false })).resolves.toEqual({
      success: true,
      autoSyncOnImport: false,
    });
    expect(service.setAutoSyncOnImport).toHaveBeenCalledWith(false);
    await expect(
      controller.setAutoSync({ enabled: 'no' as any }),
    ).rejects.toThrow('enabled must be a boolean');
  });

  it('searches volumes with parsed page numbers', async () => {
    const { controller, service } = createController();

    await expect(controller.searchVolumes('Saga', '3')).resolves.toEqual({
      results: [{ id: 1 }],
    });
    expect(service.searchVolumes).toHaveBeenCalledWith('Saga', 3);
    await expect(controller.searchVolumes('', '1')).rejects.toThrow(
      'Search query is required',
    );
  });

  it('searches volumes for a series and includes the current link', async () => {
    const { controller, service } = createController();

    await expect(
      controller.searchVolumeForSeries('series-1', '2'),
    ).resolves.toEqual({
      query: 'Saga',
      results: [{ id: 2 }],
      currentLink: { id: 'series-link' },
    });
    expect(service.searchVolumesForSeries).toHaveBeenCalledWith('series-1', 2);
  });

  it('gets volume issues and validates numeric volume IDs', async () => {
    const { controller, service } = createController();

    await expect(controller.getVolumeIssues('123', '4')).resolves.toEqual({
      results: [{ id: 3 }],
    });
    expect(service.getVolumeIssuesPaged).toHaveBeenCalledWith(123, 4);
    await expect(controller.getVolumeIssues('nope')).rejects.toThrow(
      'cvVolumeId must be a number',
    );
  });

  it('gets, links, and unlinks series records', async () => {
    const { controller, service } = createController();
    const volume = { id: 1, name: 'Saga' } as any;

    await expect(controller.getSeriesLink('series-1')).resolves.toEqual({
      link: { id: 'series-link' },
    });
    await expect(
      controller.linkSeries('series-1', { volume }),
    ).resolves.toEqual({
      success: true,
      link: { id: 'series-link' },
    });
    expect(service.linkSeriesToVolume).toHaveBeenCalledWith('series-1', volume);
    await controller.unlinkSeries('series-1');
    expect(service.unlinkSeries).toHaveBeenCalledWith('series-1');
    await expect(
      controller.linkSeries('series-1', { volume: { id: 'x' } as any }),
    ).rejects.toThrow('Volume data with id is required');
  });

  it('gets, links, and unlinks book records', async () => {
    const { controller, service } = createController();
    const issue = { id: 10, name: 'Issue 1' } as any;

    await expect(controller.getBookLink('book-1')).resolves.toEqual({
      link: { id: 'book-link' },
    });
    await expect(controller.linkBook('book-1', { issue })).resolves.toEqual({
      success: true,
      link: { id: 'book-link' },
    });
    expect(service.linkBookToIssue).toHaveBeenCalledWith('book-1', issue);
    await controller.unlinkBook('book-1');
    expect(service.unlinkBook).toHaveBeenCalledWith('book-1');
    await expect(
      controller.linkBook('book-1', { issue: { id: 'x' } as any }),
    ).rejects.toThrow('Issue data with id is required');
  });

  it('searches issues for a book', async () => {
    const { controller, service } = createController();

    await expect(controller.searchIssueForBook('book-1', '5')).resolves.toEqual(
      {
        results: [{ id: 4 }],
      },
    );
    expect(service.searchIssuesForBook).toHaveBeenCalledWith('book-1', 5);
  });

  it('returns and mutates queue state', async () => {
    const { controller, service } = createController();

    await expect(controller.getQueueStatus()).resolves.toEqual({
      pendingCount: 5,
      needsReviewCount: 1,
      failedCount: 1,
      items: [
        { id: 'pending-1', status: 'pending' },
        { id: 'review-1', status: 'needs_review' },
        { id: 'failed-1', status: 'failed' },
      ],
    });
    await controller.dismissItem('failed-1');
    expect(service.dismissItem).toHaveBeenCalledWith('failed-1');
    await expect(controller.queueAllUnlinkedSeries()).resolves.toEqual({
      queuedCount: 6,
    });
  });
});
