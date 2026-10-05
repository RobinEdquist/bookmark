// apps/backend/src/library-watcher/library-scanner.service.ts
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { asc, eq, or, sql } from 'drizzle-orm';
import * as fs from 'fs/promises';
import * as path from 'path';
import pLimit from 'p-limit';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as audiobooksSchema from '../audiobooks/schema';
import * as ebooksSchema from '../ebooks/schema';
import * as comicsSchema from '../comics/schema';
import {
  MediaDetectorService,
  AudiobookUnit,
  EbookUnit,
  ComicSeriesUnit,
} from './media-detector.service';
import {
  KnownAudiobookUnit,
  MediaImporterService,
} from './media-importer.service';
import { AppEventsService } from '../events/app-events.service';
import { WsEventsService } from '../events/ws-events.service';
import { LibraryType } from './file-watcher.service';
import { calculateAudiobookPaths } from './utils/path.utils';

// Configuration for parallel import processing
const IMPORT_CONCURRENCY = 5; // Number of imports to run in parallel
const BATCH_SIZE = 20; // Number of items per batch before yielding

export interface ScanResult {
  added: number;
  missing: number;
  restored: number;
  deleted: number;
  /** Known audiobooks whose broken file list was rebuilt from disk */
  repaired: number;
  errors: Array<{ path: string; error: string }>;
}

export interface HiddenAudiobook {
  id: string;
  title: string;
  /** Folder relative to the library root; '' for a root-level file */
  filePath: string;
}

export type RestoreHiddenAudiobookOutcome = 'restored' | 'removed';

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
  private currentLibraryType: 'audiobook' | 'ebook' | 'comic' | null = null;
  private progressCallbacks = new Set<(progress: ScanProgress) => void>();

  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: NodePgDatabase<
      typeof audiobooksSchema & typeof ebooksSchema & typeof comicsSchema
    >,
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
      repaired: 0,
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

      // For root-level files (empty filePath), check if the actual file exists
      // For folder-based audiobooks, check if the folder exists
      let exists: boolean;
      if (audiobook.filePath === '') {
        // Root-level file: get the actual file path from audiobook_files
        const [file] = await this.db
          .select({ filePath: audiobooksSchema.audiobookFiles.filePath })
          .from(audiobooksSchema.audiobookFiles)
          .where(eq(audiobooksSchema.audiobookFiles.audiobookId, audiobook.id))
          .limit(1);
        if (file) {
          exists = await this.pathExists(path.join(libraryPath, file.filePath));
        } else {
          exists = false;
        }
      } else {
        const absolutePath = path.join(libraryPath, audiobook.filePath);
        exists = await this.pathExists(absolutePath);
      }

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

    // Build set of existing paths - for folder audiobooks use filePath,
    // for root-level audiobooks (filePath='') use the actual filename from audiobook_files
    const existingFolderPaths = new Set(
      existingAudiobooks
        .filter((a) => a.filePath !== '')
        .map((a) => a.filePath),
    );

    // For root-level audiobooks, get their actual filenames
    const rootAudiobookIds = existingAudiobooks
      .filter((a) => a.filePath === '')
      .map((a) => a.id);
    let existingRootFilenames = new Set<string>();
    if (rootAudiobookIds.length > 0) {
      const rootFiles = await this.db
        .select({ filePath: audiobooksSchema.audiobookFiles.filePath })
        .from(audiobooksSchema.audiobookFiles)
        .where(
          sql`${audiobooksSchema.audiobookFiles.audiobookId} IN (${sql.join(
            rootAudiobookIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        );
      existingRootFilenames = new Set(rootFiles.map((f) => f.filePath));
    }

    const detectedUnits =
      await this.mediaDetector.scanLibraryForAudiobooks(libraryPath);

    // A known book whose stored tracks were renamed or removed while
    // Bookmark wasn't watching can't play. Rebuild only those lists (see
    // MediaImporterService.needsFileRepair). Hidden books stay as they are.
    const repairResult = await this.mediaImporter.repairBrokenAudiobookFiles(
      this.matchKnownAudiobooks(existingAudiobooks, detectedUnits, libraryPath),
    );
    result.repaired = repairResult.repaired.length;
    result.errors.push(...repairResult.errors);

    const newUnits = detectedUnits.filter((unit) => {
      // Classify exactly as import does: only a file directly in the library
      // root is keyed by file name. A single-file book in a top-level folder
      // is keyed by its folder (dirname === libraryPath used to misfile it,
      // re-importing it, and counting it as added, on every scan).
      const { isRootLevelFile, relativeUnitPath } = calculateAudiobookPaths(
        unit,
        libraryPath,
      );
      return isRootLevelFile
        ? !existingRootFilenames.has(path.basename(unit.path))
        : !existingFolderPaths.has(relativeUnitPath);
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
      `Audiobook reconciliation complete: ${result.added} added, ${result.missing} missing, ${result.restored} restored, ${result.deleted} deleted, ${result.repaired} repaired, ${result.errors.length} errors`,
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
      repaired: 0,
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

  // ===== COMIC SCANNING =====

  async scanComicLibrary(libraryPath: string): Promise<ScanResult> {
    const result: ScanResult = {
      added: 0,
      missing: 0,
      restored: 0,
      deleted: 0,
      repaired: 0,
      errors: [],
    };

    this.logger.log(`Starting comic reconciliation scan of ${libraryPath}`);
    this.currentLibraryType = 'comic';

    // Phase 1a: reconcile books against the filesystem
    this.updateProgress({ phase: 'reconciling', total: 0, processed: 0 });

    const existingBooks = await this.db
      .select({
        id: comicsSchema.comicBooks.id,
        filePath: comicsSchema.comicBooks.filePath,
        status: comicsSchema.comicBooks.status,
      })
      .from(comicsSchema.comicBooks);

    this.updateProgress({
      phase: 'reconciling',
      total: existingBooks.length,
      processed: 0,
    });

    for (let i = 0; i < existingBooks.length; i++) {
      const book = existingBooks[i];
      this.updateProgress({
        phase: 'reconciling',
        total: existingBooks.length,
        processed: i + 1,
        currentFile: book.filePath,
      });

      const exists = await this.pathExists(
        path.join(libraryPath, book.filePath),
      );

      if (book.status === 'hidden') {
        if (!exists) {
          await this.db
            .delete(comicsSchema.comicBooks)
            .where(eq(comicsSchema.comicBooks.id, book.id));
          result.deleted++;
        }
        continue;
      }

      if (!exists && book.status !== 'missing') {
        await this.db
          .update(comicsSchema.comicBooks)
          .set({ status: 'missing', missingAt: new Date() })
          .where(eq(comicsSchema.comicBooks.id, book.id));
        result.missing++;
      } else if (exists && book.status === 'missing') {
        await this.db
          .update(comicsSchema.comicBooks)
          .set({ status: 'available', missingAt: null })
          .where(eq(comicsSchema.comicBooks.id, book.id));
        result.restored++;
      }
    }

    // Phase 1b: reconcile series folders; drop hidden series whose folder vanished
    const existingSeries = await this.db
      .select({
        id: comicsSchema.comicSeries.id,
        folderPath: comicsSchema.comicSeries.folderPath,
        status: comicsSchema.comicSeries.status,
      })
      .from(comicsSchema.comicSeries);

    for (const series of existingSeries) {
      // Virtual/merged series have no backing folder; they can't be "missing
      // on disk", so skip the filesystem existence sweep for them.
      if (series.folderPath === null) continue;
      const exists = await this.pathExists(
        path.join(libraryPath, series.folderPath),
      );

      if (!exists) {
        if (series.status === 'hidden') {
          await this.db
            .delete(comicsSchema.comicSeries)
            .where(eq(comicsSchema.comicSeries.id, series.id));
          result.deleted++;
          continue;
        }
        if (series.status !== 'missing') {
          await this.db
            .update(comicsSchema.comicSeries)
            .set({ status: 'missing', missingAt: new Date() })
            .where(eq(comicsSchema.comicSeries.id, series.id));
        }
      } else if (series.status === 'missing') {
        await this.db
          .update(comicsSchema.comicSeries)
          .set({ status: 'available', missingAt: null })
          .where(eq(comicsSchema.comicSeries.id, series.id));
      }
    }

    // Phase 2: detect units and keep those with anything new
    this.updateProgress({ phase: 'scanning', total: 0, processed: 0 });

    const existingBookPaths = new Set(existingBooks.map((b) => b.filePath));
    const existingSeriesPaths = new Set(
      existingSeries
        .map((s) => s.folderPath)
        .filter((p): p is string => p !== null),
    );

    const detectedUnits =
      await this.mediaDetector.scanLibraryForComics(libraryPath);

    const newUnits = detectedUnits.filter((unit) => {
      const relFolder = path.relative(libraryPath, unit.path);
      if (!existingSeriesPaths.has(relFolder)) return true;
      return unit.books.some(
        (b) => !existingBookPaths.has(path.relative(libraryPath, b.path)),
      );
    });

    this.updateProgress({
      phase: 'importing',
      total: newUnits.length,
      processed: 0,
    });

    const importResults = await this.importInBatches(
      newUnits,
      libraryPath,
      'comic',
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
      `Comic reconciliation complete: ${result.added} added, ${result.missing} missing, ${result.restored} restored, ${result.deleted} deleted, ${result.errors.length} errors`,
    );

    return result;
  }

  // ===== HIDDEN AUDIOBOOKS =====
  //
  // "Delete, keep files" hides a book instead of deleting its row, so scans
  // and the watcher don't import the folder straight back. These let an admin
  // see what is hidden and undo it.

  async listHiddenAudiobooks(): Promise<HiddenAudiobook[]> {
    return this.db
      .select({
        id: audiobooksSchema.audiobooks.id,
        title: audiobooksSchema.audiobooks.title,
        filePath: audiobooksSchema.audiobooks.filePath,
      })
      .from(audiobooksSchema.audiobooks)
      .where(eq(audiobooksSchema.audiobooks.status, 'hidden'))
      .orderBy(asc(audiobooksSchema.audiobooks.title));
  }

  /**
   * Put a hidden audiobook back in the library, repairing its file list if
   * tracks were renamed while it was hidden. Only if its folder (or root
   * file) no longer exists is the row deleted, exactly as the next scan
   * would.
   */
  async restoreHiddenAudiobook(
    id: string,
    libraryPath: string,
  ): Promise<RestoreHiddenAudiobookOutcome> {
    const [audiobook] = await this.db
      .select({
        id: audiobooksSchema.audiobooks.id,
        filePath: audiobooksSchema.audiobooks.filePath,
        status: audiobooksSchema.audiobooks.status,
      })
      .from(audiobooksSchema.audiobooks)
      .where(eq(audiobooksSchema.audiobooks.id, id))
      .limit(1);

    if (!audiobook || audiobook.status !== 'hidden') {
      throw new NotFoundException('Hidden audiobook not found');
    }

    const location = await this.resolveAudiobookLocation(
      audiobook,
      libraryPath,
    );

    if (!location || !(await this.pathExists(location))) {
      await this.deleteAudiobookFromDb(id);
      this.logger.log(
        `Deleted hidden audiobook on restore (files gone): ${audiobook.filePath}`,
      );
      this.appEvents.audiobookDeleted(id);
      return 'removed';
    }

    const unit = await this.mediaDetector.detectAudiobook(location);
    if (unit) {
      await this.mediaImporter.markAudiobookAvailable(id, unit);
    } else {
      // The folder is there, in a layout the detector doesn't read (tracks
      // in subfolders, formats it skips). The stored files are the only
      // description of the book, so keep them, as a scan would.
      await this.db
        .update(audiobooksSchema.audiobooks)
        .set({ status: 'available', missingAt: null })
        .where(eq(audiobooksSchema.audiobooks.id, id));
      this.appEvents.audiobookUpdated(id);
    }
    this.logger.log(`Restored hidden audiobook: ${location} (id=${id})`);
    return 'restored';
  }

  /**
   * Pair each known, non-hidden folder audiobook with the unit the detector
   * found at its path. Root-level files are keyed by file name rather than
   * folder, so a changed one shows up as a new import instead.
   */
  private matchKnownAudiobooks(
    existing: Array<{ id: string; filePath: string; status: string }>,
    detectedUnits: AudiobookUnit[],
    libraryPath: string,
  ): KnownAudiobookUnit[] {
    const unitsByPath = new Map<string, AudiobookUnit>();
    for (const unit of detectedUnits) {
      const { isRootLevelFile, relativeUnitPath } = calculateAudiobookPaths(
        unit,
        libraryPath,
      );
      if (!isRootLevelFile) unitsByPath.set(relativeUnitPath, unit);
    }

    return existing.flatMap((audiobook) => {
      if (audiobook.status === 'hidden' || audiobook.filePath === '') return [];
      const unit = unitsByPath.get(audiobook.filePath);
      return unit ? [{ id: audiobook.id, unit }] : [];
    });
  }

  /** Absolute path the detector should look at for an existing row. */
  private async resolveAudiobookLocation(
    audiobook: { id: string; filePath: string },
    libraryPath: string,
  ): Promise<string | null> {
    if (audiobook.filePath !== '') {
      return path.join(libraryPath, audiobook.filePath);
    }

    // Root-level single file: the row only knows its file name
    const [file] = await this.db
      .select({ filePath: audiobooksSchema.audiobookFiles.filePath })
      .from(audiobooksSchema.audiobookFiles)
      .where(eq(audiobooksSchema.audiobookFiles.audiobookId, audiobook.id))
      .limit(1);
    return file ? path.join(libraryPath, file.filePath) : null;
  }

  // ===== PATH REMOVAL HANDLING =====

  async handlePathRemoved(
    removedPath: string,
    libraryPath: string,
    libraryType: LibraryType,
  ): Promise<void> {
    if (libraryType === 'audiobook') {
      await this.handleAudiobookPathRemoved(removedPath, libraryPath);
    } else if (libraryType === 'ebook') {
      await this.handleEbookPathRemoved(removedPath, libraryPath);
    } else {
      await this.handleComicPathRemoved(removedPath, libraryPath);
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

  private async handleComicPathRemoved(
    removedPath: string,
    libraryPath: string,
  ): Promise<void> {
    const relativePath = path.relative(libraryPath, removedPath);

    // Books matching the removed file, or inside the removed folder
    const books = await this.db
      .select({
        id: comicsSchema.comicBooks.id,
        filePath: comicsSchema.comicBooks.filePath,
        status: comicsSchema.comicBooks.status,
      })
      .from(comicsSchema.comicBooks)
      .where(
        or(
          eq(comicsSchema.comicBooks.filePath, relativePath),
          sql`${comicsSchema.comicBooks.filePath} LIKE ${relativePath + '/%'}`,
        ),
      );

    for (const book of books) {
      if (book.status === 'hidden') {
        await this.db
          .delete(comicsSchema.comicBooks)
          .where(eq(comicsSchema.comicBooks.id, book.id));
        this.logger.log(
          `Deleted hidden comic book (files removed): ${book.filePath}`,
        );
      } else {
        await this.db
          .update(comicsSchema.comicBooks)
          .set({ status: 'missing', missingAt: new Date() })
          .where(eq(comicsSchema.comicBooks.id, book.id));
        this.logger.log(`Marked comic book as missing: ${book.filePath}`);
      }
    }

    // Series matching the removed folder (or root one-shot file)
    const series = await this.db
      .select({
        id: comicsSchema.comicSeries.id,
        status: comicsSchema.comicSeries.status,
      })
      .from(comicsSchema.comicSeries)
      .where(
        or(
          eq(comicsSchema.comicSeries.folderPath, relativePath),
          sql`${comicsSchema.comicSeries.folderPath} LIKE ${relativePath + '/%'}`,
        ),
      );

    for (const s of series) {
      if (s.status === 'hidden') {
        await this.db
          .delete(comicsSchema.comicSeries)
          .where(eq(comicsSchema.comicSeries.id, s.id));
        this.logger.log(`Deleted hidden comic series (files removed): ${s.id}`);
        this.appEvents.comicSeriesDeleted(s.id);
      } else {
        await this.db
          .update(comicsSchema.comicSeries)
          .set({ status: 'missing', missingAt: new Date() })
          .where(eq(comicsSchema.comicSeries.id, s.id));
        this.logger.log(`Marked comic series as missing: ${s.id}`);
        this.appEvents.comicSeriesUpdated(s.id);
      }
    }
  }

  // ===== HELPERS =====

  /**
   * Import media items in parallel batches with concurrency control.
   * This prevents event loop starvation and provides better performance than sequential imports.
   */
  private async importInBatches(
    units: AudiobookUnit[] | EbookUnit[] | ComicSeriesUnit[],
    libraryPath: string,
    type: 'audiobook' | 'ebook' | 'comic',
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
            let id: string | null;
            if (type === 'audiobook') {
              id = await this.mediaImporter.importAudiobook(
                unit as AudiobookUnit,
                libraryPath,
              );
            } else if (type === 'ebook') {
              id = await this.mediaImporter.importEbook(
                unit as EbookUnit,
                libraryPath,
              );
            } else {
              id = await this.mediaImporter.importComicSeriesUnit(
                unit as ComicSeriesUnit,
                libraryPath,
              );
            }

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
