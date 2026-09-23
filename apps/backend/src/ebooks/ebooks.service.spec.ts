import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import sharp from 'sharp';
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
  let tmpDir: string;
  let pngBytes: Buffer;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ebook-cover-test-'));
    pngBytes = await sharp({
      create: {
        width: 8,
        height: 12,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function setup(coverPath = path.join(tmpDir, 'cover.jpg')) {
    const query = {
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
    const provider = {
      extractCoverFromFile: jest.fn().mockResolvedValue({
        data: pngBytes,
        mimeType: 'image/png',
      }),
    };
    const service = new EbooksService(
      { select: jest.fn().mockReturnValue(query) } as any,
      {} as any,
      {} as any,
      { getEbookCoverPath: () => coverPath } as any,
      provider as any,
      {} as any,
      {} as any,
    );
    jest
      .spyOn(service as any, 'resolveFilePath')
      .mockResolvedValue('/library/ebooks/Textbook.pdf');
    return { service, provider, coverPath, query };
  }

  it('serves actual JPEG bytes on both PDF cover cache miss and hit', async () => {
    const { service, provider, coverPath } = setup();
    const first = await service.getCover('ebook-pdf-1');
    const second = await service.getCover('ebook-pdf-1');

    expect(first?.mimeType).toBe('image/jpeg');
    expect((await sharp(first!.data).metadata()).format).toBe('jpeg');
    expect(second).toEqual(first);
    expect(await fs.readFile(coverPath)).toEqual(first!.data);
    expect(provider.extractCoverFromFile).toHaveBeenCalledTimes(1);
    expect(provider.extractCoverFromFile).toHaveBeenCalledWith(
      '/library/ebooks/Textbook.pdf',
    );
  });

  it('repairs a PNG already cached under a .jpg filename', async () => {
    const { service, provider, coverPath } = setup();
    await fs.writeFile(coverPath, pngBytes);
    const first = await service.getCover('ebook-pdf-1');
    const second = await service.getCover('ebook-pdf-1');

    expect(first?.mimeType).toBe('image/jpeg');
    expect((await sharp(first!.data).metadata()).format).toBe('jpeg');
    expect(second).toEqual(first);
    expect(await fs.readFile(coverPath)).toEqual(first!.data);
    expect(provider.extractCoverFromFile).not.toHaveBeenCalled();
  });

  it('does not re-encode existing JPEG covers', async () => {
    const { service, provider, coverPath } = setup();
    const jpeg = await sharp(pngBytes).jpeg().toBuffer();
    await fs.writeFile(coverPath, jpeg);

    expect(await service.getCover('ebook-pdf-1')).toEqual({
      data: jpeg,
      mimeType: 'image/jpeg',
    });
    expect(provider.extractCoverFromFile).not.toHaveBeenCalled();
  });

  it('preserves uploaded covers', async () => {
    const { service, provider, coverPath, query } = setup();
    query.limit.mockResolvedValueOnce([
      {
        filePath: 'Textbook.pdf',
        coverSource: 'uploaded',
        coverUrl: '/cover',
      },
    ]);
    const jpeg = await sharp(pngBytes).jpeg().toBuffer();
    await fs.writeFile(coverPath, jpeg);

    expect(await service.getCover('ebook-pdf-1')).toEqual({
      data: jpeg,
      mimeType: 'image/jpeg',
    });
    expect(provider.extractCoverFromFile).not.toHaveBeenCalled();
  });

  it('still serves a JPEG if the cover cache cannot be written', async () => {
    const { service } = setup(path.join(tmpDir, 'missing', 'cover.jpg'));
    const result = await service.getCover('ebook-pdf-1');
    expect(result?.mimeType).toBe('image/jpeg');
    expect((await sharp(result!.data).metadata()).format).toBe('jpeg');
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
