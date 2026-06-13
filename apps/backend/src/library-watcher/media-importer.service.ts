// apps/backend/src/library-watcher/media-importer.service.ts
import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, sql } from 'drizzle-orm';
import * as path from 'path';
import * as fs from 'fs/promises';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as audiobooksSchema from '../audiobooks/schema';
import * as ebooksSchema from '../ebooks/schema';
import * as comicsSchema from '../comics/schema';
import {
  EmbeddedMetadataProvider,
  AudioFileInfo,
} from './metadata/embedded-metadata.provider';
import { EbookMetadataProvider } from './metadata/ebook-metadata.provider';
import { ComicMetadataProvider } from './metadata/comic-metadata.provider';
import { ImportErrorsService } from '../import-errors/import-errors.service';
import { HardcoverService } from '../hardcover/hardcover.service';
import { ComicvineService } from '../comicvine/comicvine.service';
import { AppEventsService } from '../events/app-events.service';
import { WsEventsService } from '../events/ws-events.service';
import {
  AudiobookUnit,
  EbookUnit,
  ComicSeriesUnit,
} from './media-detector.service';
import { RequestsService } from '../requests';
import { AppSettingsService } from '../app-settings/app-settings.service';
import {
  calculateAudiobookPaths,
  calculateEbookPath,
  resolveAudiobookFilePath,
} from './utils/path.utils';
import {
  sanitizeText,
  normalizePublishedDate,
  inferTitleFromPath,
} from './utils/text.utils';
import { generateChaptersFromFiles } from './utils/chapter.utils';
import { splitPersonNames } from '../common/utils/name.utils';
import {
  parseComicFilename,
  parseSeriesFolderName,
  computeSortNumber,
} from './utils/comic-filename.utils';
import { parseMylarSeriesJson } from './utils/mylar-series-json.parser';
import { ParsedComicInfo, ComicCreatorRole } from './utils/comicinfo.parser';
import { ImageProcessingService } from '../common/image-processing.service';
import { AppDataService } from '../app-data/app-data.service';

@Injectable()
export class MediaImporterService {
  private readonly logger = new Logger(MediaImporterService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: NodePgDatabase<
      typeof audiobooksSchema & typeof ebooksSchema & typeof comicsSchema
    >,
    private audioMetadataProvider: EmbeddedMetadataProvider,
    private ebookMetadataProvider: EbookMetadataProvider,
    private importErrorsService: ImportErrorsService,
    private hardcoverService: HardcoverService,
    @Inject(forwardRef(() => ComicvineService))
    private comicvineService: ComicvineService,
    private appEvents: AppEventsService,
    private wsEvents: WsEventsService,
    private requestsService: RequestsService,
    private appSettingsService: AppSettingsService,
    private comicMetadataProvider: ComicMetadataProvider,
    private imageProcessing: ImageProcessingService,
    private appData: AppDataService,
  ) {}

  // ===== AUDIOBOOK IMPORT =====

  async importAudiobook(
    unit: AudiobookUnit,
    libraryPath: string,
  ): Promise<string | null> {
    const primaryFile = unit.files[0];

    // Calculate path storage values using utility function
    const { isRootLevelFile, relativeUnitPath } = calculateAudiobookPaths(
      unit,
      libraryPath,
    );

    this.logger.debug(
      `[IMPORT] Starting import for unit: ${JSON.stringify({
        type: unit.type,
        path: unit.path,
        filesCount: unit.files.length,
        primaryFile,
        isRootLevelFile,
        relativeUnitPath,
        libraryPath,
      })}`,
    );

    try {
      // Check if already exists
      let existing: { id: string }[];
      if (isRootLevelFile) {
        // For root-level files, check by the actual filename in audiobook_files
        // since multiple audiobooks can have filePath = ''
        const filename = path.basename(primaryFile);
        existing = await this.db
          .select({ id: audiobooksSchema.audiobooks.id })
          .from(audiobooksSchema.audiobooks)
          .innerJoin(
            audiobooksSchema.audiobookFiles,
            eq(
              audiobooksSchema.audiobooks.id,
              audiobooksSchema.audiobookFiles.audiobookId,
            ),
          )
          .where(eq(audiobooksSchema.audiobookFiles.filePath, filename))
          .limit(1);
      } else {
        existing = await this.db
          .select({ id: audiobooksSchema.audiobooks.id })
          .from(audiobooksSchema.audiobooks)
          .where(eq(audiobooksSchema.audiobooks.filePath, relativeUnitPath))
          .limit(1);
      }

      if (existing.length > 0) {
        this.logger.debug(
          `[IMPORT] Audiobook already exists at ${unit.path}, id=${existing[0].id}`,
        );
        return existing[0].id;
      }

      // Check if quarantined
      if (await this.importErrorsService.isQuarantined(unit.path)) {
        this.logger.debug(`[IMPORT] Skipping quarantined path: ${unit.path}`);
        return null;
      }

      this.logger.debug(
        `[IMPORT] Extracting metadata from primary file: ${primaryFile}`,
      );

      // Extract all metadata from primary file in one pass (metadata, fileInfo, chapters)
      // This avoids parsing the file 3 times
      const primaryData =
        await this.audioMetadataProvider.extractFullMetadata(primaryFile);
      const {
        metadata,
        fileInfo: primaryFileInfo,
        chapters: primaryChapters,
      } = primaryData;

      this.logger.debug(
        `[IMPORT] Metadata extracted: ${JSON.stringify({
          title: metadata.title,
          author: metadata.author,
          duration: primaryFileInfo.duration,
          chaptersCount: primaryChapters.length,
          hasEmbeddedCover: metadata.hasEmbeddedCover,
        })}`,
      );

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
          ? inferTitleFromPath(unit.path, unit.type) ||
            metadata.album ||
            metadata.title ||
            'Unknown Audiobook'
          : metadata.title || inferTitleFromPath(unit.path, unit.type);
      const publishedDate = normalizePublishedDate(metadata.publishedDate);

      this.logger.debug(
        `[IMPORT] Creating audiobook record: ${JSON.stringify({
          title: sanitizeText(title) ?? title,
          filePath: relativeUnitPath,
          totalDuration,
          filesCount: fileInfos.length,
          coverSource,
        })}`,
      );

      // Create audiobook record
      const [audiobook] = await this.db
        .insert(audiobooksSchema.audiobooks)
        .values({
          title: sanitizeText(title) ?? title,
          subtitle: sanitizeText(metadata.subtitle),
          description: sanitizeText(metadata.description),
          publisher: sanitizeText(metadata.publisher),
          language: metadata.language,
          publishedDate,
          duration: totalDuration,
          coverSource,
          coverUrl,
          filePath: relativeUnitPath,
          status: 'available',
        })
        .returning();

      this.logger.debug(
        `[IMPORT] Audiobook record created: id=${audiobook.id}`,
      );

      // Create file records in a single batch insert
      // filePath stores just the filename (relative to audiobook folder)
      if (fileInfos.length > 0) {
        const fileRecords = fileInfos.map((fileInfo, i) => ({
          audiobookId: audiobook.id,
          filePath: path.basename(fileInfo.filePath),
          fileName: fileInfo.fileName,
          order: i,
          duration: fileInfo.duration,
          format: fileInfo.format,
          bitrate: fileInfo.bitrate,
          sampleRate: fileInfo.sampleRate,
          sizeBytes: fileInfo.sizeBytes,
        }));

        this.logger.debug(
          `[IMPORT] Creating ${fileRecords.length} file record(s): ${JSON.stringify(
            fileRecords.map((f) => ({
              filePath: f.filePath,
              duration: f.duration,
            })),
          )}`,
        );

        await this.db
          .insert(audiobooksSchema.audiobookFiles)
          .values(fileRecords);
      }

      // Use chapters from the primary file extraction (already parsed)
      let chapters = primaryChapters;
      let chapterSource: 'embedded' | 'external' = 'embedded';

      if (
        chapters.length === 0 &&
        unit.type === 'multi-file' &&
        fileInfos.length > 1
      ) {
        chapters = generateChaptersFromFiles(fileInfos);
        chapterSource = 'external';
      }

      // Create chapter records in a single batch insert
      if (chapters.length > 0) {
        await this.db.insert(audiobooksSchema.chapters).values(
          chapters.map((chapter, i) => ({
            audiobookId: audiobook.id,
            title: sanitizeText(chapter.title) ?? chapter.title,
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

      this.logger.log(
        `[IMPORT] Successfully imported audiobook: "${title}" (id=${audiobook.id}, filePath="${relativeUnitPath}", files=${fileInfos.length})`,
      );
      this.appEvents.audiobookCreated(audiobook.id);
      this.wsEvents.audiobookCreated(audiobook.id);

      // Try to match with pending requests
      // For audiobooks, torrent name can be folder name or single file name (e.g., "Book.m4b")
      // Try matching by basename first, then by parent folder for nested structures
      const baseName = path.basename(unit.path);
      const parentFolderName = path.basename(path.dirname(unit.path));

      const matched = await this.requestsService.tryMatchImport(
        baseName,
        audiobook.id,
        'audiobook',
      );
      if (!matched) {
        // Try parent folder if basename didn't match (for nested folder structures)
        await this.requestsService.tryMatchImport(
          parentFolderName,
          audiobook.id,
          'audiobook',
        );
      }

      return audiobook.id;
    } catch (error) {
      this.logger.error(
        `[IMPORT] Failed to import audiobook at ${unit.path}: ${error}`,
      );
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
    // Calculate relative path using utility function
    const relativeFilePath = calculateEbookPath(unit, libraryPath);

    this.logger.debug(
      `[IMPORT] Starting ebook import: ${JSON.stringify({
        path: unit.path,
        fileName: unit.fileName,
        relativeFilePath,
        libraryPath,
      })}`,
    );

    try {
      // Check if already exists
      const existing = await this.db
        .select({ id: ebooksSchema.ebooks.id })
        .from(ebooksSchema.ebooks)
        .where(eq(ebooksSchema.ebooks.filePath, relativeFilePath))
        .limit(1);

      if (existing.length > 0) {
        this.logger.debug(
          `[IMPORT] Ebook already exists at ${unit.path}, id=${existing[0].id}`,
        );
        return existing[0].id;
      }

      // Check if quarantined
      if (await this.importErrorsService.isQuarantined(unit.path)) {
        this.logger.debug(`[IMPORT] Skipping quarantined path: ${unit.path}`);
        return null;
      }

      this.logger.debug(`[IMPORT] Extracting metadata from: ${unit.path}`);

      // Extract metadata from EPUB
      const metadata = await this.ebookMetadataProvider.extractMetadata(
        unit.path,
      );
      const stats = await fs.stat(unit.path);

      this.logger.debug(
        `[IMPORT] Ebook metadata extracted: ${JSON.stringify({
          title: metadata.title,
          authors: metadata.authors,
          hasCover: !!metadata.cover,
        })}`,
      );

      // Determine cover source
      let coverSource: 'embedded' | undefined = undefined;
      const coverUrl: string | undefined = undefined;

      if (metadata.cover) {
        coverSource = 'embedded';
      }
      // Note: Filesystem covers are no longer imported as 'filesystem'.
      // They will be migrated to app data storage by a separate migration task.

      const publishedDate = normalizePublishedDate(metadata.publishedDate);

      this.logger.debug(
        `[IMPORT] Creating ebook record: ${JSON.stringify({
          title: sanitizeText(metadata.title) ?? metadata.title,
          filePath: relativeFilePath,
          fileName: unit.fileName,
          coverSource,
        })}`,
      );

      // Create ebook record
      const [ebook] = await this.db
        .insert(ebooksSchema.ebooks)
        .values({
          title: sanitizeText(metadata.title) ?? metadata.title,
          subtitle: sanitizeText(metadata.subtitle),
          description: sanitizeText(metadata.description),
          publisher: sanitizeText(metadata.publisher),
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

      this.logger.debug(`[IMPORT] Ebook record created: id=${ebook.id}`);

      // Create author links
      for (let i = 0; i < metadata.authors.length; i++) {
        const authorName = metadata.authors[i];
        if (authorName) {
          await this.createOrLinkEbookPerson(ebook.id, authorName, i);
        }
      }

      // Clear any previous errors
      await this.importErrorsService.clearResolvedByPath(unit.path);

      this.logger.log(
        `[IMPORT] Successfully imported ebook: "${metadata.title}" (id=${ebook.id}, filePath="${relativeFilePath}")`,
      );
      this.appEvents.ebookCreated(ebook.id);
      this.wsEvents.ebookCreated(ebook.id);

      // Try to match with pending requests
      // For ebooks, the torrent name is typically the filename (e.g., "Book.epub")
      // Try matching by filename first, then by parent folder for ebooks in subfolders
      const fileName = path.basename(unit.path);
      const parentFolderName = path.basename(path.dirname(unit.path));

      const matched = await this.requestsService.tryMatchImport(
        fileName,
        ebook.id,
        'ebook',
      );
      if (!matched) {
        // Try parent folder if filename didn't match (for ebooks in subfolders)
        await this.requestsService.tryMatchImport(
          parentFolderName,
          ebook.id,
          'ebook',
        );
      }

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
      this.logger.error(
        `[IMPORT] Failed to import ebook at ${unit.path}: ${error}`,
      );
      await this.importErrorsService.recordError(
        unit.path,
        error instanceof Error ? error : new Error(String(error)),
        'IMPORT_FAILED',
      );
      return null;
    }
  }

  // ===== COMIC IMPORT =====

  /**
   * Import a comic series unit (a folder of books, or a root-level one-shot).
   * Creates the series row if needed, then imports each book that is not
   * already in the database. Returns the series id, or null on failure.
   */
  async importComicSeriesUnit(
    unit: ComicSeriesUnit,
    libraryPath: string,
  ): Promise<string | null> {
    const relativeFolderPath = path.relative(libraryPath, unit.path);

    try {
      let [series] = await this.db
        .select()
        .from(comicsSchema.comicSeries)
        .where(eq(comicsSchema.comicSeries.folderPath, relativeFolderPath))
        .limit(1);

      let isNewSeries = false;
      if (!series) {
        series = await this.createComicSeries(unit, relativeFolderPath);
        isNewSeries = true;
      }

      for (const book of unit.books) {
        const relativeFilePath = path.relative(libraryPath, book.path);
        const existing = await this.db
          .select({ id: comicsSchema.comicBooks.id })
          .from(comicsSchema.comicBooks)
          .where(eq(comicsSchema.comicBooks.filePath, relativeFilePath))
          .limit(1);
        if (existing.length > 0) continue;

        if (await this.importErrorsService.isQuarantined(book.path)) {
          this.logger.debug(`[IMPORT] Skipping quarantined path: ${book.path}`);
          continue;
        }

        await this.importComicBook(series.id, book.path, relativeFilePath);
      }

      if (isNewSeries) {
        this.logger.log(
          `[IMPORT] Imported comic series "${series.title}" (id=${series.id}, books=${unit.books.length})`,
        );
        this.appEvents.comicSeriesCreated(series.id);
        this.wsEvents.comicSeriesCreated(series.id);

        // Queue for ComicVine auto-sync (mirror Hardcover trigger pattern)
        try {
          const autoSyncEnabled =
            await this.comicvineService.getAutoSyncOnImport();
          if (autoSyncEnabled) {
            await this.comicvineService.addToSyncQueue('series', series.id);
            this.logger.log(
              `Queued comic series ${series.id} for ComicVine sync`,
            );
          }
        } catch (error) {
          this.logger.warn(
            `Failed to queue comic series ${series.id} for ComicVine sync: ${error}`,
          );
        }
      } else {
        this.appEvents.comicSeriesUpdated(series.id);
        this.wsEvents.comicSeriesUpdated(series.id);
      }

      return series.id;
    } catch (error) {
      this.logger.error(
        `[IMPORT] Failed to import comic series at ${unit.path}: ${error}`,
      );
      await this.importErrorsService.recordError(
        unit.path,
        error instanceof Error ? error : new Error(String(error)),
        'IMPORT_FAILED',
      );
      return null;
    }
  }

  private async createComicSeries(
    unit: ComicSeriesUnit,
    relativeFolderPath: string,
  ): Promise<typeof comicsSchema.comicSeries.$inferSelect> {
    const parsed = parseSeriesFolderName(unit.folderName);
    let title = parsed.title;
    let startYear = parsed.year;
    let publisher: string | null = null;
    let imprint: string | null = null;
    let description: string | null = null;
    let totalIssueCount: number | null = null;
    let ageRating: string | null = null;
    let comicvineVolumeId: number | null = null;

    // Mylar series.json enrichment (folder-based series only)
    if (!unit.isRootOneShot) {
      try {
        const seriesJsonPath = path.join(unit.path, 'series.json');
        const content = await fs.readFile(seriesJsonPath, 'utf-8');
        const mylar = parseMylarSeriesJson(content);
        if (mylar) {
          title = mylar.name ?? title;
          startYear = mylar.year ?? startYear;
          publisher = mylar.publisher;
          imprint = mylar.imprint;
          description = mylar.description;
          totalIssueCount = mylar.totalIssues;
          ageRating = mylar.ageRating;
          // Store the cvinfo pin from Mylar — Phase 2 uses this for exact matching
          comicvineVolumeId = mylar.comicvineVolumeId;
        }
      } catch {
        // No series.json — fine
      }
    }

    const [series] = await this.db
      .insert(comicsSchema.comicSeries)
      .values({
        title: sanitizeText(title) ?? title,
        description: sanitizeText(description),
        publisher: sanitizeText(publisher),
        imprint: sanitizeText(imprint),
        startYear,
        totalIssueCount,
        ageRating,
        folderPath: relativeFolderPath,
        status: 'available',
        ...(comicvineVolumeId != null ? { comicvineVolumeId } : {}),
      })
      .returning();

    if (!unit.isRootOneShot) {
      await this.importSeriesFolderCover(series.id, unit.path);
    }

    return series;
  }

  private async importSeriesFolderCover(
    seriesId: string,
    folderPath: string,
  ): Promise<void> {
    const candidates = ['cover.jpg', 'cover.png', 'poster.jpg', 'folder.jpg'];
    for (const candidate of candidates) {
      try {
        const buffer = await fs.readFile(path.join(folderPath, candidate));
        const processed = await this.imageProcessing.processCover(buffer);
        await fs.writeFile(
          this.appData.getComicSeriesCoverPath(seriesId),
          processed,
        );
        await this.db
          .update(comicsSchema.comicSeries)
          .set({ coverUrl: `${seriesId}.jpg`, coverSource: 'folder_image' })
          .where(eq(comicsSchema.comicSeries.id, seriesId));
        return;
      } catch (err: unknown) {
        const isNotFound = (err as NodeJS.ErrnoException).code === 'ENOENT';
        if (!isNotFound) {
          this.logger.debug(
            `[IMPORT] Cover candidate ${candidate} failed: ${err}`,
          );
        }
        // Try next candidate
      }
    }
  }

  private async importComicBook(
    seriesId: string,
    absolutePath: string,
    relativeFilePath: string,
  ): Promise<string | null> {
    const fileName = path.basename(absolutePath);
    try {
      const metadata =
        await this.comicMetadataProvider.extractMetadata(absolutePath);
      const stats = await fs.stat(absolutePath);
      const parsed = parseComicFilename(fileName);
      const info = metadata.comicInfo;

      const number = info?.number ?? parsed.number;
      // ComicInfo Format wins only when actually present in the file
      const format = info?.formatRaw ? info.format : parsed.format;
      const container = this.resolveComicContainer(fileName);
      const sortNumber = computeSortNumber(number);

      const [book] = await this.db
        .insert(comicsSchema.comicBooks)
        .values({
          seriesId,
          title: sanitizeText(info?.title),
          number,
          sortNumber: sortNumber !== null ? String(sortNumber) : null,
          format,
          coverDate: info?.coverDate ?? null,
          summary: sanitizeText(info?.summary),
          pageCount: metadata.pageCount > 0 ? metadata.pageCount : null,
          filePath: relativeFilePath,
          fileName,
          sizeBytes: stats.size,
          container,
          coverSource: metadata.cover ? 'embedded' : undefined,
          status: 'available',
        })
        .returning();

      // Cover was already extracted by the worker — persist it now
      if (metadata.cover) {
        try {
          const processed = await this.imageProcessing.processCover(
            metadata.cover.data,
          );
          await fs.writeFile(
            this.appData.getComicBookCoverPath(book.id),
            processed,
          );
          await this.db
            .update(comicsSchema.comicBooks)
            .set({ coverUrl: `${book.id}.jpg` })
            .where(eq(comicsSchema.comicBooks.id, book.id));
        } catch (error) {
          this.logger.warn(
            `[IMPORT] Failed to persist cover for ${fileName}: ${error}`,
          );
        }
      }

      if (info) {
        await this.linkComicCreators(book.id, info);
        await this.enrichSeriesFromComicInfo(seriesId, info);
      }

      await this.importErrorsService.clearResolvedByPath(absolutePath);
      this.logger.log(
        `[IMPORT] Imported comic book "${fileName}" (id=${book.id})`,
      );
      return book.id;
    } catch (error) {
      this.logger.error(
        `[IMPORT] Failed to import comic book at ${absolutePath}: ${error}`,
      );
      await this.importErrorsService.recordError(
        absolutePath,
        error instanceof Error ? error : new Error(String(error)),
        'IMPORT_FAILED',
      );
      return null;
    }
  }

  private resolveComicContainer(fileName: string): 'cbz' | 'cbr' | 'pdf' {
    const ext = path.extname(fileName).toLowerCase();
    if (ext === '.cbr' || ext === '.rar') return 'cbr';
    if (ext === '.pdf') return 'pdf';
    return 'cbz';
  }

  private async linkComicCreators(
    bookId: string,
    info: ParsedComicInfo,
  ): Promise<void> {
    const orderByRole = new Map<ComicCreatorRole, number>();
    for (const creator of info.creators) {
      const order = orderByRole.get(creator.role) ?? 0;
      orderByRole.set(creator.role, order + 1);

      // Find or create person using upsert to handle race conditions
      const [person] = await this.db
        .insert(audiobooksSchema.people)
        .values({ name: creator.name })
        .onConflictDoUpdate({
          target: audiobooksSchema.people.name,
          set: { name: creator.name },
        })
        .returning();

      await this.db
        .insert(comicsSchema.comicBookCreators)
        .values({
          bookId,
          personId: person.id,
          role: creator.role,
          order,
        })
        .onConflictDoNothing();
    }
  }

  /**
   * Fill series-level fields from a book's ComicInfo when they are still
   * empty and not manually edited.
   */
  private async enrichSeriesFromComicInfo(
    seriesId: string,
    info: ParsedComicInfo,
  ): Promise<void> {
    const [series] = await this.db
      .select()
      .from(comicsSchema.comicSeries)
      .where(eq(comicsSchema.comicSeries.id, seriesId))
      .limit(1);
    if (!series) return;

    const manualFields = series.manualFields ?? [];

    // All fillable scalar fields are already set, and genres are locked
    const allScalarsSet =
      !!series.publisher &&
      !!series.imprint &&
      !!series.language &&
      !!series.ageRating &&
      !!series.totalIssueCount &&
      !!series.startYear;
    const genresLocked =
      manualFields.includes('genres') || info.genres.length === 0;
    if (allScalarsSet && genresLocked) return;

    const updates: Record<string, unknown> = {};

    if (
      !series.publisher &&
      !manualFields.includes('publisher') &&
      info.publisher
    ) {
      updates.publisher = sanitizeText(info.publisher);
    }
    if (!series.imprint && !manualFields.includes('imprint') && info.imprint) {
      updates.imprint = sanitizeText(info.imprint);
    }
    if (
      !series.language &&
      !manualFields.includes('language') &&
      info.languageIso
    ) {
      updates.language = info.languageIso;
    }
    if (
      !series.ageRating &&
      !manualFields.includes('ageRating') &&
      info.ageRating
    ) {
      updates.ageRating = info.ageRating;
    }
    if (
      !series.totalIssueCount &&
      !manualFields.includes('totalIssueCount') &&
      info.count
    ) {
      updates.totalIssueCount = info.count;
    }
    if (!series.startYear && !manualFields.includes('startYear')) {
      if (info.volumeIsYear && info.volume) {
        updates.startYear = info.volume;
      } else if (info.coverDate) {
        updates.startYear = parseInt(info.coverDate.slice(0, 4), 10);
      }
    }

    // Genres: attach ComicInfo genres to the series using find-or-create
    // (case-insensitive: genres table has a unique index on LOWER(name))
    if (info.genres.length > 0 && !manualFields.includes('genres')) {
      for (const genreName of info.genres) {
        const trimmedName = genreName.trim();
        if (!trimmedName) continue;

        // Find or create genre (case-insensitive, matching audiobooks.service.ts pattern)
        let [genre] = await this.db
          .select()
          .from(audiobooksSchema.genres)
          .where(
            sql`LOWER(${audiobooksSchema.genres.name}) = LOWER(${trimmedName})`,
          )
          .limit(1);

        if (!genre) {
          const result = await this.db
            .insert(audiobooksSchema.genres)
            .values({ name: trimmedName })
            .onConflictDoNothing()
            .returning();
          if (result.length > 0) {
            genre = result[0];
          } else {
            // Race condition: another insert won — select it
            [genre] = await this.db
              .select()
              .from(audiobooksSchema.genres)
              .where(
                sql`LOWER(${audiobooksSchema.genres.name}) = LOWER(${trimmedName})`,
              )
              .limit(1);
          }
        }

        if (genre) {
          await this.db
            .insert(comicsSchema.comicSeriesGenres)
            .values({ seriesId, genreId: genre.id })
            .onConflictDoNothing();
        }
      }
    }

    if (Object.keys(updates).length > 0) {
      await this.db
        .update(comicsSchema.comicSeries)
        .set(updates)
        .where(eq(comicsSchema.comicSeries.id, seriesId));
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
    this.logger.debug(`[RESCAN] Starting rescan for audiobook: ${audiobookId}`);

    try {
      // Get the audiobook with its manualFields
      const [audiobook] = await this.db
        .select()
        .from(audiobooksSchema.audiobooks)
        .where(eq(audiobooksSchema.audiobooks.id, audiobookId))
        .limit(1);

      if (!audiobook) {
        this.logger.warn(`[RESCAN] Audiobook ${audiobookId} not found`);
        return false;
      }

      // Get library path
      const libraryPath =
        await this.appSettingsService.getAudiobookLibraryPath();
      if (!libraryPath) {
        this.logger.error('[RESCAN] No audiobook library path configured');
        return false;
      }

      // Get existing files for this audiobook
      const existingFiles = await this.db
        .select()
        .from(audiobooksSchema.audiobookFiles)
        .where(eq(audiobooksSchema.audiobookFiles.audiobookId, audiobookId))
        .orderBy(audiobooksSchema.audiobookFiles.order);

      if (existingFiles.length === 0) {
        this.logger.warn(
          `[RESCAN] No files found for audiobook ${audiobookId}`,
        );
        return false;
      }

      this.logger.debug(
        `[RESCAN] Audiobook info: ${JSON.stringify({
          title: audiobook.title,
          filePath: audiobook.filePath,
          filesCount: existingFiles.length,
          libraryPath,
        })}`,
      );

      // Build full file paths using utility function
      const filePaths = existingFiles.map((f) =>
        resolveAudiobookFilePath(libraryPath, audiobook.filePath, f.filePath),
      );

      this.logger.debug(
        `[RESCAN] Resolved file paths: ${JSON.stringify(filePaths)}`,
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
        updates.title = sanitizeText(metadata.title);
      }
      if (!manualFields.includes('subtitle') && metadata.subtitle) {
        updates.subtitle = sanitizeText(metadata.subtitle);
      }
      if (!manualFields.includes('description') && metadata.description) {
        updates.description = sanitizeText(metadata.description);
      }
      if (!manualFields.includes('publisher') && metadata.publisher) {
        updates.publisher = sanitizeText(metadata.publisher);
      }
      if (!manualFields.includes('language') && metadata.language) {
        updates.language = metadata.language;
      }
      if (!manualFields.includes('publishedDate') && metadata.publishedDate) {
        updates.publishedDate = normalizePublishedDate(metadata.publishedDate);
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

      // filePath stores just the filename (relative to audiobook folder)
      await this.db.insert(audiobooksSchema.audiobookFiles).values(
        fileInfos.map((fileInfo, i) => ({
          audiobookId,
          filePath: path.basename(fileInfo.filePath),
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
            chapters = generateChaptersFromFiles(fileInfos);
            chapterSource = 'external';
          }

          if (chapters.length > 0) {
            await this.db.insert(audiobooksSchema.chapters).values(
              chapters.map((chapter, i) => ({
                audiobookId,
                title: sanitizeText(chapter.title) ?? chapter.title,
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
          .where(
            eq(audiobooksSchema.audiobookAuthors.audiobookId, audiobookId),
          );

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

      this.logger.log(
        `[RESCAN] Successfully rescanned audiobook: "${audiobook.title}" (id=${audiobookId})`,
      );
      this.appEvents.audiobookUpdated(audiobookId);
      this.wsEvents.audiobookUpdated(audiobookId);

      return true;
    } catch (error) {
      this.logger.error(
        `[RESCAN] Failed to rescan audiobook ${audiobookId}: ${error}`,
      );
      return false;
    }
  }

  // ===== PRIVATE HELPERS =====

  /**
   * Creates or links person(s) to an audiobook.
   * Supports comma-separated names (e.g., "Author A, Author B" becomes two separate people).
   */
  private async createOrLinkAudiobookPerson(
    audiobookId: string,
    nameOrNames: string,
    role: 'author' | 'narrator',
  ): Promise<void> {
    const names = splitPersonNames(nameOrNames);

    for (let i = 0; i < names.length; i++) {
      const name = names[i];

      // Find or create person using upsert to handle race conditions
      const [person] = await this.db
        .insert(audiobooksSchema.people)
        .values({ name })
        .onConflictDoUpdate({
          target: audiobooksSchema.people.name,
          set: { name }, // No-op update to get the existing row
        })
        .returning();

      if (role === 'author') {
        await this.db.insert(audiobooksSchema.audiobookAuthors).values({
          audiobookId,
          personId: person.id,
          order: i,
        });
      } else {
        await this.db.insert(audiobooksSchema.audiobookNarrators).values({
          audiobookId,
          personId: person.id,
          order: i,
        });
      }
    }
  }

  /**
   * Creates or links one or more author names to an ebook.
   * Supports comma-separated names (e.g., "Author A, Author B").
   */
  private async createOrLinkEbookPerson(
    ebookId: string,
    name: string,
    order: number,
  ): Promise<void> {
    const names = splitPersonNames(name);

    for (let i = 0; i < names.length; i++) {
      const personName = names[i];

      // Find or create person using upsert to handle race conditions
      const [person] = await this.db
        .insert(audiobooksSchema.people)
        .values({ name: personName })
        .onConflictDoUpdate({
          target: audiobooksSchema.people.name,
          set: { name: personName }, // No-op update to get the existing row
        })
        .returning();

      await this.db.insert(ebooksSchema.ebookAuthors).values({
        ebookId,
        personId: person.id,
        order: order + i,
      });
    }
  }
}
