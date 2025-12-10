import { Injectable, Logger, Inject } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as audiobooksSchema from '../audiobooks/schema';
import * as progressSchema from '../progress/schema';
import { AbsParserService, LibraryData } from './abs-parser.service';
import { AppDataService } from '../app-data/app-data.service';
import {
  RestoreSession,
  RestoreSessionState,
  PathMapping,
  RestoreProgress,
} from './types/restore-session.types';
import {
  ABSBook,
  ABSLibraryItem,
  ABSMediaProgress,
} from './types/abs-backup.types';

@Injectable()
export class RestoreImporterService {
  private readonly logger = new Logger('RestoreImporterService');
  private readonly eventEmitter = new EventEmitter();

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase<typeof audiobooksSchema>,
    private readonly absParserService: AbsParserService,
    private readonly appDataService: AppDataService,
  ) {}

  /**
   * Subscribe to restore events (progress, completed, failed)
   */
  on(
    event: 'restore.progress' | 'restore.completed' | 'restore.failed',
    listener: (...args: any[]) => void,
  ): void {
    this.eventEmitter.on(event, listener);
  }

  /**
   * Unsubscribe from restore events
   */
  off(
    event: 'restore.progress' | 'restore.completed' | 'restore.failed',
    listener: (...args: any[]) => void,
  ): void {
    this.eventEmitter.off(event, listener);
  }

  /**
   * Main import executor - runs the entire import process in a transaction
   */
  async executeImport(session: RestoreSession): Promise<void> {
    this.logger.log(
      `[ABS-RESTORE-IMPORT] Starting import for session ${session.id}`,
    );
    const startTime = Date.now();

    if (!session.selectedLibraryId || !session.extractedPath) {
      throw new Error('Session is not properly configured for import');
    }

    try {
      // Parse library data
      this.logger.log(`[ABS-RESTORE-IMPORT] Parsing library data from backup`);
      const libraryData = await this.absParserService.parseLibraryData(
        session.extractedPath,
        session.selectedLibraryId,
      );

      // Filter audiobooks to only those that can be imported
      const importableItems = libraryData.libraryItems.filter((item) => {
        const savPath = this.mapAbsPathToSavPath(
          item.path,
          session.pathMappings,
        );
        return savPath !== null;
      });

      const totalItems = this.calculateTotalItems(
        importableItems,
        libraryData,
        session,
      );
      let processedItems = 0;

      this.logger.log(
        `[ABS-RESTORE-IMPORT] Importing ${importableItems.length} audiobooks, ` +
          `${libraryData.authors.length} authors, ` +
          `${libraryData.series.length} series`,
      );

      const emitProgress = (
        currentOperation: string,
        itemsProcessed?: number,
      ) => {
        if (itemsProcessed !== undefined) {
          processedItems = itemsProcessed;
        }
        const progress: RestoreProgress = {
          sessionId: session.id,
          state: RestoreSessionState.IMPORTING,
          processedItems,
          totalItems,
          currentOperation,
          errors: [],
          percentage:
            totalItems > 0
              ? Math.round((processedItems / totalItems) * 100)
              : 0,
        };
        this.eventEmitter.emit('restore.progress', progress);
      };

      // Execute import in a database transaction
      await this.db.transaction(async (tx) => {
        // Step 1: Import people (authors and narrators)
        this.logger.log(
          `[ABS-RESTORE-IMPORT] Step 1: Importing authors and narrators`,
        );
        emitProgress('Importing authors and narrators', 0);

        const authorIdMap = new Map<string, string>(); // ABS author ID -> SAV person ID
        const narratorNameMap = new Map<string, string>(); // Narrator name -> SAV person ID

        for (const absAuthor of libraryData.authors) {
          const savPersonId = await this.findOrCreatePerson(
            absAuthor.name,
            'author',
            tx,
          );
          authorIdMap.set(absAuthor.id, savPersonId);
          this.logger.debug(
            `[ABS-RESTORE-IMPORT]   - Author: ${absAuthor.name} (${absAuthor.id} -> ${savPersonId})`,
          );
        }

        // Collect unique narrators
        const uniqueNarrators = new Set<string>();
        for (const book of libraryData.books.values()) {
          if (book.narrators) {
            book.narrators.forEach((n) => uniqueNarrators.add(n));
          }
        }

        for (const narratorName of uniqueNarrators) {
          const savPersonId = await this.findOrCreatePerson(
            narratorName,
            'narrator',
            tx,
          );
          narratorNameMap.set(narratorName, savPersonId);
          this.logger.debug(
            `[ABS-RESTORE-IMPORT]   - Narrator: ${narratorName} -> ${savPersonId}`,
          );
        }

        processedItems += libraryData.authors.length + uniqueNarrators.size;
        emitProgress('Authors and narrators imported', processedItems);

        // Step 2: Import series
        this.logger.log(`[ABS-RESTORE-IMPORT] Step 2: Importing series`);
        emitProgress('Importing series');

        const seriesIdMap = new Map<string, string>(); // ABS series ID -> SAV series ID
        for (const absSeries of libraryData.series) {
          const savSeriesId = await this.findOrCreateSeries(absSeries.name, tx);
          seriesIdMap.set(absSeries.id, savSeriesId);
          this.logger.debug(
            `[ABS-RESTORE-IMPORT]   - Series: ${absSeries.name} (${absSeries.id} -> ${savSeriesId})`,
          );
        }

        processedItems += libraryData.series.length;
        emitProgress('Series imported', processedItems);

        // Step 3: Import genres
        this.logger.log(`[ABS-RESTORE-IMPORT] Step 3: Importing genres`);
        emitProgress('Importing genres');

        const genreIdMap = new Map<string, string>(); // Genre name -> SAV genre ID
        const uniqueGenres = new Set<string>();
        for (const book of libraryData.books.values()) {
          if (book.genres) {
            book.genres.forEach((g) => uniqueGenres.add(g));
          }
        }

        for (const genreName of uniqueGenres) {
          const savGenreId = await this.findOrCreateGenre(genreName, tx);
          genreIdMap.set(genreName, savGenreId);
          this.logger.debug(
            `[ABS-RESTORE-IMPORT]   - Genre: ${genreName} -> ${savGenreId}`,
          );
        }

        processedItems += uniqueGenres.size;
        emitProgress('Genres imported', processedItems);

        // Step 4: Import audiobooks
        this.logger.log(
          `[ABS-RESTORE-IMPORT] Step 4: Importing ${importableItems.length} audiobooks`,
        );
        emitProgress('Importing audiobooks');

        const audiobookIdMap = new Map<string, string>(); // ABS book ID -> SAV audiobook ID
        let importedCount = 0;
        let skippedCount = 0;

        for (const item of importableItems) {
          const book = libraryData.books.get(item.mediaId);
          if (!book) {
            this.logger.warn(
              `[ABS-RESTORE-IMPORT] Skipping ${item.title}: no book data found`,
            );
            skippedCount++;
            continue;
          }

          const savPath = this.mapAbsPathToSavPath(
            item.path,
            session.pathMappings,
          );
          if (!savPath) {
            this.logger.warn(
              `[ABS-RESTORE-IMPORT] Skipping ${item.title}: no path mapping`,
            );
            skippedCount++;
            continue;
          }

          try {
            const savAudiobookId = await this.importAudiobook(
              item,
              book,
              savPath,
              libraryData,
              authorIdMap,
              narratorNameMap,
              seriesIdMap,
              genreIdMap,
              session,
              tx,
            );

            audiobookIdMap.set(book.id, savAudiobookId);
            importedCount++;
            this.logger.debug(
              `[ABS-RESTORE-IMPORT]   - [${importedCount}/${importableItems.length}] ${item.title} (${book.id} -> ${savAudiobookId})`,
            );
          } catch (error) {
            this.logger.error(
              `[ABS-RESTORE-IMPORT] Failed to import ${item.title}:`,
              error,
            );
            skippedCount++;
          }

          processedItems++;
          if (importedCount % 10 === 0) {
            emitProgress(
              `Importing audiobooks (${importedCount}/${importableItems.length})`,
              processedItems,
            );
          }
        }

        emitProgress(
          `Imported ${importedCount} audiobooks (${skippedCount} skipped)`,
          processedItems,
        );

        // Step 5: Import covers
        if (session.options.importCovers) {
          this.logger.log(
            `[ABS-RESTORE-IMPORT] Step 5: Importing cover images`,
          );
          emitProgress('Importing cover images');

          let coverCount = 0;
          for (const [absBookId, savAudiobookId] of audiobookIdMap.entries()) {
            try {
              await this.copyCoverFile(
                absBookId,
                savAudiobookId,
                session.extractedPath!,
              );
              coverCount++;
            } catch (error) {
              this.logger.debug(
                `[ABS-RESTORE-IMPORT] No cover found for book ${absBookId}: ${error}`,
              );
            }
          }

          this.logger.log(
            `[ABS-RESTORE-IMPORT] Imported ${coverCount} cover images`,
          );
          processedItems += coverCount;
          emitProgress('Cover images imported', processedItems);
        }

        // Step 6: Import author images
        if (session.options.importAuthorImages) {
          this.logger.log(
            `[ABS-RESTORE-IMPORT] Step 6: Importing author images`,
          );
          emitProgress('Importing author images');

          let imageCount = 0;
          for (const [absAuthorId, savPersonId] of authorIdMap.entries()) {
            try {
              await this.copyAuthorImage(
                absAuthorId,
                savPersonId,
                session.extractedPath!,
              );
              imageCount++;
            } catch (error) {
              this.logger.debug(
                `[ABS-RESTORE-IMPORT] No image found for author ${absAuthorId}: ${error}`,
              );
            }
          }

          this.logger.log(
            `[ABS-RESTORE-IMPORT] Imported ${imageCount} author images`,
          );
          processedItems += imageCount;
          emitProgress('Author images imported', processedItems);
        }

        // Step 7: Import progress
        if (session.options.importProgress) {
          this.logger.log(
            `[ABS-RESTORE-IMPORT] Step 7: Importing user progress`,
          );
          emitProgress('Importing user progress');

          const mappedUsers = new Map(
            session.userMappings
              .filter((m) => m.savUserId !== null)
              .map((m) => [m.absUserId, m.savUserId!]),
          );

          let progressCount = 0;
          for (const absProgress of libraryData.mediaProgresses) {
            const savUserId = mappedUsers.get(absProgress.userId);
            const savAudiobookId = audiobookIdMap.get(absProgress.mediaItemId);

            if (!savUserId) {
              this.logger.debug(
                `[ABS-RESTORE-IMPORT] Skipping progress for unmapped user ${absProgress.userId}`,
              );
              continue;
            }

            if (!savAudiobookId) {
              this.logger.debug(
                `[ABS-RESTORE-IMPORT] Skipping progress for unimported audiobook ${absProgress.mediaItemId}`,
              );
              continue;
            }

            try {
              await this.importProgress(
                absProgress,
                savUserId,
                savAudiobookId,
                tx,
              );
              progressCount++;
            } catch (error) {
              this.logger.error(
                `[ABS-RESTORE-IMPORT] Failed to import progress for user ${savUserId}, audiobook ${savAudiobookId}:`,
                error,
              );
            }
          }

          this.logger.log(
            `[ABS-RESTORE-IMPORT] Imported ${progressCount} progress records`,
          );
          processedItems += progressCount;
          emitProgress('User progress imported', processedItems);
        }
      });

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      this.logger.log(
        `[ABS-RESTORE-IMPORT] Import completed in ${duration} seconds`,
      );

      this.eventEmitter.emit('restore.completed', { sessionId: session.id });
    } catch (error) {
      this.logger.error(`[ABS-RESTORE-IMPORT] Import failed:`, error);

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.eventEmitter.emit('restore.failed', {
        sessionId: session.id,
        error: errorMessage,
      });

      throw error;
    }
  }

  /**
   * Calculate total items to process for progress tracking
   */
  private calculateTotalItems(
    importableItems: any[],
    libraryData: LibraryData,
    session: RestoreSession,
  ): number {
    let total = 0;

    // Authors + narrators
    const uniqueNarrators = new Set<string>();
    for (const book of libraryData.books.values()) {
      if (book.narrators) {
        book.narrators.forEach((n) => uniqueNarrators.add(n));
      }
    }
    total += libraryData.authors.length + uniqueNarrators.size;

    // Series
    total += libraryData.series.length;

    // Genres
    const uniqueGenres = new Set<string>();
    for (const book of libraryData.books.values()) {
      if (book.genres) {
        book.genres.forEach((g) => uniqueGenres.add(g));
      }
    }
    total += uniqueGenres.size;

    // Audiobooks
    total += importableItems.length;

    // Covers (estimate based on importable items)
    if (session.options.importCovers) {
      total += importableItems.length;
    }

    // Author images
    if (session.options.importAuthorImages) {
      total += libraryData.authors.length;
    }

    // Progress records
    if (session.options.importProgress) {
      const mappedUserIds = new Set(
        session.userMappings
          .filter((m) => m.savUserId !== null)
          .map((m) => m.absUserId),
      );
      total += libraryData.mediaProgresses.filter((p) =>
        mappedUserIds.has(p.userId),
      ).length;
    }

    return total;
  }

  /**
   * Maps an ABS path to a SAV path using the configured path mappings
   */
  private mapAbsPathToSavPath(
    absPath: string,
    mappings: PathMapping[],
  ): string | null {
    for (const mapping of mappings) {
      if (absPath.startsWith(mapping.absPath)) {
        const relativePath = absPath.substring(mapping.absPath.length);
        return path.join(mapping.savPath, relativePath);
      }
    }
    return null;
  }

  /**
   * Find or create a person (author or narrator)
   */
  private async findOrCreatePerson(
    name: string,
    type: 'author' | 'narrator',
    tx: any,
  ): Promise<string> {
    const trimmedName = name.trim();

    // Try to find existing person
    const existing = await tx
      .select()
      .from(audiobooksSchema.people)
      .where(eq(audiobooksSchema.people.name, trimmedName))
      .limit(1);

    if (existing.length > 0) {
      return existing[0].id;
    }

    // Create new person
    const [newPerson] = await tx
      .insert(audiobooksSchema.people)
      .values({ name: trimmedName })
      .returning();

    return newPerson.id;
  }

  /**
   * Find or create a series
   */
  private async findOrCreateSeries(name: string, tx: any): Promise<string> {
    const trimmedName = name.trim();

    // Try to find existing series
    const existing = await tx
      .select()
      .from(audiobooksSchema.series)
      .where(eq(audiobooksSchema.series.name, trimmedName))
      .limit(1);

    if (existing.length > 0) {
      return existing[0].id;
    }

    // Create new series
    const [newSeries] = await tx
      .insert(audiobooksSchema.series)
      .values({ name: trimmedName })
      .returning();

    return newSeries.id;
  }

  /**
   * Find or create a genre
   */
  private async findOrCreateGenre(name: string, tx: any): Promise<string> {
    const trimmedName = name.trim();

    // Try to find existing genre
    const existing = await tx
      .select()
      .from(audiobooksSchema.genres)
      .where(eq(audiobooksSchema.genres.name, trimmedName))
      .limit(1);

    if (existing.length > 0) {
      return existing[0].id;
    }

    // Create new genre
    const [newGenre] = await tx
      .insert(audiobooksSchema.genres)
      .values({ name: trimmedName })
      .returning();

    return newGenre.id;
  }

  /**
   * Import a single audiobook with all its related data
   */
  private async importAudiobook(
    item: ABSLibraryItem,
    book: ABSBook,
    savPath: string,
    libraryData: LibraryData,
    authorIdMap: Map<string, string>,
    narratorNameMap: Map<string, string>,
    seriesIdMap: Map<string, string>,
    genreIdMap: Map<string, string>,
    session: RestoreSession,
    tx: any,
  ): Promise<string> {
    // Check if audiobook already exists
    const existing = await tx
      .select()
      .from(audiobooksSchema.audiobooks)
      .where(eq(audiobooksSchema.audiobooks.filePath, savPath))
      .limit(1);

    let audiobookId: string;

    if (existing.length > 0) {
      if (!session.options.overwriteExisting) {
        this.logger.debug(
          `[ABS-RESTORE-IMPORT] Skipping existing audiobook at path: ${savPath}`,
        );
        return existing[0].id;
      }

      // Update existing audiobook
      audiobookId = existing[0].id;
      await tx
        .update(audiobooksSchema.audiobooks)
        .set({
          title: book.title,
          subtitle: book.subtitle,
          description: book.description,
          publisher: book.publisher,
          publishedDate: book.publishedDate || null,
          language: book.language,
          isbn: book.isbn,
          asin: book.asin,
          duration: book.duration,
          isExplicit: book.explicit || false,
          status: 'available',
        })
        .where(eq(audiobooksSchema.audiobooks.id, audiobookId));

      // Delete existing relations (will be recreated below)
      await tx
        .delete(audiobooksSchema.audiobookAuthors)
        .where(eq(audiobooksSchema.audiobookAuthors.audiobookId, audiobookId));
      await tx
        .delete(audiobooksSchema.audiobookNarrators)
        .where(
          eq(audiobooksSchema.audiobookNarrators.audiobookId, audiobookId),
        );
      await tx
        .delete(audiobooksSchema.audiobookSeries)
        .where(eq(audiobooksSchema.audiobookSeries.audiobookId, audiobookId));
      await tx
        .delete(audiobooksSchema.audiobookGenres)
        .where(eq(audiobooksSchema.audiobookGenres.audiobookId, audiobookId));
      await tx
        .delete(audiobooksSchema.chapters)
        .where(eq(audiobooksSchema.chapters.audiobookId, audiobookId));
      await tx
        .delete(audiobooksSchema.audiobookFiles)
        .where(eq(audiobooksSchema.audiobookFiles.audiobookId, audiobookId));
    } else {
      // Create new audiobook
      const [newAudiobook] = await tx
        .insert(audiobooksSchema.audiobooks)
        .values({
          title: book.title,
          subtitle: book.subtitle,
          description: book.description,
          publisher: book.publisher,
          publishedDate: book.publishedDate || null,
          language: book.language,
          isbn: book.isbn,
          asin: book.asin,
          duration: book.duration,
          filePath: savPath,
          isExplicit: book.explicit || false,
          status: 'available',
        })
        .returning();

      audiobookId = newAudiobook.id;
    }

    // Link authors
    const bookAuthors = libraryData.bookAuthors.filter(
      (ba) => ba.bookId === book.id,
    );
    for (const bookAuthor of bookAuthors) {
      const savPersonId = authorIdMap.get(bookAuthor.authorId);
      if (savPersonId) {
        await tx.insert(audiobooksSchema.audiobookAuthors).values({
          audiobookId,
          personId: savPersonId,
          order: 0, // ABS doesn't track author order explicitly
        });
      }
    }

    // Link narrators
    if (book.narrators) {
      for (let i = 0; i < book.narrators.length; i++) {
        const narratorName = book.narrators[i];
        const savPersonId = narratorNameMap.get(narratorName);
        if (savPersonId) {
          await tx.insert(audiobooksSchema.audiobookNarrators).values({
            audiobookId,
            personId: savPersonId,
            order: i,
          });
        }
      }
    }

    // Link series
    const bookSeriesList = libraryData.bookSeries.filter(
      (bs) => bs.bookId === book.id,
    );
    for (const bookSeries of bookSeriesList) {
      const savSeriesId = seriesIdMap.get(bookSeries.seriesId);
      if (savSeriesId) {
        await tx.insert(audiobooksSchema.audiobookSeries).values({
          audiobookId,
          seriesId: savSeriesId,
          order: bookSeries.sequence || '0',
        });
      }
    }

    // Link genres
    if (book.genres) {
      for (const genreName of book.genres) {
        const savGenreId = genreIdMap.get(genreName);
        if (savGenreId) {
          await tx.insert(audiobooksSchema.audiobookGenres).values({
            audiobookId,
            genreId: savGenreId,
          });
        }
      }
    }

    // Import audio files
    if (book.audioFiles) {
      for (const audioFile of book.audioFiles) {
        await tx.insert(audiobooksSchema.audiobookFiles).values({
          audiobookId,
          filePath: audioFile.metadata.relPath,
          fileName: audioFile.metadata.filename,
          order: audioFile.index,
          duration: Math.floor(audioFile.duration),
          format: audioFile.format || audioFile.metadata.ext.replace('.', ''),
          bitrate: audioFile.bitRate,
          sizeBytes: audioFile.metadata.size,
        });
      }
    }

    // Import chapters
    if (book.chapters) {
      for (let i = 0; i < book.chapters.length; i++) {
        const chapter = book.chapters[i];
        await tx.insert(audiobooksSchema.chapters).values({
          audiobookId,
          title: chapter.title,
          startTime: Math.floor(chapter.start),
          endTime: chapter.end ? Math.floor(chapter.end) : null,
          order: i + 1,
          source: 'embedded',
        });
      }
    }

    return audiobookId;
  }

  /**
   * Copy a cover file from the backup to app data
   */
  private async copyCoverFile(
    absBookId: string,
    savAudiobookId: string,
    extractedPath: string,
  ): Promise<void> {
    const sourcePath = await this.absParserService.getCoverPath(
      extractedPath,
      absBookId,
    );
    if (!sourcePath) {
      throw new Error('No cover found in backup');
    }

    const destPath = this.appDataService.getAudiobookCoverPath(savAudiobookId);

    // Copy the file
    await fs.copyFile(sourcePath, destPath);

    // Update audiobook cover reference
    await this.db
      .update(audiobooksSchema.audiobooks)
      .set({
        coverUrl: `${savAudiobookId}.jpg`,
        coverSource: 'uploaded',
      })
      .where(eq(audiobooksSchema.audiobooks.id, savAudiobookId));
  }

  /**
   * Copy an author image from the backup to app data
   */
  private async copyAuthorImage(
    absAuthorId: string,
    savPersonId: string,
    extractedPath: string,
  ): Promise<void> {
    const sourcePath = await this.absParserService.getAuthorImagePath(
      extractedPath,
      absAuthorId,
    );
    if (!sourcePath) {
      throw new Error('No author image found in backup');
    }

    const destPath = this.appDataService.getPersonImagePath(savPersonId);

    // Copy the file
    await fs.copyFile(sourcePath, destPath);

    // Update person image reference
    await this.db
      .update(audiobooksSchema.people)
      .set({
        imageUrl: `${savPersonId}.jpg`,
      })
      .where(eq(audiobooksSchema.people.id, savPersonId));
  }

  /**
   * Import a user progress record
   */
  private async importProgress(
    absProgress: ABSMediaProgress,
    savUserId: string,
    savAudiobookId: string,
    tx: any,
  ): Promise<void> {
    // Check if progress already exists
    const existing = await tx
      .select()
      .from(progressSchema.userAudiobookProgress)
      .where(
        and(
          eq(progressSchema.userAudiobookProgress.userId, savUserId),
          eq(progressSchema.userAudiobookProgress.audiobookId, savAudiobookId),
        ),
      )
      .limit(1);

    const progressData = {
      userId: savUserId,
      audiobookId: savAudiobookId,
      currentPosition: Math.floor(absProgress.currentTime),
      completed: absProgress.isFinished,
      completedAt: absProgress.finishedAt
        ? new Date(absProgress.finishedAt)
        : null,
      isHidden: absProgress.hideFromContinueListening,
    };

    if (existing.length > 0) {
      // Update existing progress
      await tx
        .update(progressSchema.userAudiobookProgress)
        .set(progressData)
        .where(eq(progressSchema.userAudiobookProgress.id, existing[0].id));
    } else {
      // Create new progress
      await tx
        .insert(progressSchema.userAudiobookProgress)
        .values(progressData);
    }
  }
}
