import * as audiobookSchema from '../audiobooks/schema';
import * as schema from './schema';
import { EbooksService } from './ebooks.service';

describe('EbooksService', () => {
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
      const service = new EbooksService(
        db,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

      await (service as any).updateSeries('ebook-1', []);

      expect(del).toHaveBeenCalledWith(schema.ebookSeries);
      expect(del).toHaveBeenCalledWith(audiobookSchema.series);
    });

    it('cleans up orphaned series after deleting an ebook', async () => {
      const selectQuery = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        limit: jest
          .fn()
          .mockResolvedValue([
            { id: 'ebook-1', filePath: 'book.epub', status: 'missing' },
          ]),
      };
      const select = jest.fn().mockReturnValue(selectQuery);
      const where = jest.fn().mockResolvedValue(undefined);
      const del = jest.fn().mockReturnValue({ where });

      const db = { select, delete: del } as any;
      const appEvents = {
        ebookDeleted: jest.fn(),
        ebookUpdated: jest.fn(),
      } as any;
      const service = new EbooksService(
        db,
        {} as any,
        appEvents,
        {} as any,
        {} as any,
        {} as any,
      );

      await service.delete('ebook-1', false);

      expect(del).toHaveBeenCalledWith(schema.ebooks);
      expect(del).toHaveBeenCalledWith(audiobookSchema.series);
      expect(appEvents.ebookDeleted).toHaveBeenCalledWith('ebook-1');
    });
  });
});
