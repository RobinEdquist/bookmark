// apps/backend/src/library-watcher/file-watcher.service.ts
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as chokidar from 'chokidar';
import { ImportQueueService } from './import-queue.service';
import { LibraryScannerService } from './library-scanner.service';

export type LibraryType = 'audiobook' | 'ebook';

export interface LibraryPaths {
  audiobookPath: string | null;
  ebookPath: string | null;
}

@Injectable()
export class FileWatcherService implements OnModuleDestroy {
  private readonly logger = new Logger(FileWatcherService.name);
  private audiobookWatcher: chokidar.FSWatcher | null = null;
  private ebookWatcher: chokidar.FSWatcher | null = null;
  private currentAudiobookPath: string | null = null;
  private currentEbookPath: string | null = null;

  constructor(
    private importQueue: ImportQueueService,
    private libraryScanner: LibraryScannerService,
  ) {}

  async onModuleDestroy() {
    await this.stopWatching();
  }

  async startWatching(paths: LibraryPaths): Promise<void> {
    // Handle audiobook library
    if (
      paths.audiobookPath &&
      paths.audiobookPath !== this.currentAudiobookPath
    ) {
      await this.stopAudiobookWatcher();
      this.currentAudiobookPath = paths.audiobookPath;
      this.audiobookWatcher = this.createWatcher(
        paths.audiobookPath,
        'audiobook',
      );
      this.logger.log(
        `Started watching audiobook library: ${paths.audiobookPath}`,
      );
    } else if (!paths.audiobookPath && this.audiobookWatcher) {
      await this.stopAudiobookWatcher();
    }

    // Handle ebook library
    if (paths.ebookPath && paths.ebookPath !== this.currentEbookPath) {
      await this.stopEbookWatcher();
      this.currentEbookPath = paths.ebookPath;
      this.ebookWatcher = this.createWatcher(paths.ebookPath, 'ebook');
      this.logger.log(`Started watching ebook library: ${paths.ebookPath}`);
    } else if (!paths.ebookPath && this.ebookWatcher) {
      await this.stopEbookWatcher();
    }
  }

  async startWatchingAudiobooks(libraryPath: string): Promise<void> {
    await this.startWatching({
      audiobookPath: libraryPath,
      ebookPath: this.currentEbookPath,
    });
  }

  async startWatchingEbooks(libraryPath: string): Promise<void> {
    await this.startWatching({
      audiobookPath: this.currentAudiobookPath,
      ebookPath: libraryPath,
    });
  }

  private createWatcher(
    libraryPath: string,
    libraryType: LibraryType,
  ): chokidar.FSWatcher {
    const watcher = chokidar.watch(libraryPath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 500,
      },
      depth: 99,
      ignored: [
        /(^|[/\\])\../, // Ignore dotfiles
        /\.DS_Store$/,
        /Thumbs\.db$/,
        /desktop\.ini$/,
      ],
    });

    watcher
      .on('add', (filePath) =>
        this.handleFileAdd(filePath, libraryPath, libraryType),
      )
      .on('addDir', (dirPath) =>
        this.handleDirAdd(dirPath, libraryPath, libraryType),
      )
      .on('unlink', (filePath) =>
        this.handleFileRemove(filePath, libraryPath, libraryType),
      )
      .on('unlinkDir', (dirPath) =>
        this.handleDirRemove(dirPath, libraryPath, libraryType),
      )
      .on('error', (error) => this.handleError(error as Error, libraryType))
      .on('ready', () => this.logger.log(`${libraryType} file watcher ready`));

    return watcher;
  }

  async stopWatching(): Promise<void> {
    await Promise.all([this.stopAudiobookWatcher(), this.stopEbookWatcher()]);
  }

  async stopAudiobookWatcher(): Promise<void> {
    if (this.audiobookWatcher) {
      this.logger.log('Stopping audiobook file watcher');
      await this.audiobookWatcher.close();
      this.audiobookWatcher = null;
      this.currentAudiobookPath = null;
    }
  }

  async stopEbookWatcher(): Promise<void> {
    if (this.ebookWatcher) {
      this.logger.log('Stopping ebook file watcher');
      await this.ebookWatcher.close();
      this.ebookWatcher = null;
      this.currentEbookPath = null;
    }
  }

  isWatching(): boolean {
    return this.audiobookWatcher !== null || this.ebookWatcher !== null;
  }

  isWatchingAudiobooks(): boolean {
    return this.audiobookWatcher !== null;
  }

  isWatchingEbooks(): boolean {
    return this.ebookWatcher !== null;
  }

  getCurrentAudiobookPath(): string | null {
    return this.currentAudiobookPath;
  }

  getCurrentEbookPath(): string | null {
    return this.currentEbookPath;
  }

  private handleFileAdd(
    filePath: string,
    libraryPath: string,
    libraryType: LibraryType,
  ): void {
    this.logger.debug(`[${libraryType}] File added: ${filePath}`);
    this.importQueue.queueFile(filePath, libraryPath, libraryType);
  }

  private handleDirAdd(
    dirPath: string,
    libraryPath: string,
    libraryType: LibraryType,
  ): void {
    this.logger.debug(`[${libraryType}] Directory added: ${dirPath}`);
    this.importQueue.queueDirectory(dirPath, libraryPath, libraryType);
  }

  private handleFileRemove(
    filePath: string,
    libraryPath: string,
    libraryType: LibraryType,
  ): void {
    this.logger.debug(`[${libraryType}] File removed: ${filePath}`);
    this.libraryScanner.handlePathRemoved(filePath, libraryPath, libraryType);
  }

  private handleDirRemove(
    dirPath: string,
    libraryPath: string,
    libraryType: LibraryType,
  ): void {
    this.logger.debug(`[${libraryType}] Directory removed: ${dirPath}`);
    this.libraryScanner.handlePathRemoved(dirPath, libraryPath, libraryType);
  }

  private handleError(error: Error, libraryType: LibraryType): void {
    this.logger.error(`[${libraryType}] File watcher error: ${error.message}`);
  }
}
