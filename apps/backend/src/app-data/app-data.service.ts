import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class AppDataService implements OnModuleInit {
  private readonly logger = new Logger(AppDataService.name);
  private readonly basePath: string;

  constructor(private readonly configService: ConfigService) {
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';
    const configuredPath = this.configService.get<string>('APP_DATA_PATH');

    // In production, APP_DATA_PATH is required (validated in main.ts)
    // In development, default to ./data
    this.basePath = configuredPath || (isProduction ? '' : './data');

    // Security: Validate basePath is not empty in production
    if (isProduction && !this.basePath) {
      throw new Error('APP_DATA_PATH must be configured in production');
    }
  }

  async onModuleInit(): Promise<void> {
    await this.ensureDirectories();
  }

  private async ensureDirectories(): Promise<void> {
    const directories = [
      this.getAudiobookCoversPath(),
      this.getEbookCoversPath(),
      this.getComicSeriesCoversPath(),
      this.getComicBookCoversPath(),
      this.getPeopleImagesPath(),
      this.getTempPath(),
      this.getComicPageCacheBasePath(),
    ];

    for (const dir of directories) {
      try {
        await fs.mkdir(dir, { recursive: true });
        this.logger.log(`Ensured directory exists: ${dir}`);
      } catch (error) {
        this.logger.error(`Failed to create directory ${dir}:`, error);
        throw error;
      }
    }
  }

  getBasePath(): string {
    return this.basePath;
  }

  /**
   * Directory names under the base path holding durable managed state that
   * belongs in backups. Caches (comic-page-cache), temp, and the bundled
   * database directory are deliberately excluded. A new directory added to
   * ensureDirectories() that holds durable data must be added here too, or
   * backups will silently miss it.
   */
  getBackedUpDirectoryNames(): readonly string[] {
    return [
      'audiobook-covers',
      'ebook-covers',
      'comic-series-covers',
      'comic-book-covers',
      'people-images',
    ];
  }

  getAudiobookCoversPath(): string {
    return path.join(this.basePath, 'audiobook-covers');
  }

  getEbookCoversPath(): string {
    return path.join(this.basePath, 'ebook-covers');
  }

  getComicSeriesCoversPath(): string {
    return path.join(this.basePath, 'comic-series-covers');
  }

  getComicBookCoversPath(): string {
    return path.join(this.basePath, 'comic-book-covers');
  }

  getPeopleImagesPath(): string {
    return path.join(this.basePath, 'people-images');
  }

  getTempPath(): string {
    return path.join(this.basePath, 'temp');
  }

  getAudiobookCoverPath(audiobookId: string): string {
    return path.join(
      this.getAudiobookCoversPath(),
      `${this.sanitizeId(audiobookId)}.jpg`,
    );
  }

  getEbookCoverPath(ebookId: string): string {
    return path.join(
      this.getEbookCoversPath(),
      `${this.sanitizeId(ebookId)}.jpg`,
    );
  }

  getComicSeriesCoverPath(seriesId: string): string {
    return path.join(
      this.getComicSeriesCoversPath(),
      `${this.sanitizeId(seriesId)}.jpg`,
    );
  }

  getComicBookCoverPath(bookId: string): string {
    return path.join(
      this.getComicBookCoversPath(),
      `${this.sanitizeId(bookId)}.jpg`,
    );
  }

  getComicPageCacheBasePath(): string {
    return path.join(this.basePath, 'comic-page-cache');
  }

  /** Directory holding cached page images for one comic book. */
  getComicPageCacheDir(bookId: string): string {
    return path.join(this.getComicPageCacheBasePath(), this.sanitizeId(bookId));
  }

  /**
   * Cache file for a specific page + render variant.
   * `variant` distinguishes sizes, e.g. "oxo" (no resize) or "1200x0"
   * (width-capped).
   */
  getComicPageCachePath(
    bookId: string,
    pageIndex: number,
    variant: string,
  ): string {
    const safeVariant = variant.replace(/[^a-zA-Z0-9_x-]/g, '');
    return path.join(
      this.getComicPageCacheDir(bookId),
      `${pageIndex}_${safeVariant}.jpg`,
    );
  }

  getPersonImagePath(personId: string): string {
    return path.join(
      this.getPeopleImagesPath(),
      `${this.sanitizeId(personId)}.jpg`,
    );
  }

  getTempSessionPath(sessionId: string): string {
    return path.join(this.getTempPath(), this.sanitizeId(sessionId));
  }

  /** Base directory for in-progress TTS generation artifacts. */
  getTtsJobsTempPath(): string {
    return path.join(this.getTempPath(), 'tts-jobs');
  }

  /** Working directory for one TTS generation job (chapter wavs, m4b). */
  getTtsJobTempPath(jobId: string): string {
    return path.join(this.getTtsJobsTempPath(), this.sanitizeId(jobId));
  }

  /**
   * Sanitizes an ID to prevent path traversal attacks.
   * Removes any characters that could be used to navigate directories.
   * @param id - The ID to sanitize
   * @returns A safe ID containing only alphanumeric characters, underscores, and hyphens
   */
  private sanitizeId(id: string): string {
    return id.replace(/[^a-zA-Z0-9_-]/g, '');
  }
}
