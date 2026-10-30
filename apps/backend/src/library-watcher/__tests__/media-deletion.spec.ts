jest.mock('fs/promises', () => {
  const actual =
    jest.requireActual<typeof import('fs/promises')>('fs/promises');
  return { ...actual, unlink: jest.fn(actual.unlink) };
});

jest.mock('p-limit', () => ({
  __esModule: true,
  default:
    () =>
    <T>(fn: () => Promise<T>): Promise<T> =>
      fn(),
}));

import { InternalServerErrorException } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { EbooksService } from '../../ebooks/ebooks.service';
import * as ebookSchema from '../../ebooks/schema';
import { ComicsService } from '../../comics/comics.service';
import * as comicSchema from '../../comics/schema';
import { LibraryScannerService } from '../library-scanner.service';
import { MediaDetectorService } from '../media-detector.service';

const realFs = jest.requireActual<typeof fs>('fs/promises');
const kinds = ['ebook', 'comic book', 'comic series'] as const;
type MediaKind = (typeof kinds)[number];
type Status = 'available' | 'hidden' | 'missing';

describe('Ebook and comic deletion followed by a startup scan', () => {
  let libraryPath: string;

  beforeEach(async () => {
    jest.mocked(fs.unlink).mockReset().mockImplementation(realFs.unlink);
    jest.spyOn(console, 'error').mockImplementation(() => {});
    libraryPath = await fs.mkdtemp(path.join(os.tmpdir(), 'media-delete-'));
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await realFs.rm(libraryPath, { recursive: true, force: true });
  });

  async function setup(
    kind: MediaKind,
    status: Status = 'available',
    count = 1,
  ) {
    const filePaths =
      kind === 'ebook'
        ? ['Book/title.epub']
        : Array.from({ length: count }, (_, i) => `Series/issue-${i + 1}.cbz`);
    const absolutePaths = filePaths.map((file) => path.join(libraryPath, file));
    for (const file of absolutePaths) {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, 'media fixture');
    }
    const ebooks =
      kind === 'ebook'
        ? [{ id: 'ebook-1', filePath: filePaths[0], status }]
        : [];
    const books =
      kind === 'ebook'
        ? []
        : filePaths.map((filePath, i) => ({
            id: `issue-${i + 1}`,
            seriesId: 'series-1',
            filePath,
            status,
          }));
    const series =
      kind === 'ebook'
        ? []
        : [{ id: 'series-1', folderPath: 'Series', status }];
    const rows = new Map<unknown, Record<string, unknown>[]>([
      [ebookSchema.ebooks, ebooks],
      [comicSchema.comicBooks, books],
      [comicSchema.comicSeries, series],
    ]);

    // Share the stored rows across deletion and a new scanner instance. A
    // removed record with a surviving disk file must show up as a new import.
    const db = {
      select: jest.fn(() => ({
        from: (table: unknown) => {
          const result = rows.get(table) ?? [];
          return {
            where: jest.fn().mockReturnThis(),
            limit: jest.fn().mockResolvedValue(result),
            then: (resolve: (value: unknown[]) => unknown) =>
              Promise.resolve(result).then(resolve),
          };
        },
      })),
      delete: jest.fn((table: unknown) => ({
        where: jest.fn().mockImplementation(async () => {
          rows.get(table)?.splice(0);
          if (table === comicSchema.comicSeries) books.splice(0);
        }),
      })),
      update: jest.fn((table: unknown) => ({
        set: (values: object) => ({
          where: jest.fn().mockImplementation(async () => {
            for (const row of rows.get(table) ?? []) Object.assign(row, values);
          }),
        }),
      })),
    };
    const events = {
      ebookDeleted: jest.fn(),
      ebookUpdated: jest.fn(),
      comicSeriesDeleted: jest.fn(),
      comicSeriesUpdated: jest.fn(),
      libraryScanStarted: jest.fn(),
      libraryScanCompleted: jest.fn(),
    };
    const wsEvents = {
      comicSeriesDeleted: jest.fn(),
      comicSeriesUpdated: jest.fn(),
      scanStatusUpdated: jest.fn(),
    };
    const settings = {
      getEbookLibraryPath: async () => libraryPath,
      getComicLibraryPath: async () => libraryPath,
    };
    const ebooksService = new EbooksService(
      db as any,
      settings as any,
      events as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const comicsService = new ComicsService(
      db as any,
      settings as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      events as any,
      wsEvents as any,
      {} as any,
    );
    const importer = {
      importEbook: jest.fn().mockResolvedValue('reimported-ebook'),
      importComicSeriesUnit: jest.fn().mockResolvedValue('reimported-comic'),
    };
    const deleteMedia = (deleteFiles = true) => {
      if (kind === 'ebook') return ebooksService.delete('ebook-1', deleteFiles);
      if (kind === 'comic book')
        return comicsService.deleteBook('issue-1', deleteFiles);
      return comicsService.deleteSeries('series-1', deleteFiles);
    };
    const scanAfterRestart = () => {
      const scanner = new LibraryScannerService(
        db as any,
        new MediaDetectorService(),
        importer as any,
        events as any,
        wsEvents as any,
      );
      return kind === 'ebook'
        ? scanner.scanEbookLibrary(libraryPath)
        : scanner.scanComicLibrary(libraryPath);
    };

    return {
      deleteMedia,
      scanAfterRestart,
      db,
      events,
      wsEvents,
      importer,
      absolutePaths,
      books,
      records:
        kind === 'ebook' ? ebooks : kind === 'comic book' ? books : series,
    };
  }

  describe.each(kinds)('%s', (kind) => {
    it.each(['EACCES', 'EPERM', 'EROFS'])(
      'returns an error and keeps the record instead of reimporting after %s',
      async (code) => {
        const fixture = await setup(kind);
        const cause = Object.assign(new Error('File deletion failed'), {
          code,
        });
        jest.mocked(fs.unlink).mockRejectedValueOnce(cause);

        const outcome = await fixture.deleteMedia().catch((e: unknown) => e);
        const scan = await fixture.scanAfterRestart();

        expect(scan.added).toBe(0);
        expect(outcome).toBeInstanceOf(InternalServerErrorException);
        expect(outcome).toMatchObject({ cause });
        expect(fixture.records).toHaveLength(1);
        expect(fixture.db.delete).not.toHaveBeenCalled();
        expect(fixture.events.ebookDeleted).not.toHaveBeenCalled();
        expect(fixture.events.comicSeriesDeleted).not.toHaveBeenCalled();
        expect(fixture.events.comicSeriesUpdated).not.toHaveBeenCalled();
        expect(fixture.wsEvents.comicSeriesDeleted).not.toHaveBeenCalled();
        expect(fixture.wsEvents.comicSeriesUpdated).not.toHaveBeenCalled();
        expect(await fs.readFile(fixture.absolutePaths[0], 'utf8')).toBe(
          'media fixture',
        );
      },
    );

    it('does not trust a stale missing status when permanent deletion is requested', async () => {
      const fixture = await setup(kind, 'missing');
      jest
        .mocked(fs.unlink)
        .mockRejectedValueOnce(
          Object.assign(new Error('Permission denied'), { code: 'EACCES' }),
        );

      await expect(fixture.deleteMedia()).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );

      expect(fixture.records).toHaveLength(1);
      expect(fixture.db.delete).not.toHaveBeenCalled();
    });

    it.each<Status>(['available', 'hidden', 'missing'])(
      'deletes writable files and records without reimporting (status=%s)',
      async (status) => {
        const fixture = await setup(kind, status);

        await fixture.deleteMedia();
        const scan = await fixture.scanAfterRestart();

        expect(scan.added).toBe(0);
        expect(fixture.records).toEqual([]);
        await expect(fs.access(fixture.absolutePaths[0])).rejects.toMatchObject(
          {
            code: 'ENOENT',
          },
        );
      },
    );

    it('allows deletion when the source file is already absent', async () => {
      const fixture = await setup(kind);
      await realFs.unlink(fixture.absolutePaths[0]);

      await fixture.deleteMedia();

      expect(fixture.records).toEqual([]);
    });

    it('keeps files hidden through a startup scan when keeping files', async () => {
      const fixture = await setup(kind);

      await fixture.deleteMedia(false);
      const scan = await fixture.scanAfterRestart();

      expect(scan.added).toBe(0);
      expect(fixture.records[0].status).toBe('hidden');
      expect(fixture.db.delete).not.toHaveBeenCalled();
      expect(fs.unlink).not.toHaveBeenCalled();
      expect(await fs.readFile(fixture.absolutePaths[0], 'utf8')).toBe(
        'media fixture',
      );
    });
  });

  it('preserves a partially deleted comic series and supports retrying it', async () => {
    const fixture = await setup('comic series', 'available', 2);
    jest
      .mocked(fs.unlink)
      .mockImplementationOnce(realFs.unlink)
      .mockRejectedValueOnce(
        Object.assign(new Error('Permission denied'), { code: 'EACCES' }),
      );

    await expect(fixture.deleteMedia()).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );

    expect(fixture.records).toHaveLength(1);
    expect(fixture.books).toHaveLength(2);
    expect(fixture.db.delete).not.toHaveBeenCalled();
    expect(fixture.events.comicSeriesDeleted).not.toHaveBeenCalled();
    expect(fixture.wsEvents.comicSeriesDeleted).not.toHaveBeenCalled();
    await expect(fs.access(fixture.absolutePaths[0])).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(fs.access(fixture.absolutePaths[1])).resolves.toBeUndefined();

    await fixture.deleteMedia();
    const scan = await fixture.scanAfterRestart();

    expect(scan.added).toBe(0);
    expect(fixture.records).toEqual([]);
    expect(fixture.books).toEqual([]);
  });

  it('preserves an ebook if its cover cannot be deleted and supports retrying', async () => {
    const fixture = await setup('ebook');
    const coverPath = path.join(
      path.dirname(fixture.absolutePaths[0]),
      'cover.jpg',
    );
    await fs.writeFile(coverPath, 'cover fixture');
    jest
      .mocked(fs.unlink)
      .mockImplementationOnce(realFs.unlink)
      .mockRejectedValueOnce(
        Object.assign(new Error('Permission denied'), { code: 'EACCES' }),
      );

    await expect(fixture.deleteMedia()).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );

    expect(fixture.records).toHaveLength(1);
    expect(fixture.db.delete).not.toHaveBeenCalled();
    expect(fixture.events.ebookDeleted).not.toHaveBeenCalled();
    await expect(fs.access(fixture.absolutePaths[0])).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(fs.access(coverPath)).resolves.toBeUndefined();

    await fixture.deleteMedia();

    expect(fixture.records).toEqual([]);
    await expect(fs.access(coverPath)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});
