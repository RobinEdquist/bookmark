import { Inject, Injectable, Logger } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as path from 'path';
import * as fs from 'fs/promises';
import { DATABASE_CONNECTION } from '../database/database-connection.constants';
import * as ebooksSchema from '../ebooks/schema';
import * as audiobooksSchema from '../audiobooks/schema';
import { EbookMetadataProvider } from './metadata/ebook-metadata.provider';
import { EbookDetectorService, EbookUnit } from './ebook-detector.service';
import { ImportErrorsService } from '../import-errors/import-errors.service';
import { AppEventsService } from '../events/app-events.service';
import { WsEventsService } from '../events/ws-events.service';

@Injectable()
export class EbookImporterService {
  private readonly logger = new Logger(EbookImporterService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private db: NodePgDatabase<typeof ebooksSchema>,
    private metadataProvider: EbookMetadataProvider,
    private ebookDetector: EbookDetectorService,
    private importErrorsService: ImportErrorsService,
    private appEvents: AppEventsService,
    private wsEvents: WsEventsService,
  ) {}

  async importEbook(unit: EbookUnit, libraryPath: string): Promise<string | null> {
    // Convert path to be relative to the library folder
    const relativeFilePath = path.relative(libraryPath, unit.path);

    try {
      // Check if already exists (using relative path)
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
      const metadata = await this.metadataProvider.extractMetadata(unit.path);

      // Get file stats
      const stats = await fs.stat(unit.path);

      // Determine cover source
      let coverSource: 'embedded' | 'filesystem' | undefined = undefined;
      let coverUrl: string | undefined = undefined;

      if (metadata.cover) {
        coverSource = 'embedded';
      } else {
        // Check for cover image file alongside the epub
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
            // File doesn't exist, continue
          }
        }
      }

      // Convert year-only publishedDate to full date format
      const publishedDate = this.normalizePublishedDate(metadata.publishedDate);

      // Create ebook record (storing relative path)
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
          await this.createOrLinkPerson(ebook.id, authorName, i);
        }
      }

      // Clear any previous errors for this path
      await this.importErrorsService.clearResolvedByPath(unit.path);

      this.logger.log(`Imported ebook: ${metadata.title} (${ebook.id})`);
      this.appEvents.ebookCreated(ebook.id);
      this.wsEvents.ebookCreated(ebook.id);
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

  private normalizePublishedDate(dateString: string | undefined): string | undefined {
    if (!dateString) return undefined;

    // If it's just a year (4 digits), convert to YYYY-01-01
    if (/^\d{4}$/.test(dateString)) {
      return `${dateString}-01-01`;
    }

    // If already a valid date format, return as-is
    return dateString;
  }

  private async createOrLinkPerson(
    ebookId: string,
    name: string,
    order: number,
  ): Promise<void> {
    // Check if person exists (using shared people table)
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

    // Link to ebook
    await this.db.insert(ebooksSchema.ebookAuthors).values({
      ebookId,
      personId: person.id,
      order,
    });
  }
}
