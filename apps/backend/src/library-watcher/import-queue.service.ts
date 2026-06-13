// apps/backend/src/library-watcher/import-queue.service.ts
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { MediaDetectorService } from './media-detector.service';
import { MediaImporterService } from './media-importer.service';
import { isAudioFile } from './utils/audio-file.utils';
import { isComicFile } from './media-detector.service';
import { WsEventsService } from '../events/ws-events.service';
import { LibraryType } from './file-watcher.service';

const EBOOK_EXTENSIONS = ['.epub'];

function isEbookFile(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  return EBOOK_EXTENSIONS.includes(ext);
}

interface PendingImport {
  path: string;
  libraryPath: string;
  libraryType: LibraryType;
  firstSeen: Date;
  lastActivity: Date;
  files: Set<string>;
  status: 'collecting' | 'stable' | 'processing';
}

@Injectable()
export class ImportQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(ImportQueueService.name);
  private pendingImports = new Map<string, PendingImport>();
  private checkInterval: NodeJS.Timeout | null = null;

  private readonly STABILITY_THRESHOLD_MS = 3000;
  private readonly MAX_WAIT_MS = 60000;
  private readonly FILE_STABLE_CHECK_MS = 500;

  constructor(
    private mediaDetector: MediaDetectorService,
    private mediaImporter: MediaImporterService,
    private wsEvents: WsEventsService,
  ) {
    this.startProcessing();
  }

  onModuleDestroy() {
    this.stopProcessing();
  }

  private startProcessing(): void {
    if (this.checkInterval) return;
    this.checkInterval = setInterval(() => this.processStableImports(), 1000);
  }

  private stopProcessing(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  queueFile(
    filePath: string,
    libraryPath: string,
    libraryType: LibraryType,
  ): void {
    // Filter by supported file type for this library
    if (libraryType === 'audiobook' && !isAudioFile(filePath)) {
      return;
    }
    if (libraryType === 'ebook' && !isEbookFile(filePath)) {
      return;
    }
    if (libraryType === 'comic' && !isComicFile(filePath)) {
      return;
    }

    const rootPath = this.determineRootPath(filePath, libraryPath, libraryType);
    this.addToPending(rootPath, filePath, libraryPath, libraryType);
  }

  queueDirectory(
    dirPath: string,
    libraryPath: string,
    libraryType: LibraryType,
  ): void {
    this.addToPending(dirPath, dirPath, libraryPath, libraryType);
  }

  private addToPending(
    rootPath: string,
    filePath: string,
    libraryPath: string,
    libraryType: LibraryType,
  ): void {
    const existing = this.pendingImports.get(rootPath);

    if (existing && existing.status === 'collecting') {
      existing.lastActivity = new Date();
      existing.files.add(filePath);
      this.logger.debug(
        `Updated pending ${libraryType} import: ${rootPath} (${existing.files.size} files)`,
      );
      this.emitImportStatus();
    } else if (!existing) {
      this.pendingImports.set(rootPath, {
        path: rootPath,
        libraryPath,
        libraryType,
        firstSeen: new Date(),
        lastActivity: new Date(),
        files: new Set([filePath]),
        status: 'collecting',
      });
      this.logger.debug(`New pending ${libraryType} import: ${rootPath}`);
      this.emitImportStatus();
    }
  }

  private determineRootPath(
    filePath: string,
    libraryPath: string,
    libraryType: LibraryType,
  ): string {
    if (libraryType === 'comic') {
      const parentDir = path.dirname(filePath);
      if (parentDir === libraryPath) {
        return filePath; // Root one-shot
      }
      return parentDir; // Series folder
    }

    if (libraryType === 'ebook') {
      // Ebooks are single files, so the file itself is the root
      return filePath;
    }

    // Audiobooks: group by parent directory for multi-file audiobooks
    const parentDir = path.dirname(filePath);
    if (parentDir === libraryPath) {
      return filePath; // Single file audiobook in library root
    }
    return parentDir; // Multi-file audiobook in subdirectory
  }

  private async processStableImports(): Promise<void> {
    const now = Date.now();

    for (const [, pending] of this.pendingImports) {
      if (pending.status !== 'collecting') continue;

      const timeSinceLastActivity = now - pending.lastActivity.getTime();
      const totalWaitTime = now - pending.firstSeen.getTime();

      if (
        timeSinceLastActivity >= this.STABILITY_THRESHOLD_MS ||
        totalWaitTime >= this.MAX_WAIT_MS
      ) {
        await this.processImport(pending);
      }
    }
  }

  private async processImport(pending: PendingImport): Promise<void> {
    pending.status = 'processing';
    this.emitImportStatus();
    this.logger.log(
      `Processing ${pending.libraryType} import: ${pending.path}`,
    );

    try {
      const allStable = await this.verifyFilesStable(
        pending.files,
        pending.libraryType,
      );
      if (!allStable) {
        this.logger.debug(`Files not stable yet, re-queuing: ${pending.path}`);
        pending.status = 'collecting';
        pending.lastActivity = new Date();
        return;
      }

      if (pending.libraryType === 'audiobook') {
        await this.processAudiobookImport(pending);
      } else if (pending.libraryType === 'ebook') {
        await this.processEbookImport(pending);
      } else {
        await this.processComicImport(pending);
      }
    } catch (error) {
      this.logger.error(
        `Failed to process ${pending.libraryType} import ${pending.path}: ${error}`,
      );
    } finally {
      this.pendingImports.delete(pending.path);
      this.emitImportStatus();
    }
  }

  private async processAudiobookImport(pending: PendingImport): Promise<void> {
    const unit = await this.mediaDetector.detectAudiobook(pending.path);

    if (unit) {
      await this.mediaImporter.importAudiobook(unit, pending.libraryPath);
    } else {
      // Check if individual files in the root should be separate audiobooks
      for (const filePath of pending.files) {
        if (isAudioFile(filePath)) {
          const fileUnit = await this.mediaDetector.detectAudiobook(filePath);
          if (fileUnit) {
            await this.mediaImporter.importAudiobook(
              fileUnit,
              pending.libraryPath,
            );
          }
        }
      }
    }
  }

  private async processEbookImport(pending: PendingImport): Promise<void> {
    const unit = await this.mediaDetector.detectEbook(pending.path);

    if (unit) {
      await this.mediaImporter.importEbook(unit, pending.libraryPath);
    }
  }

  private async processComicImport(pending: PendingImport): Promise<void> {
    const unit = await this.mediaDetector.detectComicSeriesForPath(
      pending.path,
      pending.libraryPath,
    );

    if (unit) {
      await this.mediaImporter.importComicSeriesUnit(
        unit,
        pending.libraryPath,
      );
    }
  }

  private async verifyFilesStable(
    files: Set<string>,
    libraryType: LibraryType,
  ): Promise<boolean> {
    for (const file of files) {
      const isRelevantFile =
        libraryType === 'audiobook'
          ? isAudioFile(file)
          : libraryType === 'ebook'
            ? isEbookFile(file)
            : isComicFile(file);
      if (isRelevantFile && !(await this.isFileStable(file))) {
        return false;
      }
    }
    return true;
  }

  private async isFileStable(filePath: string): Promise<boolean> {
    try {
      const stat1 = await fs.stat(filePath);
      await new Promise((resolve) =>
        setTimeout(resolve, this.FILE_STABLE_CHECK_MS),
      );
      const stat2 = await fs.stat(filePath);
      return stat1.size === stat2.size && stat1.mtimeMs === stat2.mtimeMs;
    } catch {
      return false;
    }
  }

  getPendingCount(): number {
    return this.pendingImports.size;
  }

  getPendingNames(): string[] {
    return Array.from(this.pendingImports.keys()).map((fullPath) => {
      return path.basename(fullPath);
    });
  }

  getAudiobookPendingCount(): number {
    return Array.from(this.pendingImports.values()).filter(
      (p) => p.libraryType === 'audiobook',
    ).length;
  }

  getAudiobookPendingNames(): string[] {
    return Array.from(this.pendingImports.entries())
      .filter(([, p]) => p.libraryType === 'audiobook')
      .map(([fullPath]) => path.basename(fullPath));
  }

  getEbookPendingCount(): number {
    return Array.from(this.pendingImports.values()).filter(
      (p) => p.libraryType === 'ebook',
    ).length;
  }

  getEbookPendingNames(): string[] {
    return Array.from(this.pendingImports.entries())
      .filter(([, p]) => p.libraryType === 'ebook')
      .map(([fullPath]) => path.basename(fullPath));
  }

  getComicPendingCount(): number {
    return Array.from(this.pendingImports.values()).filter(
      (p) => p.libraryType === 'comic',
    ).length;
  }

  getComicPendingNames(): string[] {
    return Array.from(this.pendingImports.entries())
      .filter(([, p]) => p.libraryType === 'comic')
      .map(([fullPath]) => path.basename(fullPath));
  }

  private emitImportStatus(): void {
    this.wsEvents.importStatusUpdated({
      audiobooks: {
        pendingCount: this.getAudiobookPendingCount(),
        pendingNames: this.getAudiobookPendingNames(),
      },
      ebooks: {
        pendingCount: this.getEbookPendingCount(),
        pendingNames: this.getEbookPendingNames(),
      },
      comics: {
        pendingCount: this.getComicPendingCount(),
        pendingNames: this.getComicPendingNames(),
      },
    });
  }
}
