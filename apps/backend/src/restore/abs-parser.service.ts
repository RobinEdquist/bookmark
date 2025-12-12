import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  WorkerPoolService,
  getWorkerPath,
} from '../common/worker-pool.service';
import {
  ABSBackupDetails,
  ABSLibrary,
  ABSLibraryFolder,
  ABSLibraryItem,
  ABSBook,
  ABSAuthor,
  ABSBookAuthor,
  ABSSeries,
  ABSBookSeries,
  ABSUser,
  ABSMediaProgress,
  ABSMetadataJson,
} from './types/abs-backup.types';

export interface ParsedBackup {
  details: ABSBackupDetails;
  libraries: ABSLibrary[];
  libraryFolders: Map<string, ABSLibraryFolder[]>; // libraryId -> folders
}

export interface LibraryData {
  libraryItems: ABSLibraryItem[];
  books: Map<string, ABSBook>; // mediaId -> book
  authors: ABSAuthor[];
  bookAuthors: ABSBookAuthor[];
  series: ABSSeries[];
  bookSeries: ABSBookSeries[];
  users: ABSUser[];
  mediaProgresses: ABSMediaProgress[];
}

// Worker returns Records instead of Maps for JSON serialization
interface WorkerParsedBackup {
  details: ABSBackupDetails;
  libraries: ABSLibrary[];
  libraryFolders: Record<string, ABSLibraryFolder[]>;
}

interface WorkerLibraryData {
  libraryItems: ABSLibraryItem[];
  books: Record<string, ABSBook>;
  authors: ABSAuthor[];
  bookAuthors: ABSBookAuthor[];
  series: ABSSeries[];
  bookSeries: ABSBookSeries[];
  users: ABSUser[];
  mediaProgresses: ABSMediaProgress[];
}

const POOL_NAME = 'abs-restore';

@Injectable()
export class AbsParserService implements OnModuleInit {
  private readonly logger = new Logger(AbsParserService.name);

  constructor(private readonly workerPool: WorkerPoolService) {}

  async onModuleInit(): Promise<void> {
    await this.workerPool.initializePool({
      name: POOL_NAME,
      workerScript: getWorkerPath(__dirname, 'abs-restore.worker'),
      minWorkers: 1,
      maxWorkers: 2, // Restore is infrequent, minimal workers needed
    });
  }

  async parseBackupDetails(extractedPath: string): Promise<ParsedBackup> {
    this.logger.log(`[ABS-RESTORE] Parsing backup at: ${extractedPath}`);

    const result = await this.workerPool.executeTask<WorkerParsedBackup>(
      POOL_NAME,
      'parseBackupDetails',
      { extractedPath },
    );

    this.logger.log(
      `[ABS-RESTORE] Backup version: ${result.details.version}, created: ${new Date(result.details.timestamp).toISOString()}`,
    );
    this.logger.log(
      `[ABS-RESTORE] Found ${result.libraries.length} audiobook libraries`,
    );

    // Convert Record back to Map
    const libraryFolders = new Map<string, ABSLibraryFolder[]>();
    for (const [libraryId, folders] of Object.entries(result.libraryFolders)) {
      libraryFolders.set(libraryId, folders);
      this.logger.log(
        `[ABS-RESTORE]   - Library ${libraryId}: ${folders.length} folders`,
      );
    }

    return {
      details: result.details,
      libraries: result.libraries,
      libraryFolders,
    };
  }

  async parseLibraryData(
    extractedPath: string,
    libraryId: string,
  ): Promise<LibraryData> {
    this.logger.log(`[ABS-RESTORE] Parsing library data for: ${libraryId}`);

    const result = await this.workerPool.executeTask<WorkerLibraryData>(
      POOL_NAME,
      'parseLibraryData',
      { extractedPath, libraryId },
    );

    this.logger.log(
      `[ABS-RESTORE] Found ${result.libraryItems.length} library items`,
    );
    this.logger.log(
      `[ABS-RESTORE] Found ${Object.keys(result.books).length} books`,
    );
    this.logger.log(`[ABS-RESTORE] Found ${result.authors.length} authors`);
    this.logger.log(`[ABS-RESTORE] Found ${result.series.length} series`);
    this.logger.log(
      `[ABS-RESTORE] Found ${result.users.length} users with progress`,
    );
    this.logger.log(
      `[ABS-RESTORE] Found ${result.mediaProgresses.length} progress records`,
    );

    // Convert Record back to Map
    const books = new Map<string, ABSBook>();
    for (const [mediaId, book] of Object.entries(result.books)) {
      books.set(mediaId, book);
    }

    return {
      ...result,
      books,
    };
  }

  async readMetadataJson(
    extractedPath: string,
    absBookId: string,
  ): Promise<ABSMetadataJson | null> {
    return this.workerPool.executeTask<ABSMetadataJson | null>(
      POOL_NAME,
      'readMetadataJson',
      { extractedPath, absBookId },
    );
  }

  async getCoverPath(
    extractedPath: string,
    absBookId: string,
  ): Promise<string | null> {
    const coverPath = path.join(
      extractedPath,
      'metadata-items',
      absBookId,
      'cover.jpg',
    );

    try {
      await fs.access(coverPath);
      return coverPath;
    } catch {
      // Try other extensions
      for (const ext of ['.png', '.webp', '.jpeg']) {
        const altPath = path.join(
          extractedPath,
          'metadata-items',
          absBookId,
          `cover${ext}`,
        );
        try {
          await fs.access(altPath);
          return altPath;
        } catch {
          continue;
        }
      }
      return null;
    }
  }

  async getAuthorImagePath(
    extractedPath: string,
    absAuthorId: string,
  ): Promise<string | null> {
    const authorsDir = path.join(extractedPath, 'metadata-authors');

    for (const ext of ['.jpg', '.png', '.webp', '.jpeg']) {
      const imagePath = path.join(authorsDir, `${absAuthorId}${ext}`);
      try {
        await fs.access(imagePath);
        return imagePath;
      } catch {
        continue;
      }
    }
    return null;
  }
}
