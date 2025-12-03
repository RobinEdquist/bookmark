// apps/backend/src/library-watcher/media-importer.service.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as path from 'path';
import * as fs from 'fs/promises';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as audiobooksSchema from '../audiobooks/schema';
import * as ebooksSchema from '../ebooks/schema';
import { EmbeddedMetadataProvider, AudioFileInfo } from './metadata/embedded-metadata.provider';
import { EbookMetadataProvider } from './metadata/ebook-metadata.provider';
import { ImportErrorsService } from '../import-errors/import-errors.service';
import { HardcoverService } from '../hardcover/hardcover.service';
import { AppEventsService } from '../events/app-events.service';
import { WsEventsService } from '../events/ws-events.service';
import { AudiobookUnit, EbookUnit } from './media-detector.service';

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

      // Extract metadata from primary file
      const metadata = await this.audioMetadataProvider.extractMetadata(primaryFile);

      // Determine cover source
      let coverSource: 'embedded' | 'filesystem' | undefined = undefined;
      let coverUrl: string | undefined = undefined;

      if (metadata.hasEmbeddedCover) {
        coverSource = 'embedded';
      } else {
        const filesystemCover = await this.audioMetadataProvider.findCoverInFolder(unit.path);
        if (filesystemCover) {
          coverSource = 'filesystem';
          coverUrl = path.basename(filesystemCover);
        }
      }

      // Get file info for all files
      const fileInfos: AudioFileInfo[] = [];
      for (const file of unit.files) {
        const info = await this.audioMetadataProvider.getFileInfo(file);
        fileInfos.push(info);
      }

      const totalDuration = fileInfos.reduce((sum, f) => sum + f.duration, 0);
      const title = metadata.title || this.inferTitleFromPath(unit.path, unit.type);
      const publishedDate = this.normalizePublishedDate(metadata.publishedDate);

      // Create audiobook record
      const [audiobook] = await this.db
        .insert(audiobooksSchema.audiobooks)
        .values({
          title,
          subtitle: metadata.subtitle,
          description: metadata.description,
          publisher: metadata.publisher,
          language: metadata.language,
          publishedDate,
          duration: totalDuration,
          coverSource,
          coverUrl,
          filePath: relativeUnitPath,
          status: 'available',
        })
        .returning();

      // Create file records
      for (let i = 0; i < fileInfos.length; i++) {
        const fileInfo = fileInfos[i];
        const relativeFilePath = path.relative(libraryPath, fileInfo.filePath);
        await this.db.insert(audiobooksSchema.audiobookFiles).values({
          audiobookId: audiobook.id,
          filePath: relativeFilePath,
          fileName: fileInfo.fileName,
          order: i,
          duration: fileInfo.duration,
          format: fileInfo.format,
          bitrate: fileInfo.bitrate,
          sampleRate: fileInfo.sampleRate,
          sizeBytes: fileInfo.sizeBytes,
        });
      }

      // Extract chapters
      let chapters = await this.audioMetadataProvider.extractChapters(primaryFile);
      let chapterSource: 'embedded' | 'external' = 'embedded';

      if (chapters.length === 0 && unit.type === 'multi-file' && fileInfos.length > 1) {
        chapters = this.generateChaptersFromFiles(fileInfos);
        chapterSource = 'external';
      }

      // Create chapter records
      for (let i = 0; i < chapters.length; i++) {
        const chapter = chapters[i];
        await this.db.insert(audiobooksSchema.chapters).values({
          audiobookId: audiobook.id,
          title: chapter.title,
          startTime: chapter.startTime,
          endTime: chapter.endTime,
          order: i,
          source: chapterSource,
        });
      }

      // Create author/narrator links
      if (metadata.author) {
        await this.createOrLinkAudiobookPerson(audiobook.id, metadata.author, 'author');
      }
      if (metadata.narrator) {
        await this.createOrLinkAudiobookPerson(audiobook.id, metadata.narrator, 'narrator');
      }

      // Clear any previous errors
      await this.importErrorsService.clearResolvedByPath(unit.path);

      // Queue for Hardcover auto-sync
      try {
        const autoSyncEnabled = await this.hardcoverService.getAutoSyncOnImport();
        if (autoSyncEnabled) {
          await this.hardcoverService.addToSyncQueue(audiobook.id);
        }
      } catch (error) {
        this.logger.warn(`Failed to queue audiobook ${audiobook.id} for Hardcover sync: ${error}`);
      }

      this.logger.log(`Imported audiobook: ${title} (${audiobook.id})`);
      this.appEvents.audiobookCreated(audiobook.id);
      this.wsEvents.audiobookCreated(audiobook.id);
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

  async importEbook(unit: EbookUnit, libraryPath: string): Promise<string | null> {
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
      const metadata = await this.ebookMetadataProvider.extractMetadata(unit.path);
      const stats = await fs.stat(unit.path);

      // Determine cover source
      let coverSource: 'embedded' | 'filesystem' | undefined = undefined;
      let coverUrl: string | undefined = undefined;

      if (metadata.cover) {
        coverSource = 'embedded';
      } else {
        const dir = path.dirname(unit.path);
        const coverFiles = ['cover.jpg', 'cover.jpeg', 'cover.png', 'cover.webp'];
        for (const coverFile of coverFiles) {
          const coverPath = path.join(dir, coverFile);
          try {
            await fs.access(coverPath);
            coverSource = 'filesystem';
            coverUrl = coverFile;
            break;
          } catch {
            // File doesn't exist
          }
        }
      }

      const publishedDate = this.normalizePublishedDate(metadata.publishedDate);

      // Create ebook record
      const [ebook] = await this.db
        .insert(ebooksSchema.ebooks)
        .values({
          title: metadata.title,
          subtitle: metadata.subtitle,
          description: metadata.description,
          publisher: metadata.publisher,
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

      // Queue for Hardcover auto-sync
      try {
        const autoSyncEnabled = await this.hardcoverService.getAutoSyncOnImport();
        if (autoSyncEnabled) {
          await this.hardcoverService.addToSyncQueue('ebook', ebook.id);
        }
      } catch (error) {
        this.logger.warn(`Failed to queue ebook ${ebook.id} for Hardcover sync: ${error}`);
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

  // ===== PRIVATE HELPERS =====

  private inferTitleFromPath(audiobookPath: string, type: 'single-file' | 'multi-file'): string {
    if (type === 'single-file') {
      return path.basename(audiobookPath, path.extname(audiobookPath));
    }
    return path.basename(audiobookPath);
  }

  private normalizePublishedDate(dateString: string | undefined): string | undefined {
    if (!dateString) return undefined;
    if (/^\d{4}$/.test(dateString)) {
      return `${dateString}-01-01`;
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
