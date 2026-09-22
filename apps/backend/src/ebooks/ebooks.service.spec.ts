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
        {} as any,
      );

      await service.delete('ebook-1', false);

      expect(del).toHaveBeenCalledWith(schema.ebooks);
      expect(del).toHaveBeenCalledWith(audiobookSchema.series);
      expect(appEvents.ebookDeleted).toHaveBeenCalledWith('ebook-1');
    });
  });
});

describe('EbooksService.getCover', () => {
  it('returns image/png MIME for PDF cover extracted on cache miss', async () => {
    const selectQuery = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([
        {
          filePath: 'Textbook.pdf',
          coverSource: 'embedded',
          coverUrl: null,
        },
      ]),
    };
    const select = jest.fn().mockReturnValue(selectQuery);
    const db = { select } as any;

    const pngBytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const ebookMetadataProvider = {
      extractCoverFromFile: jest.fn().mockResolvedValue({
        data: pngBytes,
        mimeType: 'image/png',
      }),
    };

    const appDataService = {
      getEbookCoverPath: jest
        .fn()
        .mockReturnValue(
          `/tmp/bookmark-no-cover-${Date.now()}-${Math.random()}.jpg`,
        ),
    };

    const service = new EbooksService(
      db,
      {} as any,
      {} as any,
      appDataService as any,
      ebookMetadataProvider as any,
      {} as any,
      {} as any,
    );

    // resolveFilePath needs library path from settings — stub the private path
    jest
      .spyOn(service as any, 'resolveFilePath')
      .mockResolvedValue('/library/ebooks/Textbook.pdf');

    const result = await service.getCover('ebook-pdf-1');

    expect(ebookMetadataProvider.extractCoverFromFile).toHaveBeenCalledWith(
      '/library/ebooks/Textbook.pdf',
    );
    expect(result).toEqual({ data: pngBytes, mimeType: 'image/png' });
  });
});

describe('EbooksService.getDownloadInfo', () => {
  it('returns application/pdf and original filename for PDF ebooks', async () => {
    const selectQuery = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([
        {
          filePath: 'Author/Textbook.pdf',
          fileName: 'Textbook.pdf',
          sizeBytes: 12345,
          format: 'pdf',
        },
      ]),
    };
    const select = jest.fn().mockReturnValue(selectQuery);
    const db = { select } as any;
    const service = new EbooksService(
      db,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    jest
      .spyOn(service as any, 'resolveFilePath')
      .mockResolvedValue('/library/ebooks/Author/Textbook.pdf');

    const result = await service.getDownloadInfo('ebook-pdf-1');

    expect(result).toEqual({
      filePath: '/library/ebooks/Author/Textbook.pdf',
      fileName: 'Textbook.pdf',
      mimeType: 'application/pdf',
      fileSize: 12345,
    });
  });

  it('returns application/epub+zip for EPUB ebooks', async () => {
    const selectQuery = {
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([
        {
          filePath: 'Book.epub',
          fileName: 'Book.epub',
          sizeBytes: 99,
          format: 'epub',
        },
      ]),
    };
    const select = jest.fn().mockReturnValue(selectQuery);
    const db = { select } as any;
    const service = new EbooksService(
      db,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    jest
      .spyOn(service as any, 'resolveFilePath')
      .mockResolvedValue('/library/ebooks/Book.epub');

    const result = await service.getDownloadInfo('ebook-epub-1');
    expect(result.mimeType).toBe('application/epub+zip');
  });
});
