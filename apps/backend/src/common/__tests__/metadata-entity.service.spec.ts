import { DEFAULT_METADATA_PRIORITY } from '../../app-settings/schema';
import { MetadataEntityService } from '../metadata-entity.service';

describe('MetadataEntityService', () => {
  function buildService(
    priority = DEFAULT_METADATA_PRIORITY,
    manualFields: string[] = [],
    currentAuthors: Array<{ id: string; name: string }> = [],
    currentSeries: Array<{ id: string; name: string; order: string }> = [],
  ) {
    const settings = {
      getMetadataPriority: jest.fn().mockResolvedValue(priority),
    };
    const service = new MetadataEntityService({} as any, settings as any);

    jest
      .spyOn(service as any, 'ensurePeople')
      .mockResolvedValue([{ id: 'person-1', name: 'External Author' }]);
    jest
      .spyOn(service as any, 'ensureSeries')
      .mockResolvedValue({ id: 'series-1', name: 'External Saga' });
    jest.spyOn(service as any, 'getBook').mockResolvedValue({ manualFields });
    jest
      .spyOn(service as any, 'getCurrentAuthors')
      .mockResolvedValue(currentAuthors);
    jest
      .spyOn(service as any, 'getCurrentSeries')
      .mockResolvedValue(currentSeries);
    const replaceAuthors = jest
      .spyOn(service as any, 'replaceAuthors')
      .mockResolvedValue(undefined);
    const replaceSeries = jest
      .spyOn(service as any, 'replaceSeries')
      .mockResolvedValue(undefined);

    return { service, replaceAuthors, replaceSeries };
  }

  it('materializes external relationships when embedded metadata is missing', async () => {
    const { service, replaceAuthors, replaceSeries } = buildService();

    await service.materializeExternalMetadata(
      'audiobook',
      'book-1',
      'hardcover',
      ['External Author'],
      { name: 'External Saga', order: '2.5' },
    );

    expect(replaceAuthors).toHaveBeenCalledWith('audiobook', 'book-1', [
      { id: 'person-1', name: 'External Author' },
    ]);
    expect(replaceSeries).toHaveBeenCalledWith(
      'audiobook',
      'book-1',
      'series-1',
      '2.5',
    );
  });

  it('keeps embedded relationships when they have higher priority', async () => {
    const { service, replaceAuthors, replaceSeries } = buildService(
      DEFAULT_METADATA_PRIORITY,
      [],
      [{ id: 'embedded-person', name: 'Embedded Author' }],
      [{ id: 'embedded-series', name: 'Embedded Saga', order: '1' }],
    );

    await service.materializeExternalMetadata(
      'ebook',
      'book-2',
      'hardcover',
      ['External Author'],
      { name: 'External Saga', order: '3' },
    );

    expect(replaceAuthors).not.toHaveBeenCalled();
    expect(replaceSeries).not.toHaveBeenCalled();
  });

  it('lets configured external priority replace embedded relationships', async () => {
    const externalFirst = {
      ...DEFAULT_METADATA_PRIORITY,
      author: ['manual', 'hardcover', 'embedded'] as const,
      series: ['manual', 'hardcover', 'embedded'] as const,
    };
    const { service, replaceAuthors, replaceSeries } = buildService(
      externalFirst as any,
      [],
      [{ id: 'embedded-person', name: 'Embedded Author' }],
      [{ id: 'embedded-series', name: 'Embedded Saga', order: '1' }],
    );

    await service.materializeExternalMetadata(
      'audiobook',
      'book-3',
      'hardcover',
      ['External Author'],
      { name: 'External Saga' },
    );

    expect(replaceAuthors).toHaveBeenCalled();
    expect(replaceSeries).toHaveBeenCalledWith(
      'audiobook',
      'book-3',
      'series-1',
      '0',
    );
  });

  it('never replaces manually overridden authors or series', async () => {
    const { service, replaceAuthors, replaceSeries } = buildService(
      DEFAULT_METADATA_PRIORITY,
      ['author', 'series'],
      [],
      [],
    );

    await service.materializeExternalMetadata(
      'audiobook',
      'book-4',
      'hardcover',
      ['External Author'],
      { name: 'External Saga', order: '1' },
    );

    expect(replaceAuthors).not.toHaveBeenCalled();
    expect(replaceSeries).not.toHaveBeenCalled();
  });
});
