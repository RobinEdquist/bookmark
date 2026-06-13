// apps/backend/src/library-watcher/library-watcher.service.ts
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { AppEventsService } from '../events/app-events.service';
import { WsEventsService, RescanStatus } from '../events/ws-events.service';
import { FileWatcherService } from './file-watcher.service';
import {
  LibraryScannerService,
  ScanResult,
  ScanProgress,
} from './library-scanner.service';
import { MediaImporterService } from './media-importer.service';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as audiobooksSchema from '../audiobooks/schema';

@Injectable()
export class LibraryWatcherService implements OnModuleInit {
  private readonly logger = new Logger(LibraryWatcherService.name);
  private currentAudiobookPath: string | null = null;
  private currentEbookPath: string | null = null;
  private currentComicPath: string | null = null;

  // Rescan state
  private isRescanning = false;
  private rescanTotal = 0;
  private rescanProcessed = 0;
  private rescanCurrentAudiobook: string | undefined;

  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: NodePgDatabase<typeof audiobooksSchema>,
    private appSettingsService: AppSettingsService,
    private appEvents: AppEventsService,
    private wsEvents: WsEventsService,
    private fileWatcher: FileWatcherService,
    private libraryScanner: LibraryScannerService,
    private mediaImporter: MediaImporterService,
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
    this.currentComicPath = settings.comicLibraryPath ?? null;

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

    // Initialize comic library
    if (settings.comicLibraryPath) {
      this.logger.log(
        `Initializing comic library watcher for: ${settings.comicLibraryPath}`,
      );
      await this.runComicScan(settings.comicLibraryPath);

      if (settings.watcherEnabled) {
        await this.fileWatcher.startWatchingComics(settings.comicLibraryPath);
      }
    } else {
      this.logger.log('No comic library path configured');
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

    // Handle comic library path change
    const newComicPath = settings.comicLibraryPath ?? null;
    if (newComicPath !== this.currentComicPath) {
      this.logger.log(
        `Comic library path changed: ${this.currentComicPath} -> ${newComicPath}`,
      );
      this.currentComicPath = newComicPath;
      await this.onComicLibraryPathChange(newComicPath);
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
      if (this.currentComicPath && !this.fileWatcher.isWatchingComics()) {
        await this.fileWatcher.startWatchingComics(this.currentComicPath);
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

  async onComicLibraryPathChange(
    newPath: string | null,
  ): Promise<ScanResult | null> {
    await this.fileWatcher.stopComicWatcher();

    if (!newPath) {
      this.logger.log('Comic library path cleared, watcher stopped');
      return null;
    }

    const settings = await this.appSettingsService.getSettings();

    this.logger.log(`Comic library path changed to: ${newPath}`);

    // Run reconciliation scan on new path
    const result = await this.runComicScan(newPath);

    // Start watching new path if watcher is enabled
    if (settings.watcherEnabled) {
      await this.fileWatcher.startWatchingComics(newPath);
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

  async runComicScan(comicLibraryPath?: string): Promise<ScanResult> {
    const scanPath =
      comicLibraryPath || (await this.appSettingsService.getComicLibraryPath());

    if (!scanPath) {
      throw new Error('No comic library path configured');
    }

    return this.libraryScanner.scanComicLibrary(scanPath);
  }

  async manualScan(): Promise<ScanResult> {
    return this.runAudiobookScan();
  }

  async manualEbookScan(): Promise<ScanResult> {
    return this.runEbookScan();
  }

  async manualComicScan(): Promise<ScanResult> {
    return this.runComicScan();
  }

  getStatus(): {
    watching: {
      audiobooks: boolean;
      ebooks: boolean;
      comics: boolean;
    };
    paths: {
      audiobooks: string | null;
      ebooks: string | null;
      comics: string | null;
    };
    scanning: boolean;
    progress: ScanProgress | null;
  } {
    return {
      watching: {
        audiobooks: this.fileWatcher.isWatchingAudiobooks(),
        ebooks: this.fileWatcher.isWatchingEbooks(),
        comics: this.fileWatcher.isWatchingComics(),
      },
      paths: {
        audiobooks: this.fileWatcher.getCurrentAudiobookPath(),
        ebooks: this.fileWatcher.getCurrentEbookPath(),
        comics: this.fileWatcher.getCurrentComicPath(),
      },
      scanning: this.libraryScanner.isScanning(),
      progress: this.libraryScanner.getProgress(),
    };
  }

  onScanProgress(callback: (progress: ScanProgress) => void): () => void {
    return this.libraryScanner.onProgress(callback);
  }

  // ===== RESCAN ALL AUDIOBOOKS =====

  /**
   * Rescan all audiobooks in the library.
   * Re-extracts metadata from files and updates database records.
   * Respects manually edited fields (tracked via manualFields column).
   */
  async rescanAllAudiobooks(): Promise<{
    total: number;
    succeeded: number;
    failed: number;
  }> {
    if (this.isRescanning) {
      throw new Error('Rescan is already in progress');
    }

    this.isRescanning = true;
    this.rescanProcessed = 0;

    try {
      // Get all audiobooks
      const audiobooks = await this.db
        .select({
          id: audiobooksSchema.audiobooks.id,
          title: audiobooksSchema.audiobooks.title,
        })
        .from(audiobooksSchema.audiobooks);

      this.rescanTotal = audiobooks.length;

      // Emit initial status
      this.emitRescanStatus('preparing');

      this.logger.log(`Starting rescan of ${this.rescanTotal} audiobooks`);

      let succeeded = 0;
      let failed = 0;

      for (const audiobook of audiobooks) {
        this.rescanCurrentAudiobook = audiobook.title;
        this.emitRescanStatus('rescanning');

        try {
          const success = await this.mediaImporter.rescanAudiobook(
            audiobook.id,
          );
          if (success) {
            succeeded++;
          } else {
            failed++;
          }
        } catch (error) {
          this.logger.error(
            `Failed to rescan audiobook ${audiobook.id}: ${error}`,
          );
          failed++;
        }

        this.rescanProcessed++;
        this.emitRescanStatus('rescanning');
      }

      this.logger.log(
        `Rescan completed: ${succeeded} succeeded, ${failed} failed`,
      );

      return {
        total: this.rescanTotal,
        succeeded,
        failed,
      };
    } finally {
      this.isRescanning = false;
      this.rescanTotal = 0;
      this.rescanProcessed = 0;
      this.rescanCurrentAudiobook = undefined;

      // Emit final status (not rescanning)
      this.emitRescanStatus();
    }
  }

  private emitRescanStatus(phase?: 'preparing' | 'rescanning'): void {
    const status: RescanStatus = {
      isRescanning: this.isRescanning,
      phase,
      total: this.rescanTotal,
      processed: this.rescanProcessed,
      percentage:
        this.rescanTotal > 0
          ? Math.round((this.rescanProcessed / this.rescanTotal) * 100)
          : 0,
      currentAudiobook: this.rescanCurrentAudiobook,
    };
    this.wsEvents.rescanStatusUpdated(status);
  }

  getRescanStatus(): RescanStatus {
    return {
      isRescanning: this.isRescanning,
      phase: this.isRescanning ? 'rescanning' : undefined,
      total: this.rescanTotal,
      processed: this.rescanProcessed,
      percentage:
        this.rescanTotal > 0
          ? Math.round((this.rescanProcessed / this.rescanTotal) * 100)
          : 0,
      currentAudiobook: this.rescanCurrentAudiobook,
    };
  }
}
