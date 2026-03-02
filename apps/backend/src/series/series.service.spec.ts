import { NotFoundException } from '@nestjs/common';
import * as schema from '../audiobooks/schema';
import { SeriesService } from './series.service';

describe('SeriesService', () => {
  describe('update', () => {
    it('updates a series name', async () => {
      const returning = jest.fn().mockResolvedValue([
        {
          id: 'series-1',
          name: 'Renamed Series',
          description: 'Description',
        },
      ]);
      const where = jest.fn().mockReturnValue({ returning });
      const set = jest.fn().mockReturnValue({ where });
      const update = jest.fn().mockReturnValue({ set });
      const db = { update } as any;
      const service = new SeriesService(db);

      const result = await service.update('series-1', {
        name: 'Renamed Series',
      });

      expect(update).toHaveBeenCalledWith(schema.series);
      expect(set).toHaveBeenCalledWith({ name: 'Renamed Series' });
      expect(result).toEqual({
        id: 'series-1',
        name: 'Renamed Series',
        description: 'Description',
      });
    });

    it('throws when series does not exist', async () => {
      const returning = jest.fn().mockResolvedValue([]);
      const where = jest.fn().mockReturnValue({ returning });
      const set = jest.fn().mockReturnValue({ where });
      const update = jest.fn().mockReturnValue({ set });
      const db = { update } as any;
      const service = new SeriesService(db);

      await expect(
        service.update('missing-series', { name: 'Nope' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
