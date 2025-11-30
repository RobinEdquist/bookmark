// apps/backend/src/library-watcher/library-scanner.service.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, or, sql } from 'drizzle-orm';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as audiobooksSchema from '../audiobooks/schema';
import { AudiobookDetectorService } from './audiobook-detector.service';
import { AudiobookImporterService } from './audiobook-importer.service';
import { AppEventsService } from '../events/app-events.service';

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
  private progressCallbacks = new Set<(progress: ScanProgress) => void>();

  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: NodePgDatabase<typeof audiobooksSchema>,
    private audiobookDetector: AudiobookDetectorService,
    private audiobookImporter: AudiobookImporterService,
    private appEvents: AppEventsService,
  ) {}

  async runReconciliationScan(libraryPath: string): Promise<ScanResult> {
    const result: ScanResult = {
      added: 0,
      missing: 0,
      restored: 0,
      deleted: 0,
      errors: [],
    };

    this.logger.log(`Starting reconciliation scan of ${libraryPath}`);
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

      // Resolve relative path to absolute for filesystem check
      const absolutePath = path.join(libraryPath, audiobook.filePath);
      const exists = await this.pathExists(absolutePath);

      // Handle hidden audiobooks: if files are gone, delete from DB entirely
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

    // existingPaths are relative (from DB), convert detected unit paths to relative for comparison
    const existingPaths = new Set(existingAudiobooks.map((a) => a.filePath));
    const detectedUnits = await this.audiobookDetector.detectAudiobookUnits(libraryPath);

    const newUnits = detectedUnits.filter((unit) => {
      const relativeUnitPath = path.relative(libraryPath, unit.path);
      return !existingPaths.has(relativeUnitPath);
    });

    this.updateProgress({
      phase: 'importing',
      total: newUnits.length,
      processed: 0,
    });

    for (let i = 0; i < newUnits.length; i++) {
      const unit = newUnits[i];

      this.updateProgress({
        phase: 'importing',
        total: newUnits.length,
        processed: i,
        currentFile: unit.path,
      });

      try {
        const id = await this.audiobookImporter.importAudiobook(unit, libraryPath);
        if (id) {
          result.added++;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.errors.push({ path: unit.path, error: errorMessage });
        this.logger.error(`Failed to import ${unit.path}: ${errorMessage}`);
      }
    }

    this.updateProgress({
      phase: 'importing',
      total: newUnits.length,
      processed: newUnits.length,
    });

    this.currentProgress = null;

    this.logger.log(
      `Reconciliation complete: ${result.added} added, ${result.missing} missing, ${result.restored} restored, ${result.deleted} deleted, ${result.errors.length} errors`,
    );

    this.appEvents.libraryScanCompleted();
    return result;
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
    // Delete the audiobook - related records are deleted via ON DELETE CASCADE
    await this.db
      .delete(audiobooksSchema.audiobooks)
      .where(eq(audiobooksSchema.audiobooks.id, id));
  }

  private updateProgress(progress: ScanProgress): void {
    this.currentProgress = progress;
    this.progressCallbacks.forEach((cb) => cb(progress));
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

  async handlePathRemoved(removedPath: string, libraryPath: string): Promise<void> {
    const relativePath = path.relative(libraryPath, removedPath);

    // Find audiobook that matches this path (could be exact match or parent folder)
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
        // Hidden audiobook - delete from database
        await this.deleteAudiobookFromDb(audiobook.id);
        this.logger.log(
          `Deleted hidden audiobook (files removed): ${audiobook.filePath}`,
        );
        this.appEvents.audiobookDeleted(audiobook.id);
      } else {
        // Non-hidden - mark as missing
        await this.db
          .update(audiobooksSchema.audiobooks)
          .set({ status: 'missing', missingAt: new Date() })
          .where(eq(audiobooksSchema.audiobooks.id, audiobook.id));
        this.logger.log(`Marked audiobook as missing: ${audiobook.filePath}`);
        this.appEvents.audiobookUpdated(audiobook.id);
      }
    }
  }
}
