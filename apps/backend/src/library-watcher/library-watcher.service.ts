// apps/backend/src/library-watcher/library-watcher.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { AppEventsService } from '../events/app-events.service';
import { FileWatcherService } from './file-watcher.service';
import { LibraryScannerService, ScanResult, ScanProgress } from './library-scanner.service';
import {
  EbookLibraryScannerService,
  EbookScanResult,
  EbookScanProgress,
} from './ebook-library-scanner.service';

@Injectable()
export class LibraryWatcherService implements OnModuleInit {
  private readonly logger = new Logger(LibraryWatcherService.name);
  private currentAudiobookPath: string | null = null;
  private currentEbookPath: string | null = null;

  constructor(
    private appSettingsService: AppSettingsService,
    private appEvents: AppEventsService,
    private fileWatcher: FileWatcherService,
    private libraryScanner: LibraryScannerService,
    private ebookLibraryScanner: EbookLibraryScannerService,
  ) {}

  async onModuleInit() {
    await this.initialize();

    // Subscribe to settings changes to react to library path updates
    this.appEvents.subscribe(async (event) => {
      if (event.type === 'settings.updated') {
        await this.handleSettingsUpdate();
      }
    });
  }

  private async initialize(): Promise<void> {
    const settings = await this.appSettingsService.getSettings();
    this.currentAudiobookPath = settings.audiobookLibraryPath;
    this.currentEbookPath = settings.ebookLibraryPath;

    // Initialize audiobook library
    if (settings.audiobookLibraryPath) {
      this.logger.log(`Initializing audiobook library watcher for: ${settings.audiobookLibraryPath}`);
      await this.runAudiobookScan(settings.audiobookLibraryPath);

      if (settings.watcherEnabled) {
        await this.fileWatcher.startWatching(settings.audiobookLibraryPath);
      }
    } else {
      this.logger.log('No audiobook library path configured');
    }

    // Initialize ebook library
    if (settings.ebookLibraryPath) {
      this.logger.log(`Initializing ebook library for: ${settings.ebookLibraryPath}`);
      await this.runEbookScan(settings.ebookLibraryPath);
    } else {
      this.logger.log('No ebook library path configured');
    }
  }

  private async handleSettingsUpdate(): Promise<void> {
    const settings = await this.appSettingsService.getSettings();

    // Handle audiobook library path change
    if (settings.audiobookLibraryPath !== this.currentAudiobookPath) {
      this.logger.log(
        `Audiobook library path changed: ${this.currentAudiobookPath} -> ${settings.audiobookLibraryPath}`,
      );
      this.currentAudiobookPath = settings.audiobookLibraryPath;
      await this.onAudiobookLibraryPathChange(settings.audiobookLibraryPath);
    }

    // Handle ebook library path change
    if (settings.ebookLibraryPath !== this.currentEbookPath) {
      this.logger.log(
        `Ebook library path changed: ${this.currentEbookPath} -> ${settings.ebookLibraryPath}`,
      );
      this.currentEbookPath = settings.ebookLibraryPath;
      await this.onEbookLibraryPathChange(settings.ebookLibraryPath);
    }
  }

  async onAudiobookLibraryPathChange(newPath: string | null): Promise<ScanResult | null> {
    await this.fileWatcher.stopWatching();

    if (!newPath) {
      this.logger.log('Audiobook library path cleared, watcher stopped');
      return null;
    }

    const settings = await this.appSettingsService.getSettings();

    if (!settings.watcherEnabled) {
      this.logger.log('Watcher disabled, not starting after path change');
      return null;
    }

    this.logger.log(`Audiobook library path changed to: ${newPath}`);

    // Run reconciliation on new path
    const result = await this.runAudiobookScan(newPath);

    // Start watching new path
    await this.fileWatcher.startWatching(newPath);

    return result;
  }

  async onEbookLibraryPathChange(newPath: string | null): Promise<EbookScanResult | null> {
    if (!newPath) {
      this.logger.log('Ebook library path cleared');
      return null;
    }

    this.logger.log(`Ebook library path changed to: ${newPath}`);

    // Run reconciliation scan on new path
    return this.runEbookScan(newPath);
  }

  async setWatcherEnabled(enabled: boolean): Promise<void> {
    if (enabled) {
      const audiobookLibraryPath = await this.appSettingsService.getAudiobookLibraryPath();
      if (audiobookLibraryPath && !this.fileWatcher.isWatching()) {
        await this.fileWatcher.startWatching(audiobookLibraryPath);
        this.logger.log('Watcher enabled and started');
      }
    } else {
      await this.fileWatcher.stopWatching();
      this.logger.log('Watcher disabled and stopped');
    }
  }

  async runAudiobookScan(audiobookLibraryPath?: string): Promise<ScanResult> {
    const path = audiobookLibraryPath || (await this.appSettingsService.getAudiobookLibraryPath());

    if (!path) {
      throw new Error('No audiobook library path configured');
    }

    return this.libraryScanner.runReconciliationScan(path);
  }

  async runEbookScan(ebookLibraryPath?: string): Promise<EbookScanResult> {
    const path = ebookLibraryPath || (await this.appSettingsService.getEbookLibraryPath());

    if (!path) {
      throw new Error('No ebook library path configured');
    }

    return this.ebookLibraryScanner.runReconciliationScan(path);
  }

  async manualScan(): Promise<ScanResult> {
    return this.runAudiobookScan();
  }

  async manualEbookScan(): Promise<EbookScanResult> {
    return this.runEbookScan();
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
