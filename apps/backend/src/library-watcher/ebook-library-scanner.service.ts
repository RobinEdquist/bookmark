import { Inject, Injectable, Logger } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, or, sql } from 'drizzle-orm';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as ebooksSchema from '../ebooks/schema';
import { EbookDetectorService } from './ebook-detector.service';
import { EbookImporterService } from './ebook-importer.service';
import { AppEventsService } from '../events/app-events.service';

export interface EbookScanResult {
  added: number;
  missing: number;
  restored: number;
  deleted: number;
  errors: Array<{ path: string; error: string }>;
}

export interface EbookScanProgress {
  phase: 'reconciling' | 'scanning' | 'importing';
  total: number;
  processed: number;
  currentFile?: string;
}

@Injectable()
export class EbookLibraryScannerService {
  private readonly logger = new Logger(EbookLibraryScannerService.name);
  private currentProgress: EbookScanProgress | null = null;
  private progressCallbacks = new Set<(progress: EbookScanProgress) => void>();

  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: NodePgDatabase<typeof ebooksSchema>,
    private ebookDetector: EbookDetectorService,
    private ebookImporter: EbookImporterService,
    private appEvents: AppEventsService,
  ) {}

  async runReconciliationScan(libraryPath: string): Promise<EbookScanResult> {
    const result: EbookScanResult = {
      added: 0,
      missing: 0,
      restored: 0,
      deleted: 0,
      errors: [],
    };

    this.logger.log(`Starting ebook reconciliation scan of ${libraryPath}`);

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

      // Resolve relative path to absolute for filesystem check
      const absolutePath = path.join(libraryPath, ebook.filePath);
      const exists = await this.pathExists(absolutePath);

      // Handle hidden ebooks: if files are gone, delete from DB entirely
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
    const detectedUnits = await this.ebookDetector.detectEbookUnits(libraryPath);

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
        const id = await this.ebookImporter.importEbook(unit, libraryPath);
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
      `Ebook reconciliation complete: ${result.added} added, ${result.missing} missing, ${result.restored} restored, ${result.deleted} deleted, ${result.errors.length} errors`,
    );

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

  private async deleteEbookFromDb(id: string): Promise<void> {
    await this.db
      .delete(ebooksSchema.ebooks)
      .where(eq(ebooksSchema.ebooks.id, id));
  }

  private updateProgress(progress: EbookScanProgress): void {
    this.currentProgress = progress;
    this.progressCallbacks.forEach((cb) => cb(progress));
  }

  getProgress(): EbookScanProgress | null {
    return this.currentProgress;
  }

  onProgress(callback: (progress: EbookScanProgress) => void): () => void {
    this.progressCallbacks.add(callback);
    return () => this.progressCallbacks.delete(callback);
  }

  isScanning(): boolean {
    return this.currentProgress !== null;
  }

  async handlePathRemoved(removedPath: string, libraryPath: string): Promise<void> {
    const relativePath = path.relative(libraryPath, removedPath);

    // Find ebook that matches this path
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
        // Hidden ebook - delete from database
        await this.deleteEbookFromDb(ebook.id);
        this.logger.log(
          `Deleted hidden ebook (files removed): ${ebook.filePath}`,
        );
        this.appEvents.ebookDeleted(ebook.id);
      } else {
        // Non-hidden - mark as missing
        await this.db
          .update(ebooksSchema.ebooks)
          .set({ status: 'missing', missingAt: new Date() })
          .where(eq(ebooksSchema.ebooks.id, ebook.id));
        this.logger.log(`Marked ebook as missing: ${ebook.filePath}`);
        this.appEvents.ebookUpdated(ebook.id);
      }
    }
  }
}
