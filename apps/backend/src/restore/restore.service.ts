import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import * as unzipper from 'unzipper';
import { createReadStream } from 'fs';
import { AbsParserService, ParsedBackup } from './abs-parser.service';
import { AppDataService } from '../app-data/app-data.service';
import {
  RestoreSession,
  RestoreSessionState,
  PathMapping,
  UserMapping,
  RestoreOptions,
  ImportPreview,
  AudiobookPreviewItem,
} from './types/restore-session.types';

@Injectable()
export class RestoreService {
  private readonly logger = new Logger('RestoreService');
  private readonly sessions = new Map<string, RestoreSession>();
  private readonly parsedBackups = new Map<string, ParsedBackup>();

  constructor(
    private readonly absParserService: AbsParserService,
    private readonly appDataService: AppDataService,
  ) {}

  /**
   * Creates a new restore session by extracting and parsing the uploaded backup file
   */
  async createSession(
    uploadedFile: Express.Multer.File,
  ): Promise<RestoreSession> {
    const sessionId = randomUUID();
    this.logger.log(`[ABS-RESTORE] Starting backup upload`);
    this.logger.log(
      `[ABS-RESTORE] Received file: ${uploadedFile.originalname} (${(uploadedFile.size / 1024 / 1024).toFixed(2)}MB)`,
    );

    // Create temp directory for this session
    const extractedPath = this.appDataService.getTempSessionPath(sessionId);
    await fs.mkdir(extractedPath, { recursive: true });
    this.logger.log(`[ABS-RESTORE] Extracting to ${extractedPath}`);

    // Write buffer to temp file (FileInterceptor uses memory storage by default)
    const tempZipPath = path.join(extractedPath, 'backup.zip');
    await fs.writeFile(tempZipPath, uploadedFile.buffer);

    // Initialize session in 'uploading' state
    const session: RestoreSession = {
      id: sessionId,
      state: RestoreSessionState.UPLOADING,
      startedAt: new Date(),
      totalItems: 0,
      processedItems: 0,
      pathMappings: [],
      userMappings: [],
      options: {
        importProgress: true,
        importCovers: true,
        importAuthorImages: true,
        overwriteExisting: false,
        lockMetadata: false,
      },
      extractedPath,
    };
    this.sessions.set(sessionId, session);

    try {
      // Extract ZIP file
      await this.extractZipFile(tempZipPath, extractedPath);
      this.logger.log(`[ABS-RESTORE] Extraction complete`);

      // Update state to parsing
      session.state = RestoreSessionState.PARSING;

      // Parse backup details
      const parsedBackup =
        await this.absParserService.parseBackupDetails(extractedPath);
      this.parsedBackups.set(sessionId, parsedBackup);

      this.logger.log(
        `[ABS-RESTORE] Backup version: ${parsedBackup.details.version}, created: ${new Date(parsedBackup.details.timestamp).toISOString()}`,
      );
      this.logger.log(
        `[ABS-RESTORE] Found ${parsedBackup.libraries.length} libraries`,
      );

      for (const library of parsedBackup.libraries) {
        this.logger.log(
          `[ABS-RESTORE]   - "${library.name}" (id: ${library.id})`,
        );
      }

      // Update state to mapping (ready for user to configure)
      session.state = RestoreSessionState.MAPPING;
      this.logger.log(
        `[ABS-RESTORE] Session ${sessionId} ready for library selection`,
      );

      // Clean up temp ZIP file
      try {
        await fs.unlink(tempZipPath);
      } catch (error) {
        this.logger.warn(`Failed to delete temp ZIP file: ${error}`);
      }

      return session;
    } catch (error) {
      session.state = RestoreSessionState.FAILED;
      session.errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`[ABS-RESTORE] Session ${sessionId} failed:`, error);

      // Clean up on failure
      await this.cleanupSession(sessionId);
      throw error;
    }
  }

  /**
   * Extracts a ZIP file to the specified destination
   */
  private async extractZipFile(
    zipPath: string,
    destination: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      createReadStream(zipPath)
        .pipe(unzipper.Extract({ path: destination }))
        .on('error', (error) => {
          this.logger.error('[ABS-RESTORE] Extraction error:', error);
          reject(error);
        })
        .on('finish', () => {
          resolve();
        });
    });
  }

  /**
   * Gets a restore session by ID
   */
  getSession(sessionId: string): RestoreSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Gets the parsed backup details for a session
   */
  getBackupDetails(sessionId: string): ParsedBackup | undefined {
    return this.parsedBackups.get(sessionId);
  }

  /**
   * Validates that a session exists and is in the expected state
   */
  private validateSession(
    sessionId: string,
    allowedStates: RestoreSessionState[],
  ): RestoreSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundException(`Restore session ${sessionId} not found`);
    }

    if (!allowedStates.includes(session.state)) {
      throw new BadRequestException(
        `Invalid session state. Current: ${session.state}, Expected: ${allowedStates.join(' or ')}`,
      );
    }

    return session;
  }

  /**
   * Sets the selected library for the restore session
   */
  async setSelectedLibrary(
    sessionId: string,
    libraryId: string,
  ): Promise<void> {
    const session = this.validateSession(sessionId, [
      RestoreSessionState.MAPPING,
    ]);

    this.logger.log(
      `[ABS-RESTORE] Session ${sessionId}: Selected library ${libraryId}`,
    );
    session.selectedLibraryId = libraryId;

    // Parse library data to get initial counts
    const libraryData = await this.absParserService.parseLibraryData(
      session.extractedPath!,
      libraryId,
    );

    session.totalItems = libraryData.libraryItems.length;
    this.logger.log(
      `[ABS-RESTORE] Session ${sessionId}: Library has ${session.totalItems} audiobooks`,
    );
  }

  /**
   * Sets path mappings for the restore session
   */
  setPathMappings(sessionId: string, mappings: PathMapping[]): void {
    const session = this.validateSession(sessionId, [
      RestoreSessionState.MAPPING,
      RestoreSessionState.PREVIEWING,
    ]);

    this.logger.log(
      `[ABS-RESTORE] Session ${sessionId}: Setting path mappings`,
    );
    for (const mapping of mappings) {
      this.logger.log(
        `[ABS-RESTORE]   - ABS: ${mapping.absPath} -> SAV: ${mapping.savPath}`,
      );
    }

    session.pathMappings = mappings;
  }

  /**
   * Sets user mappings for the restore session
   */
  setUserMappings(sessionId: string, mappings: UserMapping[]): void {
    const session = this.validateSession(sessionId, [
      RestoreSessionState.MAPPING,
      RestoreSessionState.PREVIEWING,
    ]);

    this.logger.log(
      `[ABS-RESTORE] Session ${sessionId}: Setting user mappings`,
    );
    for (const mapping of mappings) {
      if (mapping.savUserId) {
        this.logger.log(
          `[ABS-RESTORE]   - ABS user ${mapping.absUserId} -> SAV user ${mapping.savUserId}`,
        );
      } else {
        this.logger.log(
          `[ABS-RESTORE]   - ABS user ${mapping.absUserId} -> SKIP`,
        );
      }
    }

    session.userMappings = mappings;
  }

  /**
   * Sets restore options for the session
   */
  setOptions(sessionId: string, options: Partial<RestoreOptions>): void {
    const session = this.validateSession(sessionId, [
      RestoreSessionState.MAPPING,
      RestoreSessionState.PREVIEWING,
    ]);

    this.logger.log(
      `[ABS-RESTORE] Session ${sessionId}: Setting restore options`,
    );
    session.options = { ...session.options, ...options };
    this.logger.log(
      `[ABS-RESTORE]   - Import progress: ${session.options.importProgress}`,
    );
    this.logger.log(
      `[ABS-RESTORE]   - Import covers: ${session.options.importCovers}`,
    );
    this.logger.log(
      `[ABS-RESTORE]   - Import author images: ${session.options.importAuthorImages}`,
    );
    this.logger.log(
      `[ABS-RESTORE]   - Overwrite existing: ${session.options.overwriteExisting}`,
    );
  }

  /**
   * Generates an import preview showing what will be imported
   */
  async generatePreview(sessionId: string): Promise<ImportPreview> {
    const session = this.validateSession(sessionId, [
      RestoreSessionState.MAPPING,
      RestoreSessionState.PREVIEWING,
    ]);

    if (!session.selectedLibraryId) {
      throw new BadRequestException('No library selected');
    }

    if (session.pathMappings.length === 0) {
      throw new BadRequestException('No path mappings configured');
    }

    this.logger.log(`[ABS-RESTORE] Session ${sessionId}: Generating preview`);
    session.state = RestoreSessionState.PREVIEWING;

    // Parse library data
    const libraryData = await this.absParserService.parseLibraryData(
      session.extractedPath!,
      session.selectedLibraryId,
    );

    // Validate file paths and build preview
    const audiobooksToImport: AudiobookPreviewItem[] = [];
    const audiobooksToSkip: AudiobookPreviewItem[] = [];

    for (const item of libraryData.libraryItems) {
      const book = libraryData.books.get(item.mediaId);
      if (!book) {
        continue;
      }

      // Find matching path mapping
      const mapping = this.findPathMapping(item.path, session.pathMappings);
      if (!mapping) {
        audiobooksToSkip.push({
          title: item.title,
          author: item.authorNamesFirstLast || 'Unknown',
          absPath: item.path,
          savPath: '',
          found: false,
          reason: 'No matching path mapping',
        });
        continue;
      }

      // Convert ABS path to SAV path
      const savPath = this.convertPath(item.path, mapping);

      // Check if directory exists
      let found = false;
      let reason: string | undefined;

      try {
        const stats = await fs.stat(savPath);
        if (stats.isDirectory()) {
          // Check if audio files exist
          const audioFiles = book.audioFiles || [];
          if (audioFiles.length === 0) {
            found = false;
            reason = 'No audio files in backup metadata';
          } else {
            // Check first audio file as validation
            const firstAudioFile = audioFiles[0];
            const audioFilePath = path.join(
              savPath,
              firstAudioFile.metadata.filename,
            );
            try {
              await fs.access(audioFilePath);
              found = true;
            } catch {
              found = false;
              reason = `Audio file not found: ${firstAudioFile.metadata.filename}`;
            }
          }
        } else {
          found = false;
          reason = 'Path exists but is not a directory';
        }
      } catch {
        found = false;
        reason = 'Directory not found';
      }

      const previewItem: AudiobookPreviewItem = {
        title: item.title,
        author: item.authorNamesFirstLast || 'Unknown',
        absPath: item.path,
        savPath,
        found,
        reason,
      };

      if (found) {
        audiobooksToImport.push(previewItem);
      } else {
        audiobooksToSkip.push(previewItem);
      }
    }

    // Count unique authors and narrators
    const uniqueAuthors = new Set(libraryData.authors.map((a) => a.id));
    const uniqueNarrators = new Set<string>();
    for (const book of libraryData.books.values()) {
      if (book.narrators) {
        book.narrators.forEach((n) => uniqueNarrators.add(n));
      }
    }

    // Count chapters
    let totalChapters = 0;
    for (const book of libraryData.books.values()) {
      totalChapters += book.chapters?.length || 0;
    }

    // Count covers with images
    let coversToImport = 0;
    if (session.options.importCovers) {
      for (const item of libraryData.libraryItems) {
        const book = libraryData.books.get(item.mediaId);
        if (book) {
          const coverPath = await this.absParserService.getCoverPath(
            session.extractedPath!,
            book.id,
          );
          if (coverPath) {
            coversToImport++;
          }
        }
      }
    }

    // Count author images
    let authorImagesToImport = 0;
    if (session.options.importAuthorImages) {
      for (const author of libraryData.authors) {
        const imagePath = await this.absParserService.getAuthorImagePath(
          session.extractedPath!,
          author.id,
        );
        if (imagePath) {
          authorImagesToImport++;
        }
      }
    }

    // Count user mappings
    const mappedUsers = session.userMappings.filter(
      (m) => m.savUserId !== null,
    );
    const skippedUsers = session.userMappings.filter(
      (m) => m.savUserId === null,
    );

    // Count progress records for mapped users
    let progressRecordsToImport = 0;
    if (session.options.importProgress) {
      const mappedUserIds = new Set(mappedUsers.map((m) => m.absUserId));
      progressRecordsToImport = libraryData.mediaProgresses.filter((p) =>
        mappedUserIds.has(p.userId),
      ).length;
    }

    // Count genres
    const uniqueGenres = new Set<string>();
    for (const book of libraryData.books.values()) {
      if (book.genres) {
        book.genres.forEach((g) => uniqueGenres.add(g));
      }
    }

    // Generate warnings
    const warnings: string[] = [];
    if (audiobooksToSkip.length > 0) {
      warnings.push(
        `${audiobooksToSkip.length} audiobook${audiobooksToSkip.length === 1 ? '' : 's'} will be skipped (files not found)`,
      );
    }
    if (skippedUsers.length > 0) {
      warnings.push(
        `${skippedUsers.length} ABS user${skippedUsers.length === 1 ? '' : 's'} will be skipped (not mapped)`,
      );
    }
    if (!session.options.importProgress) {
      warnings.push('User progress will not be imported');
    }
    if (!session.options.importCovers) {
      warnings.push('Cover images will not be imported');
    }
    if (!session.options.importAuthorImages) {
      warnings.push('Author images will not be imported');
    }

    const preview: ImportPreview = {
      audiobooksToImport: {
        count: audiobooksToImport.length,
        sample: audiobooksToImport.slice(0, 10),
      },
      audiobooksToSkip: {
        count: audiobooksToSkip.length,
        sample: audiobooksToSkip.slice(0, 10),
      },
      authorsToImport: uniqueAuthors.size,
      narratorsToImport: uniqueNarrators.size,
      seriesToImport: libraryData.series.length,
      genresToImport: uniqueGenres.size,
      chaptersToImport: totalChapters,
      usersToMap: {
        total: libraryData.users.length,
        mapped: mappedUsers.length,
        skipped: skippedUsers.length,
      },
      progressRecordsToImport,
      coversToImport,
      authorImagesToImport,
      warnings,
    };

    this.logger.log(`[ABS-RESTORE] Session ${sessionId}: Preview generated`);
    this.logger.log(`[ABS-RESTORE] Import plan:`);
    this.logger.log(
      `[ABS-RESTORE]   - ${preview.audiobooksToImport.count} audiobooks (${preview.audiobooksToSkip.count} skipped)`,
    );
    this.logger.log(
      `[ABS-RESTORE]   - ${preview.authorsToImport} authors, ${preview.narratorsToImport} narrators`,
    );
    this.logger.log(`[ABS-RESTORE]   - ${preview.seriesToImport} series`);
    this.logger.log(`[ABS-RESTORE]   - ${preview.genresToImport} genres`);
    this.logger.log(`[ABS-RESTORE]   - ${preview.chaptersToImport} chapters`);
    this.logger.log(
      `[ABS-RESTORE]   - ${preview.progressRecordsToImport} progress records for ${preview.usersToMap.mapped} mapped users`,
    );
    this.logger.log(`[ABS-RESTORE]   - ${preview.coversToImport} cover images`);
    this.logger.log(
      `[ABS-RESTORE]   - ${preview.authorImagesToImport} author images`,
    );

    return preview;
  }

  /**
   * Finds the matching path mapping for an ABS path
   */
  private findPathMapping(
    absPath: string,
    mappings: PathMapping[],
  ): PathMapping | null {
    for (const mapping of mappings) {
      if (absPath.startsWith(mapping.absPath)) {
        return mapping;
      }
    }
    return null;
  }

  /**
   * Converts an ABS path to a SAV path using the mapping
   */
  private convertPath(absPath: string, mapping: PathMapping): string {
    const relativePath = absPath.substring(mapping.absPath.length);
    return path.join(mapping.savPath, relativePath);
  }

  /**
   * Cancels a restore session and cleans up temporary files
   */
  async cancelSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundException(`Restore session ${sessionId} not found`);
    }

    this.logger.log(`[ABS-RESTORE] Session ${sessionId}: Cancelling`);

    await this.cleanupSession(sessionId);

    this.sessions.delete(sessionId);
    this.parsedBackups.delete(sessionId);
    this.logger.log(
      `[ABS-RESTORE] Session ${sessionId}: Cancelled and cleaned up`,
    );
  }

  /**
   * Cleans up temporary files for a session
   */
  private async cleanupSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.extractedPath) {
      return;
    }

    try {
      await fs.rm(session.extractedPath, { recursive: true, force: true });
      this.logger.log(
        `[ABS-RESTORE] Cleaned up temp directory: ${session.extractedPath}`,
      );
    } catch (error) {
      this.logger.warn(
        `[ABS-RESTORE] Failed to clean up temp directory ${session.extractedPath}:`,
        error,
      );
    }
  }
}
