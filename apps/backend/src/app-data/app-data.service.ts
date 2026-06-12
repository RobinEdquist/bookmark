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

  getPersonImagePath(personId: string): string {
    return path.join(
      this.getPeopleImagesPath(),
      `${this.sanitizeId(personId)}.jpg`,
    );
  }

  getTempSessionPath(sessionId: string): string {
    return path.join(this.getTempPath(), this.sanitizeId(sessionId));
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
