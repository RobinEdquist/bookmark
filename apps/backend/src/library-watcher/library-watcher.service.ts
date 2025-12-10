// apps/backend/src/library-watcher/library-watcher.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { AppEventsService } from '../events/app-events.service';
import { FileWatcherService } from './file-watcher.service';
import {
  LibraryScannerService,
  ScanResult,
  ScanProgress,
} from './library-scanner.service';

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
      this.logger.log(
        `Initializing audiobook library watcher for: ${settings.audiobookLibraryPath}`,
      );
      await this.runAudiobookScan(settings.audiobookLibraryPath);

      if (settings.watcherEnabled) {
        await this.fileWatcher.startWatchingAudiobooks(
          settings.audiobookLibraryPath,
        );
      }
    } else {
      this.logger.log('No audiobook library path configured');
    }

    // Initialize ebook library
    if (settings.ebookLibraryPath) {
      this.logger.log(
        `Initializing ebook library watcher for: ${settings.ebookLibraryPath}`,
      );
      await this.runEbookScan(settings.ebookLibraryPath);

      if (settings.watcherEnabled) {
        await this.fileWatcher.startWatchingEbooks(settings.ebookLibraryPath);
      }
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

    // Handle watcher enabled/disabled
    await this.syncWatcherState(settings.watcherEnabled);
  }

  private async syncWatcherState(watcherEnabled: boolean): Promise<void> {
    if (watcherEnabled) {
      // Start watchers for configured paths if not already watching
      if (
        this.currentAudiobookPath &&
        !this.fileWatcher.isWatchingAudiobooks()
      ) {
        await this.fileWatcher.startWatchingAudiobooks(
          this.currentAudiobookPath,
        );
      }
      if (this.currentEbookPath && !this.fileWatcher.isWatchingEbooks()) {
        await this.fileWatcher.startWatchingEbooks(this.currentEbookPath);
      }
    } else {
      // Stop all watchers
      await this.fileWatcher.stopWatching();
    }
  }

  async onAudiobookLibraryPathChange(
    newPath: string | null,
  ): Promise<ScanResult | null> {
    await this.fileWatcher.stopAudiobookWatcher();

    if (!newPath) {
      this.logger.log('Audiobook library path cleared, watcher stopped');
      return null;
    }

    const settings = await this.appSettingsService.getSettings();

    this.logger.log(`Audiobook library path changed to: ${newPath}`);

    // Run reconciliation on new path
    const result = await this.runAudiobookScan(newPath);

    // Start watching new path if watcher is enabled
    if (settings.watcherEnabled) {
      await this.fileWatcher.startWatchingAudiobooks(newPath);
    }

    return result;
  }

  async onEbookLibraryPathChange(
    newPath: string | null,
  ): Promise<ScanResult | null> {
    await this.fileWatcher.stopEbookWatcher();

    if (!newPath) {
      this.logger.log('Ebook library path cleared, watcher stopped');
      return null;
    }

    const settings = await this.appSettingsService.getSettings();

    this.logger.log(`Ebook library path changed to: ${newPath}`);

    // Run reconciliation scan on new path
    const result = await this.runEbookScan(newPath);

    // Start watching new path if watcher is enabled
    if (settings.watcherEnabled) {
      await this.fileWatcher.startWatchingEbooks(newPath);
    }

    return result;
  }

  async setWatcherEnabled(enabled: boolean): Promise<void> {
    await this.syncWatcherState(enabled);
    this.logger.log(`Watcher ${enabled ? 'enabled' : 'disabled'}`);
  }

  async runAudiobookScan(audiobookLibraryPath?: string): Promise<ScanResult> {
    const scanPath =
      audiobookLibraryPath ||
      (await this.appSettingsService.getAudiobookLibraryPath());

    if (!scanPath) {
      throw new Error('No audiobook library path configured');
    }

    return this.libraryScanner.scanAudiobookLibrary(scanPath);
  }

  async runEbookScan(ebookLibraryPath?: string): Promise<ScanResult> {
    const scanPath =
      ebookLibraryPath || (await this.appSettingsService.getEbookLibraryPath());

    if (!scanPath) {
      throw new Error('No ebook library path configured');
    }

    return this.libraryScanner.scanEbookLibrary(scanPath);
  }

  async manualScan(): Promise<ScanResult> {
    return this.runAudiobookScan();
  }

  async manualEbookScan(): Promise<ScanResult> {
    return this.runEbookScan();
  }

  getStatus(): {
    watching: {
      audiobooks: boolean;
      ebooks: boolean;
    };
    paths: {
      audiobooks: string | null;
      ebooks: string | null;
    };
    scanning: boolean;
    progress: ScanProgress | null;
  } {
    return {
      watching: {
        audiobooks: this.fileWatcher.isWatchingAudiobooks(),
        ebooks: this.fileWatcher.isWatchingEbooks(),
      },
      paths: {
        audiobooks: this.fileWatcher.getCurrentAudiobookPath(),
        ebooks: this.fileWatcher.getCurrentEbookPath(),
      },
      scanning: this.libraryScanner.isScanning(),
      progress: this.libraryScanner.getProgress(),
    };
  }

  onScanProgress(callback: (progress: ScanProgress) => void): () => void {
    return this.libraryScanner.onProgress(callback);
  }
}
