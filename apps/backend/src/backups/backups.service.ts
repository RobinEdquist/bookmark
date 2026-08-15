import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import archiver from 'archiver';
import { CronJob, CronTime } from 'cron';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';
import { createWriteStream } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';
import * as unzipper from 'unzipper';
import { AppDataService } from '../app-data/app-data.service';
import { AppSettingsService } from '../app-settings/app-settings.service';
import {
  BackupConfigDto,
  BackupEntryDto,
  BackupOverviewDto,
} from './dto/backup-response.dto';
import { UpdateBackupConfigDto } from './dto/update-backup-config.dto';

type AppSettings = Awaited<ReturnType<AppSettingsService['getSettings']>>;

const BACKUP_EXTENSION = '.bookmark';
const BACKUP_FORMAT_VERSION = 1;
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 100_000;
const MAX_UNCOMPRESSED_BYTES = 20 * 1024 * 1024 * 1024;
// A dump or restore that runs longer than this is considered wedged (for
// example pg_dump blocked on a lock forever); without a bound it would hold
// the running/restoring flag until the process restarts.
const POSTGRES_COMMAND_TIMEOUT_MS = 60 * 60 * 1000;
// Placeholder substituted inside runPostgresCommand, where credentials are
// moved out of argv and into the child environment.
const DATABASE_URL_ARG = '<database-url>';

interface BackupManifest {
  formatVersion: number;
  application: 'bookmark';
  appVersion: string;
  createdAt: string;
  contents: string[];
}

@Injectable()
export class BackupsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackupsService.name);
  private scheduledJob: CronJob | null = null;
  private running = false;
  private restoring = false;
  // Serializes stop/read/start of the cron job so concurrent config updates
  // cannot each start a job and orphan one of them.
  private scheduleLock: Promise<unknown> = Promise.resolve();
  private readonly manifestCache = new Map<
    string,
    { key: string; manifest: BackupManifest }
  >();

  constructor(
    private readonly configService: ConfigService,
    private readonly appData: AppDataService,
    private readonly appSettings: AppSettingsService,
  ) {}

  async onModuleInit(): Promise<void> {
    // A missing or unwritable backup location must never prevent the app from
    // booting: the admin needs the UI up to fix it.
    try {
      const backupPath = await this.getBackupPath();
      await this.sweepPartialFiles(backupPath);
    } catch (error) {
      this.logger.error(
        `Backup location is not usable: ${this.errorMessage(error)}`,
      );
    }
    try {
      await this.refreshSchedule();
    } catch (error) {
      this.logger.error(
        `Could not start the backup schedule: ${this.errorMessage(error)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.runScheduleExclusive(() => this.stopScheduledJob());
  }

  async getConfig(): Promise<BackupConfigDto> {
    const settings = await this.appSettings.getSettings();
    const backupPath = this.resolveBackupPath(settings.backupPath);
    return this.buildConfig(
      settings,
      backupPath,
      await this.checkBackupPath(backupPath),
    );
  }

  /**
   * Config and archive list in one pass: settings are read and the backup
   * directory prepared once, instead of twice via getConfig + listBackups
   * (this endpoint is polled every 5s while a backup runs).
   */
  async getOverview(): Promise<BackupOverviewDto> {
    const settings = await this.appSettings.getSettings();
    const backupPath = this.resolveBackupPath(settings.backupPath);
    const pathError = await this.checkBackupPath(backupPath);
    let backups: BackupEntryDto[] = [];
    if (!pathError) {
      try {
        backups = await this.readBackupEntries(backupPath);
      } catch (error) {
        this.logger.warn(`Could not list backups: ${this.errorMessage(error)}`);
      }
    }
    return {
      config: this.buildConfig(settings, backupPath, pathError),
      backups,
    };
  }

  private buildConfig(
    settings: AppSettings,
    backupPath: string,
    pathError: string | null,
  ): BackupConfigDto {
    return {
      enabled: settings.backupEnabled,
      path: backupPath,
      pathLocked: Boolean(this.configService.get<string>('BACKUP_PATH')),
      schedule: settings.backupSchedule,
      retention: settings.backupsToKeep,
      timezone: this.timezone,
      nextBackupAt:
        settings.backupEnabled && this.scheduledJob
          ? this.scheduledJob.nextDate().toUTC().toISO()
          : null,
      isRunning: this.running || this.restoring,
      pathError,
    };
  }

  private async checkBackupPath(backupPath: string): Promise<string | null> {
    try {
      await this.validateWritableDirectory(backupPath);
      return null;
    } catch (error) {
      return this.errorMessage(error);
    }
  }

  private assertNotBusy(): void {
    if (this.running || this.restoring) {
      throw new ConflictException('A backup operation is already running');
    }
  }

  async updateConfig(dto: UpdateBackupConfigDto): Promise<BackupConfigDto> {
    this.assertNotBusy();
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('No backup settings provided');
    }

    if (dto.schedule !== undefined) {
      this.validateSchedule(dto.schedule);
    }

    const pathLocked = Boolean(this.configService.get<string>('BACKUP_PATH'));
    if (dto.path !== undefined && pathLocked) {
      throw new BadRequestException(
        'The backup location is controlled by BACKUP_PATH',
      );
    }

    const normalizedPath =
      dto.path === undefined
        ? undefined
        : dto.path?.trim()
          ? path.resolve(dto.path.trim())
          : null;

    if (normalizedPath !== undefined) {
      await this.validateWritableDirectory(
        normalizedPath ?? this.defaultBackupPath,
      );
    }

    await this.appSettings.updateSettings({
      backupEnabled: dto.enabled,
      backupPath: normalizedPath,
      backupSchedule: dto.schedule,
      backupsToKeep: dto.retention,
    });

    await this.refreshSchedule();
    return this.getConfig();
  }

  async listBackups(): Promise<BackupEntryDto[]> {
    try {
      const backupPath = await this.getBackupPath();
      return await this.readBackupEntries(backupPath);
    } catch (error) {
      // Keep the settings screen loadable with a bad location; getConfig
      // surfaces the reason as pathError.
      this.logger.warn(
        `Backup location is not usable: ${this.errorMessage(error)}`,
      );
      return [];
    }
  }

  private async readBackupEntries(
    backupPath: string,
  ): Promise<BackupEntryDto[]> {
    const filenames = await fs.readdir(backupPath);
    const backups: BackupEntryDto[] = [];

    for (const filename of filenames) {
      if (!filename.endsWith(BACKUP_EXTENSION)) continue;
      const fullPath = path.join(backupPath, filename);
      try {
        const stats = await fs.stat(fullPath);
        const manifest = await this.readManifestCached(fullPath, stats);
        backups.push({
          id: filename.slice(0, -BACKUP_EXTENSION.length),
          filename,
          createdAt: manifest.createdAt,
          size: stats.size,
          appVersion: manifest.appVersion,
        });
      } catch (error) {
        this.logger.warn(
          `Ignoring invalid backup ${filename}: ${this.errorMessage(error)}`,
        );
      }
    }

    return backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createBackup(): Promise<BackupEntryDto> {
    this.assertNotBusy();

    this.running = true;
    const workPath = path.join(
      this.appData.getTempPath(),
      `backup-${randomUUID()}`,
    );
    let partialPath: string | null = null;

    try {
      const settings = await this.appSettings.getSettings();
      const backupPath = await this.prepareBackupPath(
        this.resolveBackupPath(settings.backupPath),
      );
      await fs.mkdir(workPath, { recursive: true });

      const createdAt = new Date();
      const id = `bookmark-${createdAt.toISOString().replace(/[-:.]/g, '')}`;
      const filename = `${id}${BACKUP_EXTENSION}`;
      const finalPath = path.join(backupPath, filename);
      partialPath = `${finalPath}.partial`;
      const databasePath = path.join(workPath, 'database.dump');

      this.logger.log(`Creating backup ${filename}`);
      await this.runPostgresCommand('pg_dump', [
        '--format=custom',
        '--no-owner',
        '--no-privileges',
        '--file',
        databasePath,
        DATABASE_URL_ARG,
      ]);

      const manifest: BackupManifest = {
        formatVersion: BACKUP_FORMAT_VERSION,
        application: 'bookmark',
        appVersion: this.configService.get<string>('APP_VERSION', 'unknown'),
        createdAt: createdAt.toISOString(),
        contents: [
          'database.dump',
          ...this.managedDirectories.map((directory) => `data/${directory}`),
        ],
      };

      await this.writeArchive(partialPath, databasePath, manifest);
      await fs.rename(partialPath, finalPath);
      partialPath = null;
      await this.enforceRetention(settings.backupsToKeep, backupPath);

      const stats = await fs.stat(finalPath);
      this.logger.log(`Created backup ${filename} (${stats.size} bytes)`);
      return {
        id,
        filename,
        createdAt: manifest.createdAt,
        size: stats.size,
        appVersion: manifest.appVersion,
      };
    } catch (error) {
      this.logger.error(`Backup failed: ${this.errorMessage(error)}`);
      throw error;
    } finally {
      if (partialPath) await fs.rm(partialPath, { force: true });
      await fs.rm(workPath, { recursive: true, force: true });
      this.running = false;
    }
  }

  async importBackup(uploadPath: string): Promise<BackupEntryDto> {
    this.assertNotBusy();

    this.running = true;
    let partialPath: string | null = null;
    try {
      let manifest: BackupManifest;
      let directory: Awaited<ReturnType<typeof unzipper.Open.file>>;
      try {
        directory = await unzipper.Open.file(uploadPath);
        manifest = await this.readManifestFromDirectory(directory);
      } catch (error) {
        if (error instanceof BadRequestException) throw error;
        throw new BadRequestException(
          'The uploaded file is not a valid Bookmark backup',
        );
      }
      this.validateArchiveDirectory(directory);

      const createdAt = new Date(manifest.createdAt);
      if (Number.isNaN(createdAt.getTime())) {
        throw new BadRequestException('Backup has an invalid creation date');
      }

      const settings = await this.appSettings.getSettings();
      const backupPath = await this.prepareBackupPath(
        this.resolveBackupPath(settings.backupPath),
      );

      const baseId = `bookmark-${createdAt.toISOString().replace(/[-:.]/g, '')}`;
      const exists = (candidate: string): Promise<boolean> =>
        fs
          .access(candidate)
          .then(() => true)
          .catch(() => false);
      let id = baseId;
      let finalPath = path.join(backupPath, `${id}${BACKUP_EXTENSION}`);
      // Probe the .partial too: a stale one from an unclean shutdown would
      // make the COPYFILE_EXCL copy below fail on every retry of this upload.
      if ((await exists(finalPath)) || (await exists(`${finalPath}.partial`))) {
        id = `${baseId}-${randomUUID().slice(0, 8)}`;
        finalPath = path.join(backupPath, `${id}${BACKUP_EXTENSION}`);
      }

      partialPath = `${finalPath}.partial`;
      await fs.copyFile(uploadPath, partialPath, fs.constants.COPYFILE_EXCL);
      await fs.rename(partialPath, finalPath);
      partialPath = null;
      const stats = await fs.stat(finalPath);

      return {
        id,
        filename: path.basename(finalPath),
        createdAt: manifest.createdAt,
        size: stats.size,
        appVersion: manifest.appVersion,
      };
    } finally {
      if (partialPath) await fs.rm(partialPath, { force: true });
      this.running = false;
    }
  }

  async deleteBackup(id: string): Promise<void> {
    this.assertNotBusy();
    const backup = await this.findBackup(id);
    await fs.unlink(backup.fullPath);
  }

  async getBackupFile(id: string): Promise<{
    fullPath: string;
    filename: string;
  }> {
    return this.findBackup(id);
  }

  async restoreBackup(id: string): Promise<void> {
    this.assertNotBusy();

    this.restoring = true;
    const stagePath = path.join(
      this.appData.getTempPath(),
      `restore-${randomUUID()}`,
    );

    try {
      const backup = await this.findBackup(id);
      const manifest = await this.readManifestCached(backup.fullPath);
      this.assertRestorableVersion(manifest.appVersion);
      await fs.mkdir(stagePath, { recursive: true });
      await this.extractArchive(backup.fullPath, stagePath);

      const databasePath = path.join(stagePath, 'database.dump');
      const rollbackDatabasePath = path.join(stagePath, 'rollback.dump');
      await fs.access(databasePath, fs.constants.R_OK);

      this.logger.warn(`Restoring backup ${backup.filename}`);
      await this.runPostgresCommand('pg_dump', [
        '--format=custom',
        '--no-owner',
        '--no-privileges',
        '--file',
        rollbackDatabasePath,
        DATABASE_URL_ARG,
      ]);
      try {
        // restoreDatabase resets the schemas first, so a failure inside it
        // is destructive and needs the database rollback just as much as a
        // managed-data failure does.
        await this.restoreDatabase(databasePath);
        await this.replaceManagedData(stagePath);
      } catch (error) {
        this.logger.error(
          `Restore failed; rolling the database back: ${this.errorMessage(error)}`,
        );
        try {
          await this.restoreDatabase(rollbackDatabasePath);
        } catch (rollbackError) {
          // The finally block deletes stagePath, and with it the only
          // snapshot of the pre-restore database. Move it somewhere durable
          // before that happens.
          await this.preserveRollbackDump(rollbackDatabasePath);
          throw rollbackError;
        }
        throw error;
      }
      this.logger.warn(
        `Restored backup ${backup.filename}; the application must restart`,
      );
    } finally {
      await fs.rm(stagePath, { recursive: true, force: true });
      this.restoring = false;
    }
  }

  async refreshSchedule(): Promise<void> {
    await this.runScheduleExclusive(async () => {
      await this.stopScheduledJob();
      const settings = await this.appSettings.getSettings();
      if (!settings.backupEnabled) {
        this.logger.log('Automatic backups are disabled');
        return;
      }

      this.validateSchedule(settings.backupSchedule);
      this.scheduledJob = CronJob.from({
        cronTime: settings.backupSchedule,
        timeZone: this.timezone,
        start: true,
        unrefTimeout: true,
        waitForCompletion: true,
        onTick: async () => {
          try {
            await this.createBackup();
          } catch (error) {
            this.logger.error(
              `Scheduled backup failed: ${this.errorMessage(error)}`,
            );
          }
        },
        errorHandler: (error) => {
          this.logger.error(
            `Backup scheduler failed: ${this.errorMessage(error)}`,
          );
        },
      });
      this.logger.log(
        `Scheduled automatic backups with "${settings.backupSchedule}" (${this.timezone})`,
      );
    });
  }

  private runScheduleExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.scheduleLock.then(operation, operation);
    this.scheduleLock = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async stopScheduledJob(): Promise<void> {
    if (this.scheduledJob) {
      await this.scheduledJob.stop();
      this.scheduledJob = null;
    }
  }

  private async getBackupPath(): Promise<string> {
    const settings = await this.appSettings.getSettings();
    return this.prepareBackupPath(this.resolveBackupPath(settings.backupPath));
  }

  /**
   * Creates the backup directory and verifies it is a location this service
   * is allowed to operate in. Every code path that reads from, writes to, or
   * deletes inside the backup directory must go through this.
   */
  private async prepareBackupPath(backupPath: string): Promise<string> {
    await fs.mkdir(backupPath, { recursive: true });
    await this.assertBackupPathIsSafe(backupPath);
    return backupPath;
  }

  private async sweepPartialFiles(backupPath: string): Promise<void> {
    // .partial files are half-written archives from a crash mid-backup. No
    // backup can be in progress this early, so they are always stale.
    const filenames = await fs.readdir(backupPath).catch(() => [] as string[]);
    for (const filename of filenames) {
      if (!filename.endsWith('.partial')) continue;
      await fs
        .rm(path.join(backupPath, filename), { force: true })
        .catch(() => undefined);
      this.logger.warn(`Removed stale partial backup file ${filename}`);
    }
  }

  private resolveBackupPath(storedPath: string | null): string {
    return path.resolve(
      this.configService.get<string>('BACKUP_PATH') ||
        storedPath ||
        this.defaultBackupPath,
    );
  }

  private get defaultBackupPath(): string {
    return path.join(this.appData.getBasePath(), 'backups');
  }

  private get managedDirectories(): readonly string[] {
    return this.appData.getBackedUpDirectoryNames();
  }

  private get timezone(): string {
    return this.configService.get<string>('TZ', 'UTC');
  }

  private validateSchedule(schedule: string): void {
    const parts = schedule.trim().split(/\s+/);
    if (parts.length !== 5) {
      throw new BadRequestException('Invalid backup schedule');
    }
    const [minuteText, hourText, monthDay, month, weekday] = parts;
    const minute = Number(minuteText);
    const hour = Number(hourText);
    const validTime =
      Number.isInteger(minute) &&
      minute >= 0 &&
      minute <= 59 &&
      Number.isInteger(hour) &&
      hour >= 0 &&
      hour <= 23;
    const daily = monthDay === '*' && month === '*' && weekday === '*';
    const weekly =
      monthDay === '*' && month === '*' && /^[0-6]$/.test(weekday ?? '');
    const monthly =
      /^([1-9]|1\d|2[0-8])$/.test(monthDay ?? '') &&
      month === '*' &&
      weekday === '*';
    if (!validTime || (!daily && !weekly && !monthly)) {
      throw new BadRequestException('Invalid backup schedule');
    }
    try {
      new CronTime(schedule, this.timezone);
    } catch {
      throw new BadRequestException('Invalid backup schedule');
    }
  }

  private async validateWritableDirectory(directory: string): Promise<void> {
    try {
      await this.prepareBackupPath(directory);
      await fs.access(directory, fs.constants.R_OK | fs.constants.W_OK);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        'Backup location does not exist and could not be created, or is not writable',
      );
    }
  }

  private async writeArchive(
    outputPath: string,
    databasePath: string,
    manifest: BackupManifest,
  ): Promise<void> {
    const authSecretPath = path.join(
      this.appData.getBasePath(),
      '.better-auth-secret',
    );
    const includeAuthSecret = await fs
      .access(authSecretPath)
      .then(() => true)
      .catch(() => false);

    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(outputPath, { flags: 'wx' });
      // Everything in the archive is already compressed (pg_dump's custom
      // format compresses internally, covers are JPEGs), so a high zlib
      // level would burn CPU for no size gain.
      const archive = archiver('zip', { zlib: { level: 1 } });
      let settled = false;
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      output.on('close', () => {
        if (settled) return;
        settled = true;
        resolve();
      });
      output.on('error', fail);
      archive.on('error', fail);
      archive.on('warning', (error) => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') fail(error);
      });
      archive.pipe(output);
      archive.file(databasePath, { name: 'database.dump' });
      archive.append(JSON.stringify(manifest, null, 2), {
        name: 'manifest.json',
      });

      for (const directory of this.managedDirectories) {
        archive.directory(
          path.join(this.appData.getBasePath(), directory),
          `data/${directory}`,
        );
      }

      if (includeAuthSecret) {
        archive.file(authSecretPath, { name: 'data/.better-auth-secret' });
      }
      // finalize() rejects on zip-engine errors; without a handler that
      // rejection would escape the 'error' listener above and take down the
      // whole process as an unhandled rejection.
      archive.finalize().catch(fail);
    });
  }

  private async readManifestCached(
    archivePath: string,
    stats?: { mtimeMs: number; size: number },
  ): Promise<BackupManifest> {
    const { mtimeMs, size } = stats ?? (await fs.stat(archivePath));
    const key = `${mtimeMs}:${size}`;
    const cached = this.manifestCache.get(archivePath);
    if (cached?.key === key) return cached.manifest;

    const manifest = await this.readManifest(archivePath);
    if (this.manifestCache.size > 512) this.manifestCache.clear();
    this.manifestCache.set(archivePath, { key, manifest });
    return manifest;
  }

  private async readManifest(archivePath: string): Promise<BackupManifest> {
    return this.readManifestFromDirectory(
      await unzipper.Open.file(archivePath),
    );
  }

  private async readManifestFromDirectory(
    directory: Awaited<ReturnType<typeof unzipper.Open.file>>,
  ): Promise<BackupManifest> {
    const manifestEntry = directory.files.find(
      (entry) => entry.path === 'manifest.json',
    );
    if (!manifestEntry || manifestEntry.uncompressedSize > MAX_MANIFEST_BYTES) {
      throw new BadRequestException('Backup manifest is missing or invalid');
    }

    // The size in the zip central directory is attacker-controlled metadata;
    // cap the actually inflated bytes instead of trusting it.
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of manifestEntry.stream() as AsyncIterable<Buffer>) {
      total += chunk.length;
      if (total > MAX_MANIFEST_BYTES) {
        throw new BadRequestException('Backup manifest is missing or invalid');
      }
      chunks.push(chunk);
    }

    let manifest: BackupManifest;
    try {
      manifest = JSON.parse(
        Buffer.concat(chunks).toString('utf8'),
      ) as BackupManifest;
    } catch {
      throw new BadRequestException('Backup manifest is missing or invalid');
    }
    if (
      manifest.application !== 'bookmark' ||
      manifest.formatVersion !== BACKUP_FORMAT_VERSION ||
      !manifest.createdAt ||
      !manifest.appVersion
    ) {
      throw new BadRequestException('Unsupported Bookmark backup format');
    }
    return manifest;
  }

  /**
   * Refuses to restore archives created by a newer Bookmark: the dump would
   * recreate a schema (and migration journal) this binary cannot run against,
   * and migrations cannot be rolled back. Dev builds compare by base version.
   */
  private assertRestorableVersion(backupVersion: string): void {
    const parse = (version: string): number[] | null => {
      const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version);
      return match
        ? [Number(match[1]), Number(match[2]), Number(match[3])]
        : null;
    };
    const currentVersion = this.configService.get<string>(
      'APP_VERSION',
      'unknown',
    );
    const backup = parse(backupVersion);
    const current = parse(currentVersion);
    if (!backup || !current) {
      this.logger.warn(
        `Skipping the backup version check (backup ${backupVersion}, current ${currentVersion})`,
      );
      return;
    }
    for (let index = 0; index < 3; index++) {
      if (backup[index] === current[index]) continue;
      if ((backup[index] ?? 0) > (current[index] ?? 0)) {
        throw new BadRequestException(
          `This backup was created by Bookmark ${backupVersion}, which is newer than this instance. Update Bookmark before restoring it.`,
        );
      }
      return;
    }
  }

  private async extractArchive(
    archivePath: string,
    destination: string,
  ): Promise<void> {
    const directory = await unzipper.Open.file(archivePath);
    this.validateArchiveDirectory(directory);

    // Budget on actually inflated bytes; the declared sizes checked above are
    // attacker-controlled and can lie.
    let remainingBytes = MAX_UNCOMPRESSED_BYTES;

    for (const entry of directory.files) {
      const normalized = this.normalizeEntryPath(entry.path);
      const outputPath = path.join(destination, ...normalized.split('/'));
      if (entry.type === 'Directory') {
        await fs.mkdir(outputPath, { recursive: true });
        continue;
      }
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await pipeline(
        entry.stream(),
        new Transform({
          transform: (chunk: Buffer, _encoding, callback) => {
            remainingBytes -= chunk.length;
            if (remainingBytes < 0) {
              callback(
                new BadRequestException(
                  'Backup is too large to restore safely',
                ),
              );
            } else {
              callback(null, chunk);
            }
          },
        }),
        createWriteStream(outputPath, { flags: 'wx' }),
      );
    }
  }

  private normalizeEntryPath(entryPath: string): string {
    // Directory entries from standard zip tools carry a trailing slash that
    // posix.normalize preserves.
    return path.posix.normalize(entryPath).replace(/\/+$/, '');
  }

  private validateArchiveDirectory(
    directory: Awaited<ReturnType<typeof unzipper.Open.file>>,
  ): void {
    if (directory.files.length > MAX_ARCHIVE_ENTRIES) {
      throw new BadRequestException('Backup contains too many files');
    }
    const uncompressedBytes = directory.files.reduce(
      (total, entry) => total + entry.uncompressedSize,
      0,
    );
    if (uncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
      throw new BadRequestException('Backup is too large to restore safely');
    }
    if (!directory.files.some((entry) => entry.path === 'database.dump')) {
      throw new BadRequestException('Backup database is missing');
    }

    for (const entry of directory.files) {
      const normalized = this.normalizeEntryPath(entry.path);
      const allowedDataPath =
        normalized === 'data' ||
        normalized === 'data/.better-auth-secret' ||
        this.managedDirectories.some(
          (managed) =>
            normalized === `data/${managed}` ||
            normalized.startsWith(`data/${managed}/`),
        );
      const allowed =
        normalized === 'manifest.json' ||
        normalized === 'database.dump' ||
        allowedDataPath;
      if (
        !allowed ||
        normalized.startsWith('../') ||
        path.posix.isAbsolute(normalized)
      ) {
        throw new BadRequestException('Backup contains an unsafe file path');
      }
    }
  }

  private async replaceManagedData(stagePath: string): Promise<void> {
    const rollbackPath = path.join(stagePath, '.rollback');
    await fs.mkdir(rollbackPath, { recursive: true });
    const replaced: string[] = [];
    const currentSecret = path.join(
      this.appData.getBasePath(),
      '.better-auth-secret',
    );
    const rollbackSecret = path.join(rollbackPath, '.better-auth-secret');
    let secretReplaced = false;
    let hadCurrentSecret = false;

    try {
      for (const directory of this.managedDirectories) {
        const staged = path.join(stagePath, 'data', directory);
        try {
          await fs.access(staged);
        } catch {
          continue;
        }

        const current = path.join(this.appData.getBasePath(), directory);
        const rollback = path.join(rollbackPath, directory);
        await fs
          .rename(current, rollback)
          .catch((error: NodeJS.ErrnoException) => {
            if (error.code !== 'ENOENT') throw error;
          });
        // Register for rollback BEFORE the staged rename: if that rename
        // fails, `current` already sits inside rollbackPath and would
        // otherwise be deleted with the stage directory instead of restored.
        replaced.push(directory);
        await fs.rename(staged, current);
      }

      const stagedSecret = path.join(stagePath, 'data', '.better-auth-secret');
      try {
        await fs
          .copyFile(currentSecret, rollbackSecret)
          .then(() => {
            hadCurrentSecret = true;
          })
          .catch((error: NodeJS.ErrnoException) => {
            if (error.code !== 'ENOENT') throw error;
          });
        await fs.copyFile(stagedSecret, currentSecret);
        secretReplaced = true;
        await fs.chmod(currentSecret, 0o600);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    } catch (error) {
      for (const directory of replaced.reverse()) {
        const current = path.join(this.appData.getBasePath(), directory);
        const rollback = path.join(rollbackPath, directory);
        await fs.rm(current, { recursive: true, force: true });
        await fs.rename(rollback, current).catch(() => undefined);
      }
      if (secretReplaced) {
        if (hadCurrentSecret) {
          await fs
            .copyFile(rollbackSecret, currentSecret)
            .catch(() => undefined);
        } else {
          await fs.rm(currentSecret, { force: true });
        }
      }
      throw error;
    }
  }

  private async preserveRollbackDump(
    rollbackDatabasePath: string,
  ): Promise<void> {
    const filename = `pre-restore-rollback-${new Date()
      .toISOString()
      .replace(/[-:.]/g, '')}.dump`;
    const candidates: string[] = [];
    try {
      candidates.push(path.join(await this.getBackupPath(), filename));
    } catch {
      // Fall through to the app data directory.
    }
    candidates.push(path.join(this.appData.getBasePath(), filename));

    for (const target of candidates) {
      try {
        await fs.copyFile(
          rollbackDatabasePath,
          target,
          fs.constants.COPYFILE_EXCL,
        );
        this.logger.error(
          `Database rollback failed; the pre-restore database snapshot was preserved at ${target}. It can be restored manually with pg_restore.`,
        );
        return;
      } catch {
        continue;
      }
    }
    this.logger.error(
      'Database rollback failed and the pre-restore database snapshot could not be preserved',
    );
  }

  private async restoreDatabase(databasePath: string): Promise<void> {
    // pg_restore --clean only drops objects that exist in the dump. Restoring
    // an OLDER backup on a newer binary would leave tables from newer
    // migrations in place while the restored migration journal forgets they
    // ran — the post-restore restart then re-runs those migrations against
    // the leftovers and crash-loops on "already exists". Reset the schemas
    // wholesale instead; the rollback dump taken before any restore covers
    // the failure paths.
    await this.runPostgresCommand('psql', [
      '--no-psqlrc',
      '--set',
      'ON_ERROR_STOP=1',
      '--command',
      'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;',
      '--dbname',
      DATABASE_URL_ARG,
    ]);
    await this.runPostgresCommand('pg_restore', [
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-privileges',
      '--single-transaction',
      '--exit-on-error',
      '--dbname',
      DATABASE_URL_ARG,
      databasePath,
    ]);
  }

  private async assertBackupPathIsSafe(backupPath: string): Promise<void> {
    const resolvedBackupPath = await fs
      .realpath(backupPath)
      .catch(() => path.resolve(backupPath));
    for (const directory of this.managedDirectories) {
      const managedPath = path.join(this.appData.getBasePath(), directory);
      const resolvedManagedPath = await fs
        .realpath(managedPath)
        .catch(() => path.resolve(managedPath));
      const relative = path.relative(resolvedManagedPath, resolvedBackupPath);
      if (
        relative === '' ||
        (!relative.startsWith('..') && !path.isAbsolute(relative))
      ) {
        throw new BadRequestException(
          'Backup location cannot be inside a managed image directory',
        );
      }
    }
  }

  private async enforceRetention(
    retention: number,
    backupPath: string,
  ): Promise<void> {
    // Ordered by when the archive appeared in this directory (mtime), not by
    // the manifest timestamp: an admin who uploads an old archive to restore
    // later must not have it deleted by the next scheduled backup. Files
    // without a valid manifest are never touched.
    const filenames = await fs.readdir(backupPath);
    const archives: { filename: string; mtimeMs: number }[] = [];
    for (const filename of filenames) {
      if (!filename.endsWith(BACKUP_EXTENSION)) continue;
      const fullPath = path.join(backupPath, filename);
      try {
        const stats = await fs.stat(fullPath);
        await this.readManifestCached(fullPath, stats);
        archives.push({ filename, mtimeMs: stats.mtimeMs });
      } catch {
        continue;
      }
    }

    archives.sort((a, b) => b.mtimeMs - a.mtimeMs);
    for (const archive of archives.slice(retention)) {
      await fs.unlink(path.join(backupPath, archive.filename));
      this.logger.log(`Removed expired backup ${archive.filename}`);
    }
  }

  private async findBackup(id: string): Promise<{
    fullPath: string;
    filename: string;
  }> {
    const backups = await this.listBackups();
    const backup = backups.find((entry) => entry.id === id);
    if (!backup) throw new NotFoundException('Backup not found');
    return {
      fullPath: path.join(await this.getBackupPath(), backup.filename),
      filename: backup.filename,
    };
  }

  /**
   * Keeps credentials out of the process list: the password is stripped from
   * the URL passed as an argument and handed to libpq via PGPASSWORD instead.
   * Socket-style URLs (the bundled database) are not WHATWG-parseable but
   * carry no password, so they pass through unchanged.
   */
  private databaseConnection(): { url: string; env: NodeJS.ProcessEnv } {
    const raw = this.configService.getOrThrow<string>('DATABASE_URL');
    try {
      const url = new URL(raw);
      if (!url.password) return { url: raw, env: process.env };
      const password = decodeURIComponent(url.password);
      url.password = '';
      return {
        url: url.toString(),
        env: { ...process.env, PGPASSWORD: password },
      };
    } catch {
      return { url: raw, env: process.env };
    }
  }

  private async runPostgresCommand(
    command: 'pg_dump' | 'pg_restore' | 'psql',
    args: string[],
  ): Promise<void> {
    const connection = this.databaseConnection();
    const argv = args.map((arg) =>
      arg === DATABASE_URL_ARG ? connection.url : arg,
    );
    // Restore-side commands take ACCESS EXCLUSIVE locks; fail fast when the
    // app's own traffic holds them instead of stalling restoring=true for the
    // full command timeout.
    const env =
      command === 'pg_dump'
        ? connection.env
        : {
            ...connection.env,
            PGOPTIONS:
              `${connection.env.PGOPTIONS ?? ''} -c lock_timeout=30s`.trim(),
          };
    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, argv, {
        env,
        stdio: ['ignore', 'ignore', 'pipe'],
        timeout: POSTGRES_COMMAND_TIMEOUT_MS,
        killSignal: 'SIGKILL',
      });
      let stderr = '';
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => {
        stderr = `${stderr}${chunk}`.slice(-8192);
      });
      child.on('error', (error) => reject(error));
      child.on('close', (code, signal) => {
        if (code === 0) {
          resolve();
        } else if (signal) {
          reject(
            new Error(
              `${command} was killed with ${signal} (timeout ${POSTGRES_COMMAND_TIMEOUT_MS / 60000} minutes): ${stderr}`,
            ),
          );
        } else {
          reject(new Error(`${command} exited with code ${code}: ${stderr}`));
        }
      });
    });
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
