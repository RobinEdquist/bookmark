// apps/backend/src/library-watcher/media-importer.service.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as path from 'path';
import * as fs from 'fs/promises';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as audiobooksSchema from '../audiobooks/schema';
import * as ebooksSchema from '../ebooks/schema';
import {
  EmbeddedMetadataProvider,
  AudioFileInfo,
} from './metadata/embedded-metadata.provider';
import { EbookMetadataProvider } from './metadata/ebook-metadata.provider';
import { ImportErrorsService } from '../import-errors/import-errors.service';
import { HardcoverService } from '../hardcover/hardcover.service';
import { AppEventsService } from '../events/app-events.service';
import { WsEventsService } from '../events/ws-events.service';
import { AudiobookUnit, EbookUnit } from './media-detector.service';
import { RequestsService } from '../requests';
import { AppSettingsService } from '../app-settings/app-settings.service';

@Injectable()
export class MediaImporterService {
  private readonly logger = new Logger(MediaImporterService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: NodePgDatabase<typeof audiobooksSchema & typeof ebooksSchema>,
    private audioMetadataProvider: EmbeddedMetadataProvider,
    private ebookMetadataProvider: EbookMetadataProvider,
    private importErrorsService: ImportErrorsService,
    private hardcoverService: HardcoverService,
    private appEvents: AppEventsService,
    private wsEvents: WsEventsService,
    private requestsService: RequestsService,
    private appSettingsService: AppSettingsService,
  ) {}

  // ===== AUDIOBOOK IMPORT =====

  async importAudiobook(
    unit: AudiobookUnit,
    libraryPath: string,
  ): Promise<string | null> {
    const primaryFile = unit.files[0];
    const relativeUnitPath = path.relative(libraryPath, unit.path);

    try {
      // Check if already exists
      const existing = await this.db
        .select({ id: audiobooksSchema.audiobooks.id })
        .from(audiobooksSchema.audiobooks)
        .where(eq(audiobooksSchema.audiobooks.filePath, relativeUnitPath))
        .limit(1);

      if (existing.length > 0) {
        this.logger.debug(`Audiobook already exists at ${unit.path}`);
        return existing[0].id;
      }

      // Check if quarantined
      if (await this.importErrorsService.isQuarantined(unit.path)) {
        this.logger.debug(`Skipping quarantined path: ${unit.path}`);
        return null;
      }

      // Extract all metadata from primary file in one pass (metadata, fileInfo, chapters)
      // This avoids parsing the file 3 times
      const primaryData =
        await this.audioMetadataProvider.extractFullMetadata(primaryFile);
      const {
        metadata,
        fileInfo: primaryFileInfo,
        chapters: primaryChapters,
      } = primaryData;

      // Determine cover source
      let coverSource: 'embedded' | undefined = undefined;
      const coverUrl: string | undefined = undefined;

      if (metadata.hasEmbeddedCover) {
        coverSource = 'embedded';
      }
      // Note: Filesystem covers are no longer imported as 'filesystem'.
      // They will be migrated to app data storage by a separate migration task.

      // Build file info array - primary file is already parsed, only parse additional files
      const fileInfos: AudioFileInfo[] = [primaryFileInfo];
      if (unit.files.length > 1) {
        // For multi-file audiobooks, get info for remaining files
        for (let i = 1; i < unit.files.length; i++) {
          const info = await this.audioMetadataProvider.getFileInfo(
            unit.files[i],
          );
          fileInfos.push(info);
        }
      }

      const totalDuration = fileInfos.reduce((sum, f) => sum + f.duration, 0);
      // For multi-file audiobooks, prefer folder name (most reliable) over metadata
      // For single-file, prefer track title from metadata
      const title =
        unit.type === 'multi-file'
          ? this.inferTitleFromPath(unit.path, unit.type) ||
            metadata.album ||
            metadata.title ||
            'Unknown Audiobook'
          : metadata.title || this.inferTitleFromPath(unit.path, unit.type);
      const publishedDate = this.normalizePublishedDate(metadata.publishedDate);

      // Create audiobook record
      const [audiobook] = await this.db
        .insert(audiobooksSchema.audiobooks)
        .values({
          title: this.sanitizeText(title) ?? title,
          subtitle: this.sanitizeText(metadata.subtitle),
          description: this.sanitizeText(metadata.description),
          publisher: this.sanitizeText(metadata.publisher),
          language: metadata.language,
          publishedDate,
          duration: totalDuration,
          coverSource,
          coverUrl,
          filePath: relativeUnitPath,
          status: 'available',
        })
        .returning();

      // Create file records in a single batch insert
      if (fileInfos.length > 0) {
        await this.db.insert(audiobooksSchema.audiobookFiles).values(
          fileInfos.map((fileInfo, i) => ({
            audiobookId: audiobook.id,
            filePath: path.relative(libraryPath, fileInfo.filePath),
            fileName: fileInfo.fileName,
            order: i,
            duration: fileInfo.duration,
            format: fileInfo.format,
            bitrate: fileInfo.bitrate,
            sampleRate: fileInfo.sampleRate,
            sizeBytes: fileInfo.sizeBytes,
          })),
        );
      }

      // Use chapters from the primary file extraction (already parsed)
      let chapters = primaryChapters;
      let chapterSource: 'embedded' | 'external' = 'embedded';

      if (
        chapters.length === 0 &&
        unit.type === 'multi-file' &&
        fileInfos.length > 1
      ) {
        chapters = this.generateChaptersFromFiles(fileInfos);
        chapterSource = 'external';
      }

      // Create chapter records in a single batch insert
      if (chapters.length > 0) {
        await this.db.insert(audiobooksSchema.chapters).values(
          chapters.map((chapter, i) => ({
            audiobookId: audiobook.id,
            title: this.sanitizeText(chapter.title) ?? chapter.title,
            startTime: chapter.startTime,
            endTime: chapter.endTime,
            order: i,
            source: chapterSource,
          })),
        );
      }

      // Create author/narrator links
      if (metadata.author) {
        await this.createOrLinkAudiobookPerson(
          audiobook.id,
          metadata.author,
          'author',
        );
      }
      if (metadata.narrator) {
        await this.createOrLinkAudiobookPerson(
          audiobook.id,
          metadata.narrator,
          'narrator',
        );
      }

      // Clear any previous errors
      await this.importErrorsService.clearResolvedByPath(unit.path);

      // Queue for Hardcover auto-sync
      try {
        const autoSyncEnabled =
          await this.hardcoverService.getAutoSyncOnImport();
        if (autoSyncEnabled) {
          await this.hardcoverService.addToSyncQueue('audiobook', audiobook.id);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to queue audiobook ${audiobook.id} for Hardcover sync: ${error}`,
        );
      }

      this.logger.log(`Imported audiobook: ${title} (${audiobook.id})`);
      this.appEvents.audiobookCreated(audiobook.id);
      this.wsEvents.audiobookCreated(audiobook.id);

      // Try to match with pending requests
      const folderName = path.basename(unit.path);
      await this.requestsService.tryMatchImport(
        folderName,
        audiobook.id,
        'audiobook',
      );

      return audiobook.id;
    } catch (error) {
      this.logger.error(`Failed to import audiobook at ${unit.path}: ${error}`);
      await this.importErrorsService.recordError(
        unit.path,
        error instanceof Error ? error : new Error(String(error)),
        'IMPORT_FAILED',
      );
      return null;
    }
  }

  // ===== EBOOK IMPORT =====

  async importEbook(
    unit: EbookUnit,
    libraryPath: string,
  ): Promise<string | null> {
    const relativeFilePath = path.relative(libraryPath, unit.path);

    try {
      // Check if already exists
      const existing = await this.db
        .select({ id: ebooksSchema.ebooks.id })
        .from(ebooksSchema.ebooks)
        .where(eq(ebooksSchema.ebooks.filePath, relativeFilePath))
        .limit(1);

      if (existing.length > 0) {
        this.logger.debug(`Ebook already exists at ${unit.path}`);
        return existing[0].id;
      }

      // Check if quarantined
      if (await this.importErrorsService.isQuarantined(unit.path)) {
        this.logger.debug(`Skipping quarantined path: ${unit.path}`);
        return null;
      }

      // Extract metadata from EPUB
      const metadata = await this.ebookMetadataProvider.extractMetadata(
        unit.path,
      );
      const stats = await fs.stat(unit.path);

      // Determine cover source
      let coverSource: 'embedded' | undefined = undefined;
      const coverUrl: string | undefined = undefined;

      if (metadata.cover) {
        coverSource = 'embedded';
      }
      // Note: Filesystem covers are no longer imported as 'filesystem'.
      // They will be migrated to app data storage by a separate migration task.

      const publishedDate = this.normalizePublishedDate(metadata.publishedDate);

      // Create ebook record
      const [ebook] = await this.db
        .insert(ebooksSchema.ebooks)
        .values({
          title: this.sanitizeText(metadata.title) ?? metadata.title,
          subtitle: this.sanitizeText(metadata.subtitle),
          description: this.sanitizeText(metadata.description),
          publisher: this.sanitizeText(metadata.publisher),
          language: metadata.language,
          publishedDate,
          isbn: metadata.isbn,
          pageCount: metadata.pageCount,
          coverSource,
          coverUrl,
          filePath: relativeFilePath,
          fileName: unit.fileName,
          sizeBytes: stats.size,
          format: 'epub',
          status: 'available',
        })
        .returning();

      // Create author links
      for (let i = 0; i < metadata.authors.length; i++) {
        const authorName = metadata.authors[i];
        if (authorName) {
          await this.createOrLinkEbookPerson(ebook.id, authorName, i);
        }
      }

      // Clear any previous errors
      await this.importErrorsService.clearResolvedByPath(unit.path);

      this.logger.log(`Imported ebook: ${metadata.title} (${ebook.id})`);
      this.appEvents.ebookCreated(ebook.id);
      this.wsEvents.ebookCreated(ebook.id);

      // Try to match with pending requests
      const folderName = path.basename(path.dirname(unit.path));
      await this.requestsService.tryMatchImport(folderName, ebook.id, 'ebook');

      // Queue for Hardcover auto-sync
      try {
        const autoSyncEnabled =
          await this.hardcoverService.getAutoSyncOnImport();
        this.logger.debug(`Hardcover auto-sync enabled: ${autoSyncEnabled}`);
        if (autoSyncEnabled) {
          await this.hardcoverService.addToSyncQueue('ebook', ebook.id);
          this.logger.log(`Queued ebook ${ebook.id} for Hardcover sync`);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to queue ebook ${ebook.id} for Hardcover sync: ${error}`,
        );
      }

      return ebook.id;
    } catch (error) {
      this.logger.error(`Failed to import ebook at ${unit.path}: ${error}`);
      await this.importErrorsService.recordError(
        unit.path,
        error instanceof Error ? error : new Error(String(error)),
        'IMPORT_FAILED',
      );
      return null;
    }
  }

  // ===== AUDIOBOOK RESCAN =====

  /**
   * Rescan an audiobook's metadata from files.
   * - Does NOT overwrite fields in manualFields
   * - ALWAYS updates duration and audiobook_files table
   * - Updates chapters if not manually edited
   * - Updates author/narrator if not manually edited
   */
  async rescanAudiobook(audiobookId: string): Promise<boolean> {
    try {
      // Get the audiobook with its manualFields
      const [audiobook] = await this.db
        .select()
        .from(audiobooksSchema.audiobooks)
        .where(eq(audiobooksSchema.audiobooks.id, audiobookId))
        .limit(1);

      if (!audiobook) {
        this.logger.warn(`Audiobook ${audiobookId} not found for rescan`);
        return false;
      }

      // Get library path
      const libraryPath =
        await this.appSettingsService.getAudiobookLibraryPath();
      if (!libraryPath) {
        this.logger.error('No audiobook library path configured');
        return false;
      }

      // Get existing files for this audiobook
      const existingFiles = await this.db
        .select()
        .from(audiobooksSchema.audiobookFiles)
        .where(eq(audiobooksSchema.audiobookFiles.audiobookId, audiobookId))
        .orderBy(audiobooksSchema.audiobookFiles.order);

      if (existingFiles.length === 0) {
        this.logger.warn(`No files found for audiobook ${audiobookId}`);
        return false;
      }

      // Build full file paths
      const filePaths = existingFiles.map((f) =>
        path.join(libraryPath, f.filePath),
      );

      // Extract metadata from the primary file
      const primaryPath = filePaths[0];
      const primaryData =
        await this.audioMetadataProvider.extractFullMetadata(primaryPath);
      const {
        metadata,
        fileInfo: primaryFileInfo,
        chapters: primaryChapters,
      } = primaryData;

      // Extract file info for all files
      const fileInfos: AudioFileInfo[] = [primaryFileInfo];
      for (let i = 1; i < filePaths.length; i++) {
        const info = await this.audioMetadataProvider.getFileInfo(filePaths[i]);
        fileInfos.push(info);
      }

      // Calculate new total duration (always updated)
      const totalDuration = fileInfos.reduce((sum, f) => sum + f.duration, 0);

      // Get manualFields - these fields should NOT be overwritten
      const manualFields = audiobook.manualFields ?? [];

      // Build update object, respecting manualFields
      const updates: Record<string, unknown> = {
        // Duration is always updated
        duration: totalDuration,
      };

      // Only update non-manual fields
      if (!manualFields.includes('title') && metadata.title) {
        updates.title = this.sanitizeText(metadata.title);
      }
      if (!manualFields.includes('subtitle') && metadata.subtitle) {
        updates.subtitle = this.sanitizeText(metadata.subtitle);
      }
      if (!manualFields.includes('description') && metadata.description) {
        updates.description = this.sanitizeText(metadata.description);
      }
      if (!manualFields.includes('publisher') && metadata.publisher) {
        updates.publisher = this.sanitizeText(metadata.publisher);
      }
      if (!manualFields.includes('language') && metadata.language) {
        updates.language = metadata.language;
      }
      if (!manualFields.includes('publishedDate') && metadata.publishedDate) {
        updates.publishedDate = this.normalizePublishedDate(
          metadata.publishedDate,
        );
      }

      // Update cover source if not manually set
      if (!manualFields.includes('coverUrl') && metadata.hasEmbeddedCover) {
        updates.coverSource = 'embedded';
      }

      // Update audiobook record
      await this.db
        .update(audiobooksSchema.audiobooks)
        .set(updates)
        .where(eq(audiobooksSchema.audiobooks.id, audiobookId));

      // ALWAYS delete and recreate audiobook_files (full override)
      await this.db
        .delete(audiobooksSchema.audiobookFiles)
        .where(eq(audiobooksSchema.audiobookFiles.audiobookId, audiobookId));

      await this.db.insert(audiobooksSchema.audiobookFiles).values(
        fileInfos.map((fileInfo, i) => ({
          audiobookId,
          filePath: path.relative(libraryPath, fileInfo.filePath),
          fileName: fileInfo.fileName,
          order: i,
          duration: fileInfo.duration,
          format: fileInfo.format,
          bitrate: fileInfo.bitrate,
          sampleRate: fileInfo.sampleRate,
          sizeBytes: fileInfo.sizeBytes,
        })),
      );

      // Update chapters if not manually edited
      if (!manualFields.includes('chapters')) {
        // Check if any existing chapters are manually added
        const existingChapters = await this.db
          .select()
          .from(audiobooksSchema.chapters)
          .where(eq(audiobooksSchema.chapters.audiobookId, audiobookId));

        const hasManualChapters = existingChapters.some(
          (c) => c.source === 'manual',
        );

        if (!hasManualChapters) {
          // Delete existing chapters and create new ones
          await this.db
            .delete(audiobooksSchema.chapters)
            .where(eq(audiobooksSchema.chapters.audiobookId, audiobookId));

          let chapters = primaryChapters;
          let chapterSource: 'embedded' | 'external' = 'embedded';

          // For multi-file audiobooks with no embedded chapters, generate from files
          if (chapters.length === 0 && fileInfos.length > 1) {
            chapters = this.generateChaptersFromFiles(fileInfos);
            chapterSource = 'external';
          }

          if (chapters.length > 0) {
            await this.db.insert(audiobooksSchema.chapters).values(
              chapters.map((chapter, i) => ({
                audiobookId,
                title: this.sanitizeText(chapter.title) ?? chapter.title,
                startTime: chapter.startTime,
                endTime: chapter.endTime,
                order: i,
                source: chapterSource,
              })),
            );
          }
        }
      }

      // Update author if not manually edited
      if (!manualFields.includes('authors') && metadata.author) {
        // Delete existing authors
        await this.db
          .delete(audiobooksSchema.audiobookAuthors)
          .where(eq(audiobooksSchema.audiobookAuthors.audiobookId, audiobookId));

        // Create new author link
        await this.createOrLinkAudiobookPerson(
          audiobookId,
          metadata.author,
          'author',
        );
      }

      // Update narrator if not manually edited
      if (!manualFields.includes('narrators') && metadata.narrator) {
        // Delete existing narrators
        await this.db
          .delete(audiobooksSchema.audiobookNarrators)
          .where(
            eq(audiobooksSchema.audiobookNarrators.audiobookId, audiobookId),
          );

        // Create new narrator link
        await this.createOrLinkAudiobookPerson(
          audiobookId,
          metadata.narrator,
          'narrator',
        );
      }

      this.logger.log(`Rescanned audiobook: ${audiobook.title} (${audiobookId})`);
      this.appEvents.audiobookUpdated(audiobookId);
      this.wsEvents.audiobookUpdated(audiobookId);

      return true;
    } catch (error) {
      this.logger.error(
        `Failed to rescan audiobook ${audiobookId}: ${error}`,
      );
      return false;
    }
  }

  // ===== PRIVATE HELPERS =====

  /**
   * Sanitize text fields to prevent SQL parameter binding issues
   * Some Unicode characters (smart quotes, em-dashes) can break Drizzle ORM's parameter serialization
   */
  private sanitizeText(text: string | undefined): string | undefined {
    if (!text) return undefined;

    return (
      text
        // Replace smart/curly quotes with straight quotes
        .replace(/[\u2018\u2019\u201A\u201B]/g, "'") // single quotes
        .replace(/[\u201C\u201D\u201E\u201F]/g, '"') // double quotes
        // Replace various dashes with regular hyphen
        .replace(/[\u2013\u2014\u2015]/g, '-') // en-dash, em-dash, horizontal bar
        // Replace ellipsis character with three dots
        .replace(/\u2026/g, '...')
        // Remove null bytes that might be embedded
        .replace(/\0/g, '')
    );
  }

  private inferTitleFromPath(
    audiobookPath: string,
    type: 'single-file' | 'multi-file',
  ): string {
    if (type === 'single-file') {
      return path.basename(audiobookPath, path.extname(audiobookPath));
    }
    return path.basename(audiobookPath);
  }

  private normalizePublishedDate(
    dateString: string | undefined,
  ): string | undefined {
    if (!dateString) return undefined;

    // Handle year-only format (must be 4 digits and reasonable)
    if (/^\d{4}$/.test(dateString)) {
      const year = parseInt(dateString, 10);
      if (year >= 1000 && year <= 2100) {
        return `${dateString}-01-01`;
      }
      return undefined; // Invalid year
    }

    // Try to parse as date - if invalid, return undefined
    const parsed = new Date(dateString);
    if (isNaN(parsed.getTime())) {
      return undefined;
    }

    return dateString;
  }

  private generateChaptersFromFiles(
    fileInfos: AudioFileInfo[],
  ): Array<{ title: string; startTime: number; endTime: number }> {
    let cumulativeTime = 0;

    return fileInfos.map((file) => {
      const startTime = cumulativeTime;
      const endTime = cumulativeTime + file.duration;
      cumulativeTime = endTime;

      const title = path.basename(file.fileName, path.extname(file.fileName));
      return { title, startTime, endTime };
    });
  }

  private async createOrLinkAudiobookPerson(
    audiobookId: string,
    name: string,
    role: 'author' | 'narrator',
  ): Promise<void> {
    let [person] = await this.db
      .select()
      .from(audiobooksSchema.people)
      .where(eq(audiobooksSchema.people.name, name))
      .limit(1);

    if (!person) {
      [person] = await this.db
        .insert(audiobooksSchema.people)
        .values({ name })
        .returning();
    }

    if (role === 'author') {
      await this.db.insert(audiobooksSchema.audiobookAuthors).values({
        audiobookId,
        personId: person.id,
        order: 0,
      });
    } else {
      await this.db.insert(audiobooksSchema.audiobookNarrators).values({
        audiobookId,
        personId: person.id,
        order: 0,
      });
    }
  }

  private async createOrLinkEbookPerson(
    ebookId: string,
    name: string,
    order: number,
  ): Promise<void> {
    let [person] = await this.db
      .select()
      .from(audiobooksSchema.people)
      .where(eq(audiobooksSchema.people.name, name))
      .limit(1);

    if (!person) {
      [person] = await this.db
        .insert(audiobooksSchema.people)
        .values({ name })
        .returning();
    }

    await this.db.insert(ebooksSchema.ebookAuthors).values({
      ebookId,
      personId: person.id,
      order,
    });
  }
}
