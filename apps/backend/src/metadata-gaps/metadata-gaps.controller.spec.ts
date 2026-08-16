import { MetadataGapsController } from './metadata-gaps.controller';
import type { MetadataGapsService } from './metadata-gaps.service';
import type { ListMetadataGapsQueryDto } from './dto/metadata-gaps.dto';

describe('MetadataGapsController', () => {
  it('asks the service for the summary of the requested library', async () => {
    const summary = {
      type: 'ebook',
      totalItems: 2,
      itemsWithGaps: 1,
      gaps: [],
    };
    const service = { getSummary: jest.fn().mockResolvedValue(summary) };
    const controller = new MetadataGapsController(
      service as unknown as MetadataGapsService,
    );

    await expect(controller.getSummary({ type: 'ebook' })).resolves.toBe(
      summary,
    );
    expect(service.getSummary).toHaveBeenCalledWith('ebook');
  });

  it('passes the whole query through to the service', async () => {
    const list = { items: [], total: 0 };
    const service = { list: jest.fn().mockResolvedValue(list) };
    const controller = new MetadataGapsController(
      service as unknown as MetadataGapsService,
    );
    const query: ListMetadataGapsQueryDto = {
      type: 'audiobook',
      missing: ['description'],
      match: 'all',
      sort: 'mostGaps',
      limit: 10,
      offset: 20,
    };

    await expect(controller.list(query)).resolves.toBe(list);
    expect(service.list).toHaveBeenCalledWith(query);
  });
});
