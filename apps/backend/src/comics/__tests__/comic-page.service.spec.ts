import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ComicPageService } from '../comic-page.service';
import { DATABASE_CONNECTION } from '../../database/database-connection.constants';
import { AppSettingsService } from '../../app-settings/app-settings.service';
import { AppDataService } from '../../app-data/app-data.service';
import { ComicMetadataProvider } from '../../library-watcher/metadata/comic-metadata.provider';
import { ImageProcessingService } from '../../common/image-processing.service';

describe('ComicPageService', () => {
  let service: ComicPageService;
  let tmpDir: string;
  let provider: { extractPage: jest.Mock };
  let imageProcessing: { processImage: jest.Mock };

  const book = {
    id: 'book-1',
    filePath: 'series/book.cbz',
    pageCount: 3,
    container: 'cbz',
  };

  const dbSelect = () => ({
    from: () => ({
      where: () => ({ limit: () => Promise.resolve([book]) }),
    }),
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'comic-page-svc-'));
    provider = {
      extractPage: jest.fn().mockResolvedValue({
        data: Buffer.from('RAW'),
        mimeType: 'image/jpeg',
      }),
    };
    imageProcessing = {
      processImage: jest.fn().mockResolvedValue({
        data: Buffer.from('JPEG'),
        mimeType: 'image/jpeg',
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ComicPageService,
        { provide: DATABASE_CONNECTION, useValue: { select: dbSelect } },
        {
          provide: AppSettingsService,
          useValue: { getComicLibraryPath: () => Promise.resolve('/library') },
        },
        {
          provide: AppDataService,
          useValue: {
            getComicPageCacheDir: (id: string) => path.join(tmpDir, id),
            getComicPageCachePath: (id: string, p: number, v: string) =>
              path.join(tmpDir, id, `${p}_${v}.jpg`),
            getComicPageCacheBasePath: () => tmpDir,
          },
        },
        { provide: ComicMetadataProvider, useValue: provider },
        { provide: ImageProcessingService, useValue: imageProcessing },
      ],
    }).compile();

    service = moduleRef.get(ComicPageService);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('extracts, processes, caches, and returns a JPEG page', async () => {
    const result = await service.getPageImage('book-1', 0, {});
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.data.toString()).toBe('JPEG');
    expect(provider.extractPage).toHaveBeenCalledWith(
      '/library/series/book.cbz',
      0,
    );
    expect(imageProcessing.processImage).toHaveBeenCalled();
    // The processed page is persisted to the disk cache.
    await expect(
      fs.stat(path.join(tmpDir, 'book-1', '0_oxo.jpg')),
    ).resolves.toBeDefined();
  });

  it('serves the second request from cache (no re-extract)', async () => {
    await service.getPageImage('book-1', 0, {});
    await service.getPageImage('book-1', 0, {});
    expect(provider.extractPage).toHaveBeenCalledTimes(1);
  });

  it('throws NotFound for an out-of-range page', async () => {
    await expect(service.getPageImage('book-1', 99, {})).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws NotFound when extraction yields nothing', async () => {
    provider.extractPage.mockResolvedValueOnce(null);
    await expect(service.getPageImage('book-1', 1, {})).rejects.toThrow(
      NotFoundException,
    );
  });

  it('returns the book page count alongside the image', async () => {
    const result = await service.getPageImage('book-1', 0, {});
    expect(result.pageCount).toBe(3);
  });

  it('throws NotFound when the book does not exist', async () => {
    const emptySelect = () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve([]) }),
      }),
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        ComicPageService,
        { provide: DATABASE_CONNECTION, useValue: { select: emptySelect } },
        {
          provide: AppSettingsService,
          useValue: { getComicLibraryPath: () => Promise.resolve('/library') },
        },
        {
          provide: AppDataService,
          useValue: {
            getComicPageCacheDir: (id: string) => path.join(tmpDir, id),
            getComicPageCachePath: (id: string, p: number, v: string) =>
              path.join(tmpDir, id, `${p}_${v}.jpg`),
            getComicPageCacheBasePath: () => tmpDir,
          },
        },
        { provide: ComicMetadataProvider, useValue: provider },
        { provide: ImageProcessingService, useValue: imageProcessing },
      ],
    }).compile();

    const missingService = moduleRef.get(ComicPageService);

    await expect(missingService.getPageImage('nope', 0, {})).rejects.toThrow(
      NotFoundException,
    );
  });
});
