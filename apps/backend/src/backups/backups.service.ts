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
import { pipeline } from 'stream/promises';
import * as unzipper from 'unzipper';
import { AppDataService } from '../app-data/app-data.service';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { UpdateBackupConfigDto } from './dto/update-backup-config.dto';

const BACKUP_EXTENSION = '.bookmark';
const BACKUP_FORMAT_VERSION = 1;
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 100_000;
const MAX_UNCOMPRESSED_BYTES = 20 * 1024 * 1024 * 1024;

const MANAGED_DIRECTORIES = [
  'audiobook-covers',
  'ebook-covers',
  'comic-series-covers',
  'comic-book-covers',
  'people-images',
] as const;

interface BackupManifest {
  formatVersion: number;
  application: 'bookmark';
  appVersion: string;
  createdAt: string;
  contents: string[];
}

export interface BackupEntry {
  id: string;
  filename: string;
  createdAt: string;
  size: number;
  appVersion: string;
}

export interface BackupConfig {
  enabled: boolean;
  path: string;
  pathLocked: boolean;
  schedule: string;
  retention: number;
  timezone: string;
  nextBackupAt: string | null;
  isRunning: boolean;
}

@Injectable()
export class BackupsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackupsService.name);
  private scheduledJob: CronJob | null = null;
  private running = false;
  private restoring = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly appData: AppDataService,
    private readonly appSettings: AppSettingsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureBackupDirectory();
    try {
      await this.refreshSchedule();
    } catch (error) {
      this.logger.error(
        `Could not start the backup schedule: ${this.errorMessage(error)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.stopScheduledJob();
  }

  async getConfig(): Promise<BackupConfig> {
    const settings = await this.appSettings.getSettings();
    return {
      enabled: settings.backupEnabled,
      path: this.resolveBackupPath(settings.backupPath),
      pathLocked: Boolean(this.configService.get<string>('BACKUP_PATH')),
      schedule: settings.backupSchedule,
      retention: settings.backupsToKeep,
      timezone: this.timezone,
      nextBackupAt:
        settings.backupEnabled && this.scheduledJob
          ? this.scheduledJob.nextDate().toUTC().toISO()
          : null,
      isRunning: this.running || this.restoring,
    };
  }

  async updateConfig(dto: UpdateBackupConfigDto): Promise<BackupConfig> {
    if (this.running || this.restoring) {
      throw new ConflictException('A backup operation is already running');
    }
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

  async listBackups(): Promise<BackupEntry[]> {
    const backupPath = await this.getBackupPath();
    await fs.mkdir(backupPath, { recursive: true });
    const filenames = await fs.readdir(backupPath);
    const backups: BackupEntry[] = [];

    for (const filename of filenames) {
      if (!filename.endsWith(BACKUP_EXTENSION)) continue;
      const fullPath = path.join(backupPath, filename);
      try {
        const [manifest, stats] = await Promise.all([
          this.readManifest(fullPath),
          fs.stat(fullPath),
        ]);
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

  async createBackup(): Promise<BackupEntry> {
    if (this.running || this.restoring) {
      throw new ConflictException('A backup operation is already running');
    }

    this.running = true;
    const workPath = path.join(
      this.appData.getTempPath(),
      `backup-${randomUUID()}`,
    );
    let partialPath: string | null = null;

    try {
      const settings = await this.appSettings.getSettings();
      const backupPath = this.resolveBackupPath(settings.backupPath);
      await fs.mkdir(backupPath, { recursive: true });
      await this.assertBackupPathIsSafe(backupPath);
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
        this.databaseUrl,
      ]);

      const manifest: BackupManifest = {
        formatVersion: BACKUP_FORMAT_VERSION,
        application: 'bookmark',
        appVersion: this.configService.get<string>('APP_VERSION', 'unknown'),
        createdAt: createdAt.toISOString(),
        contents: [
          'database.dump',
          ...MANAGED_DIRECTORIES.map((directory) => `data/${directory}`),
        ],
      };

      await this.writeArchive(partialPath, databasePath, manifest);
      await fs.rename(partialPath, finalPath);
      partialPath = null;
      await this.enforceRetention(settings.backupsToKeep);

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

  async importBackup(uploadPath: string): Promise<BackupEntry> {
    if (this.running || this.restoring) {
      throw new ConflictException('A backup operation is already running');
    }

    this.running = true;
    let partialPath: string | null = null;
    try {
      const [manifest, directory] = await Promise.all([
        this.readManifest(uploadPath),
        unzipper.Open.file(uploadPath),
      ]);
      this.validateArchiveDirectory(directory);

      const createdAt = new Date(manifest.createdAt);
      if (Number.isNaN(createdAt.getTime())) {
        throw new BadRequestException('Backup has an invalid creation date');
      }

      const settings = await this.appSettings.getSettings();
      const backupPath = this.resolveBackupPath(settings.backupPath);
      await fs.mkdir(backupPath, { recursive: true });
      await this.assertBackupPathIsSafe(backupPath);

      const baseId = `bookmark-${createdAt.toISOString().replace(/[-:.]/g, '')}`;
      let id = baseId;
      let finalPath = path.join(backupPath, `${id}${BACKUP_EXTENSION}`);
      try {
        await fs.access(finalPath);
        id = `${baseId}-${randomUUID().slice(0, 8)}`;
        finalPath = path.join(backupPath, `${id}${BACKUP_EXTENSION}`);
      } catch {
        // The preferred filename is available.
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
    if (this.running || this.restoring) {
      throw new ConflictException('A backup operation is already running');
    }
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
    if (this.running || this.restoring) {
      throw new ConflictException('A backup operation is already running');
    }

    this.restoring = true;
    const stagePath = path.join(
      this.appData.getTempPath(),
      `restore-${randomUUID()}`,
    );

    try {
      const backup = await this.findBackup(id);
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
        this.databaseUrl,
      ]);
      await this.restoreDatabase(databasePath);

      try {
        await this.replaceManagedData(stagePath);
      } catch (error) {
        this.logger.error(
          `Managed data restore failed; rolling the database back: ${this.errorMessage(error)}`,
        );
        await this.restoreDatabase(rollbackDatabasePath);
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
  }

  private async stopScheduledJob(): Promise<void> {
    if (this.scheduledJob) {
      await this.scheduledJob.stop();
      this.scheduledJob = null;
    }
  }

  private async ensureBackupDirectory(): Promise<void> {
    const settings = await this.appSettings.getSettings();
    await fs.mkdir(this.resolveBackupPath(settings.backupPath), {
      recursive: true,
    });
  }

  private async getBackupPath(): Promise<string> {
    const settings = await this.appSettings.getSettings();
    return this.resolveBackupPath(settings.backupPath);
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

  private get databaseUrl(): string {
    return this.configService.getOrThrow<string>('DATABASE_URL');
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
      await fs.mkdir(directory, { recursive: true });
      await fs.access(directory, fs.constants.R_OK | fs.constants.W_OK);
      await this.assertBackupPathIsSafe(directory);
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
      const archive = archiver('zip', { zlib: { level: 9 } });
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

      for (const directory of MANAGED_DIRECTORIES) {
        archive.directory(
          path.join(this.appData.getBasePath(), directory),
          `data/${directory}`,
        );
      }

      if (includeAuthSecret) {
        archive.file(authSecretPath, { name: 'data/.better-auth-secret' });
      }
      void archive.finalize();
    });
  }

  private async readManifest(archivePath: string): Promise<BackupManifest> {
    const directory = await unzipper.Open.file(archivePath);
    const manifestEntry = directory.files.find(
      (entry) => entry.path === 'manifest.json',
    );
    if (!manifestEntry || manifestEntry.uncompressedSize > MAX_MANIFEST_BYTES) {
      throw new Error('Backup manifest is missing or invalid');
    }

    const manifest = JSON.parse(
      (await manifestEntry.buffer()).toString('utf8'),
    ) as BackupManifest;
    if (
      manifest.application !== 'bookmark' ||
      manifest.formatVersion !== BACKUP_FORMAT_VERSION ||
      !manifest.createdAt ||
      !manifest.appVersion
    ) {
      throw new Error('Unsupported Bookmark backup format');
    }
    return manifest;
  }

  private async extractArchive(
    archivePath: string,
    destination: string,
  ): Promise<void> {
    const directory = await unzipper.Open.file(archivePath);
    const manifest = await this.readManifest(archivePath);
    if (manifest.application !== 'bookmark') {
      throw new BadRequestException('Invalid Bookmark backup');
    }
    this.validateArchiveDirectory(directory);

    for (const entry of directory.files) {
      const normalized = path.posix.normalize(entry.path);
      const outputPath = path.join(destination, ...normalized.split('/'));
      if (entry.type === 'Directory') {
        await fs.mkdir(outputPath, { recursive: true });
        continue;
      }
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await pipeline(
        entry.stream(),
        createWriteStream(outputPath, { flags: 'wx' }),
      );
    }
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
      const normalized = path.posix.normalize(entry.path);
      const allowedDataPath =
        normalized === 'data' ||
        normalized === 'data/.better-auth-secret' ||
        MANAGED_DIRECTORIES.some(
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
      for (const directory of MANAGED_DIRECTORIES) {
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
        await fs.rename(staged, current);
        replaced.push(directory);
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

  private async restoreDatabase(databasePath: string): Promise<void> {
    await this.runPostgresCommand('pg_restore', [
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-privileges',
      '--single-transaction',
      '--exit-on-error',
      '--dbname',
      this.databaseUrl,
      databasePath,
    ]);
  }

  private async assertBackupPathIsSafe(backupPath: string): Promise<void> {
    const resolvedBackupPath = await fs.realpath(backupPath);
    for (const directory of MANAGED_DIRECTORIES) {
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

  private async enforceRetention(retention: number): Promise<void> {
    const backups = await this.listBackups();
    for (const backup of backups.slice(retention)) {
      const backupPath = await this.getBackupPath();
      await fs.unlink(path.join(backupPath, backup.filename));
      this.logger.log(`Removed expired backup ${backup.filename}`);
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

  private async runPostgresCommand(
    command: 'pg_dump' | 'pg_restore',
    args: string[],
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, {
        env: process.env,
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      let stderr = '';
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => {
        stderr = `${stderr}${chunk}`.slice(-8192);
      });
      child.on('error', (error) => reject(error));
      child.on('close', (code) => {
        if (code === 0) resolve();
        else
          reject(new Error(`${command} exited with code ${code}: ${stderr}`));
      });
    });
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
