// apps/backend/src/library-watcher/audiobook-importer.service.ts
import { Inject, Injectable, Logger } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as path from 'path';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as audiobooksSchema from '../audiobooks/schema';
import { EmbeddedMetadataProvider, AudioFileInfo } from './metadata/embedded-metadata.provider';
import { AudiobookDetectorService, AudiobookUnit } from './audiobook-detector.service';
import { ImportErrorsService } from '../import-errors/import-errors.service';

@Injectable()
export class AudiobookImporterService {
  private readonly logger = new Logger(AudiobookImporterService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: NodePgDatabase<typeof audiobooksSchema>,
    private metadataProvider: EmbeddedMetadataProvider,
    private audiobookDetector: AudiobookDetectorService,
    private importErrorsService: ImportErrorsService,
  ) {}

  async importAudiobook(unit: AudiobookUnit): Promise<string | null> {
    const primaryFile = unit.files[0];

    try {
      // Check if already exists
      const existing = await this.db
        .select({ id: audiobooksSchema.audiobooks.id })
        .from(audiobooksSchema.audiobooks)
        .where(eq(audiobooksSchema.audiobooks.filePath, unit.path))
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
      const metadata = await this.metadataProvider.extractMetadata(primaryFile);

      // Get file info for all files
      const fileInfos: AudioFileInfo[] = [];
      for (const file of unit.files) {
        const info = await this.metadataProvider.getFileInfo(file);
        fileInfos.push(info);
      }

      // Calculate total duration
      const totalDuration = fileInfos.reduce((sum, f) => sum + f.duration, 0);

      // Determine title from metadata or folder/file name
      const title = metadata.title || this.inferTitleFromPath(unit.path, unit.type);

      // Create audiobook record
      const [audiobook] = await this.db
        .insert(audiobooksSchema.audiobooks)
        .values({
          title,
          subtitle: metadata.subtitle,
          description: metadata.description,
          publisher: metadata.publisher,
          language: metadata.language,
          publishedDate: metadata.publishedDate,
          duration: totalDuration,
          coverUrl: metadata.coverPath,
          coverSource: metadata.coverPath ? 'embedded' : undefined,
          filePath: unit.path,
          status: 'available',
        })
        .returning();

      // Create file records
      for (let i = 0; i < fileInfos.length; i++) {
        const fileInfo = fileInfos[i];
        await this.db.insert(audiobooksSchema.audiobookFiles).values({
          audiobookId: audiobook.id,
          filePath: fileInfo.filePath,
          fileName: fileInfo.fileName,
          order: i,
          duration: fileInfo.duration,
          format: fileInfo.format,
          bitrate: fileInfo.bitrate,
          sampleRate: fileInfo.sampleRate,
          sizeBytes: fileInfo.sizeBytes,
        });
      }

      // Extract and create chapters (from primary file for M4B)
      const chapters = await this.metadataProvider.extractChapters(primaryFile);
      for (let i = 0; i < chapters.length; i++) {
        const chapter = chapters[i];
        await this.db.insert(audiobooksSchema.chapters).values({
          audiobookId: audiobook.id,
          title: chapter.title,
          startTime: chapter.startTime,
          endTime: chapter.endTime,
          order: i,
          source: 'embedded',
        });
      }

      // Create author if present
      if (metadata.author) {
        await this.createOrLinkPerson(audiobook.id, metadata.author, 'author');
      }

      // Create narrator if present
      if (metadata.narrator) {
        await this.createOrLinkPerson(audiobook.id, metadata.narrator, 'narrator');
      }

      // Clear any previous errors for this path
      await this.importErrorsService.clearResolvedByPath(unit.path);

      this.logger.log(`Imported audiobook: ${title} (${audiobook.id})`);
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

  private inferTitleFromPath(audiobookPath: string, type: 'single-file' | 'multi-file'): string {
    if (type === 'single-file') {
      // Use filename without extension
      return path.basename(audiobookPath, path.extname(audiobookPath));
    }
    // Use folder name
    return path.basename(audiobookPath);
  }

  private async createOrLinkPerson(
    audiobookId: string,
    name: string,
    role: 'author' | 'narrator',
  ): Promise<void> {
    // Check if person exists
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

    // Link to audiobook
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
}
