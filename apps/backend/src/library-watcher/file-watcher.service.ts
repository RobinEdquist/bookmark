// apps/backend/src/library-watcher/file-watcher.service.ts
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as chokidar from 'chokidar';
import { ImportQueueService } from './import-queue.service';

@Injectable()
export class FileWatcherService implements OnModuleDestroy {
  private readonly logger = new Logger(FileWatcherService.name);
  private watcher: chokidar.FSWatcher | null = null;
  private currentPath: string | null = null;

  constructor(private importQueue: ImportQueueService) {}

  async onModuleDestroy() {
    await this.stopWatching();
  }

  async startWatching(libraryPath: string): Promise<void> {
    if (this.watcher && this.currentPath === libraryPath) {
      this.logger.debug('Already watching this path');
      return;
    }

    await this.stopWatching();

    this.logger.log(`Starting file watcher for: ${libraryPath}`);
    this.currentPath = libraryPath;

    this.watcher = chokidar.watch(libraryPath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 500,
      },
      depth: 99,
      ignored: [
        /(^|[\/\\])\../, // Ignore dotfiles
        /\.DS_Store$/,
        /Thumbs\.db$/,
        /desktop\.ini$/,
      ],
    });

    this.watcher
      .on('add', (filePath) => this.handleFileAdd(filePath))
      .on('addDir', (dirPath) => this.handleDirAdd(dirPath))
      .on('unlink', (filePath) => this.handleFileRemove(filePath))
      .on('unlinkDir', (dirPath) => this.handleDirRemove(dirPath))
      .on('error', (error) => this.handleError(error as Error))
      .on('ready', () => this.logger.log('File watcher ready'));
  }

  async stopWatching(): Promise<void> {
    if (this.watcher) {
      this.logger.log('Stopping file watcher');
      await this.watcher.close();
      this.watcher = null;
      this.currentPath = null;
    }
  }

  isWatching(): boolean {
    return this.watcher !== null;
  }

  getCurrentPath(): string | null {
    return this.currentPath;
  }

  private handleFileAdd(filePath: string): void {
    this.logger.debug(`File added: ${filePath}`);
    this.importQueue.queueFile(filePath, this.currentPath!);
  }

  private handleDirAdd(dirPath: string): void {
    this.logger.debug(`Directory added: ${dirPath}`);
    this.importQueue.queueDirectory(dirPath);
  }

  private handleFileRemove(filePath: string): void {
    this.logger.debug(`File removed: ${filePath}`);
    // File removal handling will be done during reconciliation
    // Real-time removal tracking could be added here if needed
  }

  private handleDirRemove(dirPath: string): void {
    this.logger.debug(`Directory removed: ${dirPath}`);
    // Directory removal handling will be done during reconciliation
  }

  private handleError(error: Error): void {
    this.logger.error(`File watcher error: ${error.message}`);
  }
}
