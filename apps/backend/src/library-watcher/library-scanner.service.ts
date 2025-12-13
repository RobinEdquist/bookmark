// apps/backend/src/library-watcher/library-scanner.service.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, or, sql } from 'drizzle-orm';
import * as fs from 'fs/promises';
import * as path from 'path';
import pLimit from 'p-limit';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as audiobooksSchema from '../audiobooks/schema';
import * as ebooksSchema from '../ebooks/schema';
import {
  MediaDetectorService,
  AudiobookUnit,
  EbookUnit,
} from './media-detector.service';
import { MediaImporterService } from './media-importer.service';
import { AppEventsService } from '../events/app-events.service';
import { WsEventsService } from '../events/ws-events.service';
import { LibraryType } from './file-watcher.service';

// Configuration for parallel import processing
const IMPORT_CONCURRENCY = 5; // Number of imports to run in parallel
const BATCH_SIZE = 20; // Number of items per batch before yielding

export interface ScanResult {
  added: number;
  missing: number;
  restored: number;
  deleted: number;
  errors: Array<{ path: string; error: string }>;
}

export interface ScanProgress {
  phase: 'reconciling' | 'scanning' | 'importing';
  total: number;
  processed: number;
  currentFile?: string;
}

@Injectable()
export class LibraryScannerService {
  private readonly logger = new Logger(LibraryScannerService.name);
  private currentProgress: ScanProgress | null = null;
  private currentLibraryType: 'audiobook' | 'ebook' | null = null;
  private progressCallbacks = new Set<(progress: ScanProgress) => void>();

  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: NodePgDatabase<typeof audiobooksSchema & typeof ebooksSchema>,
    private mediaDetector: MediaDetectorService,
    private mediaImporter: MediaImporterService,
    private appEvents: AppEventsService,
    private wsEvents: WsEventsService,
  ) {}

  // ===== AUDIOBOOK SCANNING =====

  async scanAudiobookLibrary(libraryPath: string): Promise<ScanResult> {
    const result: ScanResult = {
      added: 0,
      missing: 0,
      restored: 0,
      deleted: 0,
      errors: [],
    };

    this.logger.log(`Starting audiobook reconciliation scan of ${libraryPath}`);
    this.currentLibraryType = 'audiobook';
    this.appEvents.libraryScanStarted();

    // Phase 1: Check existing DB entries against filesystem
    this.updateProgress({ phase: 'reconciling', total: 0, processed: 0 });

    const existingAudiobooks = await this.db
      .select({
        id: audiobooksSchema.audiobooks.id,
        filePath: audiobooksSchema.audiobooks.filePath,
        status: audiobooksSchema.audiobooks.status,
      })
      .from(audiobooksSchema.audiobooks);

    this.updateProgress({
      phase: 'reconciling',
      total: existingAudiobooks.length,
      processed: 0,
    });

    for (let i = 0; i < existingAudiobooks.length; i++) {
      const audiobook = existingAudiobooks[i];

      this.updateProgress({
        phase: 'reconciling',
        total: existingAudiobooks.length,
        processed: i + 1,
        currentFile: audiobook.filePath,
      });

      const absolutePath = path.join(libraryPath, audiobook.filePath);
      const exists = await this.pathExists(absolutePath);

      if (audiobook.status === 'hidden') {
        if (!exists) {
          await this.deleteAudiobookFromDb(audiobook.id);
          result.deleted++;
          this.logger.debug(
            `Deleted hidden audiobook (files missing): ${audiobook.filePath}`,
          );
        }
        continue;
      }

      if (!exists && audiobook.status !== 'missing') {
        await this.db
          .update(audiobooksSchema.audiobooks)
          .set({ status: 'missing', missingAt: new Date() })
          .where(eq(audiobooksSchema.audiobooks.id, audiobook.id));
        result.missing++;
        this.logger.debug(`Marked as missing: ${audiobook.filePath}`);
      } else if (exists && audiobook.status === 'missing') {
        await this.db
          .update(audiobooksSchema.audiobooks)
          .set({ status: 'available', missingAt: null })
          .where(eq(audiobooksSchema.audiobooks.id, audiobook.id));
        result.restored++;
        this.logger.debug(`Restored from missing: ${audiobook.filePath}`);
      }
    }

    // Phase 2: Scan for new audiobooks
    this.updateProgress({ phase: 'scanning', total: 0, processed: 0 });

    const existingPaths = new Set(existingAudiobooks.map((a) => a.filePath));
    const detectedUnits =
      await this.mediaDetector.scanLibraryForAudiobooks(libraryPath);

    const newUnits = detectedUnits.filter((unit) => {
      const relativeUnitPath = path.relative(libraryPath, unit.path);
      return !existingPaths.has(relativeUnitPath);
    });

    this.updateProgress({
      phase: 'importing',
      total: newUnits.length,
      processed: 0,
    });

    // Import audiobooks in parallel batches for better performance
    const importResults = await this.importInBatches(
      newUnits,
      libraryPath,
      'audiobook',
    );

    result.added = importResults.added;
    result.errors.push(...importResults.errors);

    this.updateProgress({
      phase: 'importing',
      total: newUnits.length,
      processed: newUnits.length,
    });

    this.currentProgress = null;
    this.currentLibraryType = null;
    this.emitScanStatus(false);

    this.logger.log(
      `Audiobook reconciliation complete: ${result.added} added, ${result.missing} missing, ${result.restored} restored, ${result.deleted} deleted, ${result.errors.length} errors`,
    );

    this.appEvents.libraryScanCompleted();
    return result;
  }

  // ===== EBOOK SCANNING =====

  async scanEbookLibrary(libraryPath: string): Promise<ScanResult> {
    const result: ScanResult = {
      added: 0,
      missing: 0,
      restored: 0,
      deleted: 0,
      errors: [],
    };

    this.logger.log(`Starting ebook reconciliation scan of ${libraryPath}`);
    this.currentLibraryType = 'ebook';

    // Phase 1: Check existing DB entries against filesystem
    this.updateProgress({ phase: 'reconciling', total: 0, processed: 0 });

    const existingEbooks = await this.db
      .select({
        id: ebooksSchema.ebooks.id,
        filePath: ebooksSchema.ebooks.filePath,
        status: ebooksSchema.ebooks.status,
      })
      .from(ebooksSchema.ebooks);

    this.updateProgress({
      phase: 'reconciling',
      total: existingEbooks.length,
      processed: 0,
    });

    for (let i = 0; i < existingEbooks.length; i++) {
      const ebook = existingEbooks[i];

      this.updateProgress({
        phase: 'reconciling',
        total: existingEbooks.length,
        processed: i + 1,
        currentFile: ebook.filePath,
      });

      const absolutePath = path.join(libraryPath, ebook.filePath);
      const exists = await this.pathExists(absolutePath);

      if (ebook.status === 'hidden') {
        if (!exists) {
          await this.deleteEbookFromDb(ebook.id);
          result.deleted++;
          this.logger.debug(
            `Deleted hidden ebook (files missing): ${ebook.filePath}`,
          );
        }
        continue;
      }

      if (!exists && ebook.status !== 'missing') {
        await this.db
          .update(ebooksSchema.ebooks)
          .set({ status: 'missing', missingAt: new Date() })
          .where(eq(ebooksSchema.ebooks.id, ebook.id));
        result.missing++;
        this.logger.debug(`Marked as missing: ${ebook.filePath}`);
      } else if (exists && ebook.status === 'missing') {
        await this.db
          .update(ebooksSchema.ebooks)
          .set({ status: 'available', missingAt: null })
          .where(eq(ebooksSchema.ebooks.id, ebook.id));
        result.restored++;
        this.logger.debug(`Restored from missing: ${ebook.filePath}`);
      }
    }

    // Phase 2: Scan for new ebooks
    this.updateProgress({ phase: 'scanning', total: 0, processed: 0 });

    const existingPaths = new Set(existingEbooks.map((e) => e.filePath));
    const detectedUnits =
      await this.mediaDetector.scanLibraryForEbooks(libraryPath);

    const newUnits = detectedUnits.filter((unit) => {
      const relativeUnitPath = path.relative(libraryPath, unit.path);
      return !existingPaths.has(relativeUnitPath);
    });

    this.updateProgress({
      phase: 'importing',
      total: newUnits.length,
      processed: 0,
    });

    // Import ebooks in parallel batches for better performance
    const importResults = await this.importInBatches(
      newUnits,
      libraryPath,
      'ebook',
    );

    result.added = importResults.added;
    result.errors.push(...importResults.errors);

    this.updateProgress({
      phase: 'importing',
      total: newUnits.length,
      processed: newUnits.length,
    });

    this.currentProgress = null;
    this.currentLibraryType = null;
    this.emitScanStatus(false);

    this.logger.log(
      `Ebook reconciliation complete: ${result.added} added, ${result.missing} missing, ${result.restored} restored, ${result.deleted} deleted, ${result.errors.length} errors`,
    );

    return result;
  }

  // ===== PATH REMOVAL HANDLING =====

  async handlePathRemoved(
    removedPath: string,
    libraryPath: string,
    libraryType: LibraryType,
  ): Promise<void> {
    if (libraryType === 'audiobook') {
      await this.handleAudiobookPathRemoved(removedPath, libraryPath);
    } else {
      await this.handleEbookPathRemoved(removedPath, libraryPath);
    }
  }

  private async handleAudiobookPathRemoved(
    removedPath: string,
    libraryPath: string,
  ): Promise<void> {
    const relativePath = path.relative(libraryPath, removedPath);

    const audiobooks = await this.db
      .select({
        id: audiobooksSchema.audiobooks.id,
        filePath: audiobooksSchema.audiobooks.filePath,
        status: audiobooksSchema.audiobooks.status,
      })
      .from(audiobooksSchema.audiobooks)
      .where(
        or(
          eq(audiobooksSchema.audiobooks.filePath, relativePath),
          sql`${audiobooksSchema.audiobooks.filePath} LIKE ${relativePath + '/%'}`,
        ),
      );

    for (const audiobook of audiobooks) {
      if (audiobook.status === 'hidden') {
        await this.deleteAudiobookFromDb(audiobook.id);
        this.logger.log(
          `Deleted hidden audiobook (files removed): ${audiobook.filePath}`,
        );
        this.appEvents.audiobookDeleted(audiobook.id);
      } else {
        await this.db
          .update(audiobooksSchema.audiobooks)
          .set({ status: 'missing', missingAt: new Date() })
          .where(eq(audiobooksSchema.audiobooks.id, audiobook.id));
        this.logger.log(`Marked audiobook as missing: ${audiobook.filePath}`);
        this.appEvents.audiobookUpdated(audiobook.id);
      }
    }
  }

  private async handleEbookPathRemoved(
    removedPath: string,
    libraryPath: string,
  ): Promise<void> {
    const relativePath = path.relative(libraryPath, removedPath);

    const ebooks = await this.db
      .select({
        id: ebooksSchema.ebooks.id,
        filePath: ebooksSchema.ebooks.filePath,
        status: ebooksSchema.ebooks.status,
      })
      .from(ebooksSchema.ebooks)
      .where(eq(ebooksSchema.ebooks.filePath, relativePath));

    for (const ebook of ebooks) {
      if (ebook.status === 'hidden') {
        await this.deleteEbookFromDb(ebook.id);
        this.logger.log(
          `Deleted hidden ebook (files removed): ${ebook.filePath}`,
        );
        this.appEvents.ebookDeleted(ebook.id);
      } else {
        await this.db
          .update(ebooksSchema.ebooks)
          .set({ status: 'missing', missingAt: new Date() })
          .where(eq(ebooksSchema.ebooks.id, ebook.id));
        this.logger.log(`Marked ebook as missing: ${ebook.filePath}`);
        this.appEvents.ebookUpdated(ebook.id);
      }
    }
  }

  // ===== HELPERS =====

  /**
   * Import media items in parallel batches with concurrency control.
   * This prevents event loop starvation and provides better performance than sequential imports.
   */
  private async importInBatches(
    units: AudiobookUnit[] | EbookUnit[],
    libraryPath: string,
    type: 'audiobook' | 'ebook',
  ): Promise<{
    added: number;
    errors: Array<{ path: string; error: string }>;
  }> {
    const limit = pLimit(IMPORT_CONCURRENCY);
    let added = 0;
    const errors: Array<{ path: string; error: string }> = [];
    let processed = 0;

    // Process in batches to allow yielding to the event loop
    for (let i = 0; i < units.length; i += BATCH_SIZE) {
      const batch = units.slice(i, i + BATCH_SIZE);

      // Process batch items in parallel with concurrency limit
      const batchPromises = batch.map((unit) =>
        limit(async () => {
          try {
            const id =
              type === 'audiobook'
                ? await this.mediaImporter.importAudiobook(
                    unit as AudiobookUnit,
                    libraryPath,
                  )
                : await this.mediaImporter.importEbook(
                    unit as EbookUnit,
                    libraryPath,
                  );

            if (id) {
              added++;
            }
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            errors.push({ path: unit.path, error: errorMessage });
            this.logger.error(`Failed to import ${unit.path}: ${errorMessage}`);
          } finally {
            processed++;
            // Update progress per item for responsiveness
            this.updateProgress({
              phase: 'importing',
              total: units.length,
              processed,
              currentFile: unit.path,
            });
          }
        }),
      );

      // Wait for batch to complete
      await Promise.all(batchPromises);

      // Yield to event loop between batches to prevent starvation
      await new Promise((resolve) => setImmediate(resolve));
    }

    return { added, errors };
  }

  private async pathExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async deleteAudiobookFromDb(id: string): Promise<void> {
    await this.db
      .delete(audiobooksSchema.audiobooks)
      .where(eq(audiobooksSchema.audiobooks.id, id));
  }

  private async deleteEbookFromDb(id: string): Promise<void> {
    await this.db
      .delete(ebooksSchema.ebooks)
      .where(eq(ebooksSchema.ebooks.id, id));
  }

  private updateProgress(progress: ScanProgress): void {
    this.currentProgress = progress;
    this.progressCallbacks.forEach((cb) => cb(progress));
    this.emitScanStatus(true);
  }

  private emitScanStatus(isScanning: boolean): void {
    if (!isScanning) {
      this.wsEvents.scanStatusUpdated({ isScanning: false });
      return;
    }

    const progress = this.currentProgress;
    if (!progress) return;

    const percentage =
      progress.total > 0
        ? Math.round((progress.processed / progress.total) * 100)
        : 0;

    this.wsEvents.scanStatusUpdated({
      isScanning: true,
      phase: progress.phase,
      total: progress.total,
      processed: progress.processed,
      percentage,
      currentFile: progress.currentFile,
      libraryType: this.currentLibraryType ?? undefined,
    });
  }

  getProgress(): ScanProgress | null {
    return this.currentProgress;
  }

  onProgress(callback: (progress: ScanProgress) => void): () => void {
    this.progressCallbacks.add(callback);
    return () => this.progressCallbacks.delete(callback);
  }

  isScanning(): boolean {
    return this.currentProgress !== null;
  }
}
