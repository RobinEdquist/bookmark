jest.mock('fs/promises', () => {
  const actual =
    jest.requireActual<typeof import('fs/promises')>('fs/promises');
  return {
    ...actual,
    rm: jest.fn(actual.rm),
    unlink: jest.fn(actual.unlink),
  };
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
import { LibraryScannerService } from '../library-watcher/library-scanner.service';
import { MediaDetectorService } from '../library-watcher/media-detector.service';
import { AudiobooksService } from './audiobooks.service';
import * as schema from './schema';

const realFs = jest.requireActual<typeof fs>('fs/promises');

describe('Audiobook deletion followed by a startup scan', () => {
  let libraryPath: string;

  beforeEach(async () => {
    jest.mocked(fs.rm).mockReset().mockImplementation(realFs.rm);
    jest.mocked(fs.unlink).mockReset().mockImplementation(realFs.unlink);
    libraryPath = await fs.mkdtemp(path.join(os.tmpdir(), 'audiobook-delete-'));
  });

  afterEach(async () => {
    await realFs.rm(libraryPath, { recursive: true, force: true });
  });

  async function setup(rootLevel: boolean, status = 'available') {
    const book = {
      id: 'audiobook-1',
      filePath: rootLevel ? '' : 'The 4 Percent Universe',
      status,
    };
    const file = { filePath: 'The 4 Percent Universe.m4b' };
    const absoluteFilePath = path.join(
      libraryPath,
      book.filePath,
      file.filePath,
    );
    await fs.mkdir(path.dirname(absoluteFilePath), { recursive: true });
    await fs.writeFile(absoluteFilePath, 'audio fixture');

    // Keep database state across deletion and scanning so a removed row with
    // surviving files is observed as a new import, just as after a restart.
    const books = [book];
    const db = {
      select: jest.fn(() => ({
        from: (table: unknown) => {
          const rows = table === schema.audiobooks ? books : [file];
          const query = {
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            limit: jest.fn().mockImplementation(async () => rows),
            then: (resolve: (value: unknown[]) => unknown) =>
              Promise.resolve(rows).then(resolve),
          };
          return query;
        },
      })),
      delete: jest.fn((table: unknown) => ({
        where: jest.fn().mockImplementation(async () => {
          if (table === schema.audiobooks) books.splice(0);
        }),
      })),
      update: jest.fn(() => ({
        set: (values: object) => ({
          where: jest.fn().mockImplementation(async () => {
            Object.assign(book, values);
          }),
        }),
      })),
    };
    const events = {
      audiobookDeleted: jest.fn(),
      audiobookUpdated: jest.fn(),
      libraryScanStarted: jest.fn(),
      libraryScanCompleted: jest.fn(),
    };
    const importer = {
      importAudiobook: jest.fn().mockResolvedValue('reimported-audiobook'),
      repairBrokenAudiobookFiles: jest
        .fn()
        .mockResolvedValue({ repaired: [], errors: [] }),
    };
    const service = new AudiobooksService(
      db as any,
      {} as any,
      { getAudiobookLibraryPath: async () => libraryPath } as any,
      events as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any, // metadataResolver
    );
    // Recreate the scanner after deletion, using real detection and disk files.
    const scanAfterRestart = () =>
      new LibraryScannerService(
        db as any,
        new MediaDetectorService(),
        importer as any,
        events as any,
        { scanStatusUpdated: jest.fn() } as any,
        {} as any, // metadataResolver
      ).scanAudiobookLibrary(libraryPath);

    return {
      service,
      scanAfterRestart,
      db,
      events,
      importer,
      books,
      absoluteFilePath,
    };
  }

  it.each([false, true])(
    'keeps the original record when permissions prevent deletion (root=%s)',
    async (rootLevel) => {
      const fixture = await setup(rootLevel);
      const error = Object.assign(new Error('Permission denied'), {
        code: 'EACCES',
      });
      jest.mocked(rootLevel ? fs.unlink : fs.rm).mockRejectedValueOnce(error);

      const outcome = await fixture.service
        .delete('audiobook-1', true)
        .catch((e: unknown) => e);
      const scan = await fixture.scanAfterRestart();

      expect(scan.added).toBe(0);
      expect(fixture.importer.importAudiobook).not.toHaveBeenCalled();
      expect(outcome).toBeInstanceOf(InternalServerErrorException);
      expect(fixture.books).toHaveLength(1);
      expect(fixture.db.delete).not.toHaveBeenCalled();
      expect(fixture.events.audiobookDeleted).not.toHaveBeenCalled();
      expect(await fs.readFile(fixture.absoluteFilePath, 'utf8')).toBe(
        'audio fixture',
      );
    },
  );

  it.each([false, true])(
    'permanently removes writable files without reimporting them (root=%s)',
    async (rootLevel) => {
      const fixture = await setup(rootLevel);

      await fixture.service.delete('audiobook-1', true);
      const scan = await fixture.scanAfterRestart();

      expect(scan.added).toBe(0);
      expect(fixture.books).toEqual([]);
      expect(fixture.events.audiobookDeleted).toHaveBeenCalledWith(
        'audiobook-1',
      );
      await expect(fs.access(fixture.absoluteFilePath)).rejects.toMatchObject({
        code: 'ENOENT',
      });
    },
  );

  it.each([false, true])(
    'allows permanent deletion when the files are already gone (root=%s)',
    async (rootLevel) => {
      const fixture = await setup(rootLevel);
      await realFs.rm(
        rootLevel
          ? fixture.absoluteFilePath
          : path.dirname(fixture.absoluteFilePath),
        {
          recursive: true,
        },
      );

      await fixture.service.delete('audiobook-1', true);

      expect(fixture.books).toEqual([]);
      expect(fixture.events.audiobookDeleted).toHaveBeenCalledWith(
        'audiobook-1',
      );
    },
  );

  it.each([false, true])(
    'checks deletion even if a stale status says files are missing (root=%s)',
    async (rootLevel) => {
      const fixture = await setup(rootLevel, 'missing');
      const error = Object.assign(new Error('Permission denied'), {
        code: 'EACCES',
      });
      jest.mocked(rootLevel ? fs.unlink : fs.rm).mockRejectedValueOnce(error);

      await expect(
        fixture.service.delete('audiobook-1', true),
      ).rejects.toBeInstanceOf(InternalServerErrorException);

      expect(fixture.books).toHaveLength(1);
      expect(fixture.events.audiobookDeleted).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    'keeps files hidden through a startup scan when keeping files (root=%s)',
    async (rootLevel) => {
      const fixture = await setup(rootLevel);

      await fixture.service.delete('audiobook-1', false);
      const scan = await fixture.scanAfterRestart();

      expect(scan.added).toBe(0);
      expect(fixture.books[0].status).toBe('hidden');
      expect(fixture.events.audiobookDeleted).not.toHaveBeenCalled();
      expect(await fs.readFile(fixture.absoluteFilePath, 'utf8')).toBe(
        'audio fixture',
      );
    },
  );
});
