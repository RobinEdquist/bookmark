import * as schema from './schema';
import { AudiobooksService } from './audiobooks.service';

describe('AudiobooksService', () => {
  describe('series cleanup', () => {
    it('cleans up orphaned series after updating series relations', async () => {
      const selectQuery = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
      };
      const select = jest.fn().mockReturnValue(selectQuery);
      const where = jest.fn().mockResolvedValue(undefined);
      const del = jest.fn().mockReturnValue({ where });
      const db = { select, delete: del } as any;
      const service = new AudiobooksService(
        db,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

      await (service as any).updateSeries('audiobook-1', []);

      expect(del).toHaveBeenCalledWith(schema.audiobookSeries);
      expect(del).toHaveBeenCalledWith(schema.series);
    });

    it('cleans up orphaned series after deleting an audiobook', async () => {
      const selectQuery = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([
          { id: 'audiobook-1', filePath: '', status: 'missing' },
        ]),
      };
      const select = jest.fn().mockReturnValue(selectQuery);
      const where = jest.fn().mockResolvedValue(undefined);
      const del = jest.fn().mockReturnValue({ where });

      const db = { select, delete: del } as any;
      const appEvents = {
        audiobookDeleted: jest.fn(),
        audiobookUpdated: jest.fn(),
      } as any;
      const service = new AudiobooksService(
        db,
        {} as any,
        {} as any,
        appEvents,
        {} as any,
        {} as any,
      );

      await service.delete('audiobook-1', false);

      expect(del).toHaveBeenCalledWith(schema.audiobooks);
      expect(del).toHaveBeenCalledWith(schema.series);
      expect(appEvents.audiobookDeleted).toHaveBeenCalledWith('audiobook-1');
    });
  });
});
