// apps/backend/src/library-watcher/library-watcher.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { FileWatcherService } from './file-watcher.service';
import { LibraryScannerService, ScanResult, ScanProgress } from './library-scanner.service';

@Injectable()
export class LibraryWatcherService implements OnModuleInit {
  private readonly logger = new Logger(LibraryWatcherService.name);

  constructor(
    private appSettingsService: AppSettingsService,
    private fileWatcher: FileWatcherService,
    private libraryScanner: LibraryScannerService,
  ) {}

  async onModuleInit() {
    await this.initialize();
  }

  private async initialize(): Promise<void> {
    const settings = await this.appSettingsService.getSettings();

    if (!settings.libraryPath) {
      this.logger.log('No library path configured, watcher not started');
      return;
    }

    if (!settings.watcherEnabled) {
      this.logger.log('Watcher disabled in settings');
      return;
    }

    this.logger.log(`Initializing library watcher for: ${settings.libraryPath}`);

    // Run initial reconciliation scan
    await this.runScan(settings.libraryPath);

    // Start real-time watching
    await this.fileWatcher.startWatching(settings.libraryPath);
  }

  async onLibraryPathChange(newPath: string | null): Promise<ScanResult | null> {
    await this.fileWatcher.stopWatching();

    if (!newPath) {
      this.logger.log('Library path cleared, watcher stopped');
      return null;
    }

    const settings = await this.appSettingsService.getSettings();

    if (!settings.watcherEnabled) {
      this.logger.log('Watcher disabled, not starting after path change');
      return null;
    }

    this.logger.log(`Library path changed to: ${newPath}`);

    // Run reconciliation on new path
    const result = await this.runScan(newPath);

    // Start watching new path
    await this.fileWatcher.startWatching(newPath);

    return result;
  }

  async setWatcherEnabled(enabled: boolean): Promise<void> {
    if (enabled) {
      const libraryPath = await this.appSettingsService.getLibraryPath();
      if (libraryPath && !this.fileWatcher.isWatching()) {
        await this.fileWatcher.startWatching(libraryPath);
        this.logger.log('Watcher enabled and started');
      }
    } else {
      await this.fileWatcher.stopWatching();
      this.logger.log('Watcher disabled and stopped');
    }
  }

  async runScan(libraryPath?: string): Promise<ScanResult> {
    const path = libraryPath || (await this.appSettingsService.getLibraryPath());

    if (!path) {
      throw new Error('No library path configured');
    }

    return this.libraryScanner.runReconciliationScan(path);
  }

  async manualScan(): Promise<ScanResult> {
    return this.runScan();
  }

  getStatus(): {
    watching: boolean;
    path: string | null;
    scanning: boolean;
    progress: ScanProgress | null;
  } {
    return {
      watching: this.fileWatcher.isWatching(),
      path: this.fileWatcher.getCurrentPath(),
      scanning: this.libraryScanner.isScanning(),
      progress: this.libraryScanner.getProgress(),
    };
  }

  onScanProgress(callback: (progress: ScanProgress) => void): () => void {
    return this.libraryScanner.onProgress(callback);
  }
}
