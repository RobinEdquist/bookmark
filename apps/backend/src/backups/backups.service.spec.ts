import { ConfigService } from '@nestjs/config';
import archiver from 'archiver';
import { createWriteStream } from 'fs';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as unzipper from 'unzipper';
import { AppDataService } from '../app-data/app-data.service';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { BackupsService } from './backups.service';

interface TestSettings {
  backupEnabled: boolean;
  backupPath: string | null;
  backupSchedule: string;
  backupsToKeep: number;
}

const MANAGED_DIRECTORIES = [
  'audiobook-covers',
  'ebook-covers',
  'comic-series-covers',
  'comic-book-covers',
  'people-images',
] as const;

describe('BackupsService', () => {
  let rootPath: string;
  let dataPath: string;
  let tempPath: string;
  let settings: TestSettings;
  let service: BackupsService;
  let updateSettings: jest.Mock;
  let appData: {
    getBasePath: () => string;
    getTempPath: () => string;
    getBackedUpDirectoryNames: () => readonly string[];
  };
  let appSettings: {
    getSettings: jest.Mock;
    updateSettings: jest.Mock;
  };

  const makeConfig = (overrides: Record<string, string> = {}) => {
    const values: Record<string, string> = {
      DATABASE_URL: 'postgresql://bookmark:test@localhost/bookmark',
      APP_VERSION: '1.2.3',
      TZ: 'Europe/Stockholm',
      ...overrides,
    };
    return {
      get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback),
      getOrThrow: jest.fn(() => values.DATABASE_URL),
    };
  };

  const makeService = (configOverrides: Record<string, string> = {}) =>
    new BackupsService(
      makeConfig(configOverrides) as unknown as ConfigService,
      appData as unknown as AppDataService,
      appSettings as unknown as AppSettingsService,
    );

  const mockPostgresCommands = (target: BackupsService = service) =>
    jest
      .spyOn(
        target as unknown as {
          runPostgresCommand: (
            command: 'pg_dump' | 'pg_restore' | 'psql',
            args: string[],
          ) => Promise<void>;
        },
        'runPostgresCommand',
      )
      .mockImplementation(async (command: string, args: string[]) => {
        if (command !== 'pg_dump') return;
        const dumpPath = args[args.indexOf('--file') + 1];
        await fs.writeFile(dumpPath, 'postgres-dump');
      });

  const writeTestArchive = async (
    archivePath: string,
    manifestOverrides: Record<string, unknown> = {},
  ): Promise<void> => {
    const manifest = {
      formatVersion: 1,
      application: 'bookmark',
      appVersion: '1.2.3',
      createdAt: new Date().toISOString(),
      contents: ['database.dump'],
      ...manifestOverrides,
    };
    const output = createWriteStream(archivePath);
    const archive = archiver('zip');
    archive.pipe(output);
    archive.append(JSON.stringify(manifest), { name: 'manifest.json' });
    archive.append('postgres-dump', { name: 'database.dump' });
    await archive.finalize();
    await new Promise<void>((resolve) => output.on('close', resolve));
  };

  const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  beforeEach(async () => {
    rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'bookmark-backups-'));
    dataPath = path.join(rootPath, 'data');
    tempPath = path.join(dataPath, 'temp');
    await fs.mkdir(tempPath, { recursive: true });

    settings = {
      backupEnabled: false,
      backupPath: null,
      backupSchedule: '0 2 * * *',
      backupsToKeep: 2,
    };
    updateSettings = jest.fn(async (updates: Partial<TestSettings>) => {
      settings = { ...settings, ...updates };
      return settings;
    });

    appData = {
      getBasePath: () => dataPath,
      getTempPath: () => tempPath,
      getBackedUpDirectoryNames: () => MANAGED_DIRECTORIES,
    };
    appSettings = {
      getSettings: jest.fn(async () => settings),
      updateSettings,
    };

    service = makeService();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    await fs.rm(rootPath, { recursive: true, force: true });
  });

  it('uses the application data directory and reports disabled scheduling', async () => {
    await expect(service.getConfig()).resolves.toMatchObject({
      enabled: false,
      path: path.join(dataPath, 'backups'),
      pathLocked: false,
      schedule: '0 2 * * *',
      retention: 2,
      timezone: 'Europe/Stockholm',
      nextBackupAt: null,
      pathError: null,
    });
  });

  it('validates and persists backup configuration', async () => {
    const customPath = path.join(rootPath, 'external-backups');
    const result = await service.updateConfig({
      enabled: true,
      path: customPath,
      schedule: '30 1 * * 1',
      retention: 9,
    });

    expect(updateSettings).toHaveBeenCalledWith({
      backupEnabled: true,
      backupPath: customPath,
      backupSchedule: '30 1 * * 1',
      backupsToKeep: 9,
    });
    expect(result).toMatchObject({
      enabled: true,
      path: customPath,
      retention: 9,
    });
    expect(result.nextBackupAt).not.toBeNull();
  });

  it('rejects schedules outside the daily, weekly, and monthly presets', async () => {
    await expect(
      service.updateConfig({ schedule: '* * * * * *' }),
    ).rejects.toThrow('Invalid backup schedule');
    await expect(
      service.updateConfig({ schedule: '* * * * *' }),
    ).rejects.toThrow('Invalid backup schedule');
  });

  it('creates restorable archives without media or cache directories', async () => {
    for (const directory of [...MANAGED_DIRECTORIES, 'comic-page-cache']) {
      await fs.mkdir(path.join(dataPath, directory), { recursive: true });
      await fs.writeFile(
        path.join(dataPath, directory, 'sample.jpg'),
        directory,
      );
    }
    await fs.mkdir(path.join(dataPath, 'db'), { recursive: true });
    await fs.writeFile(path.join(dataPath, 'db', 'PG_VERSION'), '18');
    await fs.writeFile(path.join(dataPath, '.better-auth-secret'), 'secret');

    mockPostgresCommands();

    const backup = await service.createBackup();
    const archivePath = path.join(dataPath, 'backups', backup.filename);
    const archive = await unzipper.Open.file(archivePath);
    const entries = archive.files.map((entry) => entry.path);

    expect(entries).toContain('manifest.json');
    expect(entries).toContain('database.dump');
    expect(entries).toContain('data/audiobook-covers/sample.jpg');
    expect(entries).toContain('data/.better-auth-secret');
    expect(entries.some((entry) => entry.startsWith('data/db'))).toBe(false);
    expect(
      entries.some((entry) => entry.startsWith('data/comic-page-cache')),
    ).toBe(false);
  });

  it('removes archives beyond the configured retention after success', async () => {
    settings.backupsToKeep = 1;
    await fs.mkdir(path.join(dataPath, 'audiobook-covers'), {
      recursive: true,
    });

    mockPostgresCommands();

    await service.createBackup();
    await sleep(10);
    await service.createBackup();

    await expect(service.listBackups()).resolves.toHaveLength(1);
  });

  it('keeps recently added archives even when their manifest date is old', async () => {
    settings.backupsToKeep = 2;
    await fs.mkdir(path.join(dataPath, 'audiobook-covers'), {
      recursive: true,
    });
    mockPostgresCommands();

    const first = await service.createBackup();
    await sleep(10);

    // An admin uploads an archive from an old server to restore it later: it
    // is the oldest by manifest date but the newest arrival in the directory.
    const uploadPath = path.join(rootPath, 'old-server.bookmark');
    await writeTestArchive(uploadPath, {
      createdAt: '2020-01-01T00:00:00.000Z',
    });
    const imported = await service.importBackup(uploadPath);
    await sleep(10);

    await service.createBackup();

    const remaining = await service.listBackups();
    const ids = remaining.map((backup) => backup.id);
    expect(remaining).toHaveLength(2);
    expect(ids).toContain(imported.id);
    expect(ids).not.toContain(first.id);
  });

  it('ignores archives with an invalid manifest', async () => {
    const backupPath = path.join(dataPath, 'backups');
    await fs.mkdir(backupPath, { recursive: true });
    const output = createWriteStream(path.join(backupPath, 'invalid.bookmark'));
    const archive = archiver('zip');
    archive.pipe(output);
    archive.append('{}', { name: 'manifest.json' });
    await archive.finalize();
    await new Promise<void>((resolve) => output.on('close', resolve));

    await expect(service.listBackups()).resolves.toEqual([]);
  });

  it('imports an archive and restores its managed data', async () => {
    const coversPath = path.join(dataPath, 'audiobook-covers');
    await fs.mkdir(coversPath, { recursive: true });
    await fs.writeFile(path.join(coversPath, 'cover.jpg'), 'backed-up-cover');
    const postgresCommands = mockPostgresCommands();

    const created = await service.createBackup();
    const storedPath = path.join(dataPath, 'backups', created.filename);
    const uploadPath = path.join(rootPath, 'uploaded.bookmark');
    await fs.copyFile(storedPath, uploadPath);
    await fs.unlink(storedPath);
    await fs.writeFile(path.join(coversPath, 'cover.jpg'), 'current-cover');

    const imported = await service.importBackup(uploadPath);
    await service.restoreBackup(imported.id);

    await expect(
      fs.readFile(path.join(coversPath, 'cover.jpg'), 'utf8'),
    ).resolves.toBe('backed-up-cover');
    expect(postgresCommands).toHaveBeenCalledWith(
      'pg_restore',
      expect.arrayContaining(['--single-transaction', '--exit-on-error']),
    );

    // The schemas must be reset immediately before pg_restore: --clean only
    // drops objects present in the dump, so leftovers from newer migrations
    // would otherwise crash-loop the post-restore migration run.
    const commands = postgresCommands.mock.calls.map(([command]) => command);
    const resetIndex = commands.indexOf('psql');
    const restoreIndex = commands.indexOf('pg_restore');
    expect(resetIndex).toBeGreaterThan(-1);
    expect(resetIndex).toBeLessThan(restoreIndex);
    const resetArgs = postgresCommands.mock.calls[resetIndex]?.[1] ?? [];
    expect(resetArgs.join(' ')).toContain('DROP SCHEMA IF EXISTS public');
  });

  it('imports past a stale partial file left by an unclean shutdown', async () => {
    const backupPath = path.join(dataPath, 'backups');
    await fs.mkdir(backupPath, { recursive: true });

    const createdAt = '2024-05-05T00:00:00.000Z';
    const baseId = `bookmark-${createdAt.replace(/[-:.]/g, '')}`;
    await fs.writeFile(
      path.join(backupPath, `${baseId}.bookmark.partial`),
      'half-written',
    );

    const uploadPath = path.join(rootPath, 'reupload.bookmark');
    await writeTestArchive(uploadPath, { createdAt });

    const imported = await service.importBackup(uploadPath);
    expect(imported.id).not.toBe(baseId);
    await expect(
      fs.access(path.join(backupPath, imported.filename)),
    ).resolves.toBeUndefined();
  });

  it('returns config and archives in one overview pass', async () => {
    await fs.mkdir(path.join(dataPath, 'audiobook-covers'), {
      recursive: true,
    });
    mockPostgresCommands();
    const created = await service.createBackup();

    const overview = await service.getOverview();
    expect(overview.config).toMatchObject({
      enabled: false,
      pathError: null,
    });
    expect(overview.backups.map((backup) => backup.id)).toEqual([created.id]);
  });

  it('refuses to restore a backup created by a newer Bookmark version', async () => {
    const backupPath = path.join(dataPath, 'backups');
    await fs.mkdir(backupPath, { recursive: true });
    await writeTestArchive(path.join(backupPath, 'bookmark-newer.bookmark'), {
      appVersion: '9.9.9',
    });

    await expect(service.restoreBackup('bookmark-newer')).rejects.toThrow(
      'newer than this instance',
    );
  });

  it('rejects uploads that are not Bookmark backup archives', async () => {
    const uploadPath = path.join(rootPath, 'not-a-zip.bookmark');
    await fs.writeFile(uploadPath, 'plain text, not a zip');

    await expect(service.importBackup(uploadPath)).rejects.toThrow(
      'not a valid Bookmark backup',
    );
  });

  it('accepts directory entries with trailing slashes and rejects unsafe paths', () => {
    const validate = (files: { path: string; type: string }[]) =>
      (
        service as unknown as {
          validateArchiveDirectory(directory: unknown): void;
        }
      ).validateArchiveDirectory({
        files: files.map((file) => ({ ...file, uncompressedSize: 10 })),
      });

    // `zip -r` and Finder emit explicit directory entries with trailing
    // slashes; a repacked but otherwise identical backup must stay valid.
    expect(() =>
      validate([
        { path: 'manifest.json', type: 'File' },
        { path: 'database.dump', type: 'File' },
        { path: 'data/', type: 'Directory' },
        { path: 'data/audiobook-covers/', type: 'Directory' },
        { path: 'data/audiobook-covers/a.jpg', type: 'File' },
      ]),
    ).not.toThrow();

    expect(() =>
      validate([
        { path: 'manifest.json', type: 'File' },
        { path: 'database.dump', type: 'File' },
        { path: '../evil.sh', type: 'File' },
      ]),
    ).toThrow('unsafe file path');

    expect(() =>
      validate([
        { path: 'manifest.json', type: 'File' },
        { path: 'database.dump', type: 'File' },
        { path: 'data/db/PG_VERSION', type: 'File' },
      ]),
    ).toThrow('unsafe file path');
  });

  it('refuses to operate inside a managed image directory', async () => {
    const unsafePath = path.join(dataPath, 'people-images');
    await fs.mkdir(unsafePath, { recursive: true });
    const unsafeService = makeService({ BACKUP_PATH: unsafePath });

    await expect(unsafeService.createBackup()).rejects.toThrow(
      'managed image directory',
    );
    await expect(unsafeService.listBackups()).resolves.toEqual([]);
    const config = await unsafeService.getConfig();
    expect(config.pathError).toContain('managed image directory');
  });

  it('sweeps stale partial files at startup without blocking boot', async () => {
    const backupPath = path.join(dataPath, 'backups');
    await fs.mkdir(backupPath, { recursive: true });
    const stale = path.join(backupPath, 'bookmark-crashed.bookmark.partial');
    await fs.writeFile(stale, 'half-written');

    await service.onModuleInit();

    await expect(fs.access(stale)).rejects.toThrow();
  });
});
