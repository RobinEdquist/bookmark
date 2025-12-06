import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import Database from 'better-sqlite3';
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

@Injectable()
export class AbsParserService {
  private readonly logger = new Logger(AbsParserService.name);

  async parseBackupDetails(extractedPath: string): Promise<ParsedBackup> {
    this.logger.log(`[ABS-RESTORE] Parsing backup at: ${extractedPath}`);

    // Read details file
    const detailsPath = path.join(extractedPath, 'details');
    const detailsContent = await fs.readFile(detailsPath, 'utf-8');
    const detailsLines = detailsContent.trim().split('\n');

    const details: ABSBackupDetails = {
      backupName: detailsLines[0] || '',
      backupType: detailsLines[1] || 'sqlite',
      timestamp: parseInt(detailsLines[2] || '0', 10),
      version: detailsLines[3] || 'unknown',
    };

    this.logger.log(
      `[ABS-RESTORE] Backup version: ${details.version}, created: ${new Date(details.timestamp).toISOString()}`,
    );

    // Open SQLite database
    const dbPath = path.join(extractedPath, 'absdatabase.sqlite');
    const db = new Database(dbPath, { readonly: true });

    try {
      // Get libraries
      const libraries = db
        .prepare('SELECT * FROM libraries WHERE mediaType = ?')
        .all('book') as ABSLibrary[];
      this.logger.log(
        `[ABS-RESTORE] Found ${libraries.length} audiobook libraries`,
      );

      // Get library folders for each library
      const libraryFolders = new Map<string, ABSLibraryFolder[]>();
      for (const library of libraries) {
        const folders = db
          .prepare('SELECT * FROM libraryFolders WHERE libraryId = ?')
          .all(library.id) as ABSLibraryFolder[];
        libraryFolders.set(library.id, folders);
        this.logger.log(
          `[ABS-RESTORE]   - "${library.name}": ${folders.length} folders`,
        );
      }

      return { details, libraries, libraryFolders };
    } finally {
      db.close();
    }
  }

  async parseLibraryData(
    extractedPath: string,
    libraryId: string,
  ): Promise<LibraryData> {
    this.logger.log(`[ABS-RESTORE] Parsing library data for: ${libraryId}`);

    const dbPath = path.join(extractedPath, 'absdatabase.sqlite');
    const db = new Database(dbPath, { readonly: true });

    try {
      // Get library items for this library
      const libraryItems = db
        .prepare(
          `
        SELECT id, path, relPath, mediaId, mediaType, libraryId, title, authorNamesFirstLast
        FROM libraryItems
        WHERE libraryId = ? AND mediaType = 'book'
      `,
        )
        .all(libraryId) as ABSLibraryItem[];
      this.logger.log(
        `[ABS-RESTORE] Found ${libraryItems.length} library items`,
      );

      // Get books for these items
      const mediaIds = libraryItems.map((item) => item.mediaId);
      const books = new Map<string, ABSBook>();

      if (mediaIds.length > 0) {
        const placeholders = mediaIds.map(() => '?').join(',');
        const booksResult = db
          .prepare(`SELECT * FROM books WHERE id IN (${placeholders})`)
          .all(...mediaIds) as any[];

        for (const book of booksResult) {
          // Parse JSON fields
          books.set(book.id, {
            ...book,
            narrators: book.narrators ? JSON.parse(book.narrators) : null,
            audioFiles: book.audioFiles ? JSON.parse(book.audioFiles) : null,
            chapters: book.chapters ? JSON.parse(book.chapters) : null,
            genres: book.genres ? JSON.parse(book.genres) : null,
          });
        }
        this.logger.log(`[ABS-RESTORE] Found ${books.size} books`);
      }

      // Get authors for this library
      const authors = db
        .prepare('SELECT * FROM authors WHERE libraryId = ?')
        .all(libraryId) as ABSAuthor[];
      this.logger.log(`[ABS-RESTORE] Found ${authors.length} authors`);

      // Get book-author relationships
      const bookAuthors = db
        .prepare(
          `
        SELECT ba.* FROM bookAuthors ba
        INNER JOIN libraryItems li ON ba.bookId = li.mediaId
        WHERE li.libraryId = ?
      `,
        )
        .all(libraryId) as ABSBookAuthor[];

      // Get series for this library
      const series = db
        .prepare('SELECT * FROM series WHERE libraryId = ?')
        .all(libraryId) as ABSSeries[];
      this.logger.log(`[ABS-RESTORE] Found ${series.length} series`);

      // Get book-series relationships
      const bookSeries = db
        .prepare(
          `
        SELECT bs.* FROM bookSeries bs
        INNER JOIN libraryItems li ON bs.bookId = li.mediaId
        WHERE li.libraryId = ?
      `,
        )
        .all(libraryId) as ABSBookSeries[];

      // Get all users with progress
      const users = db
        .prepare(
          `
        SELECT DISTINCT u.* FROM users u
        INNER JOIN mediaProgresses mp ON u.id = mp.userId
        INNER JOIN libraryItems li ON mp.mediaItemId = li.mediaId
        WHERE li.libraryId = ?
      `,
        )
        .all(libraryId) as ABSUser[];
      this.logger.log(
        `[ABS-RESTORE] Found ${users.length} users with progress`,
      );

      // Get media progress for this library
      const mediaProgresses = db
        .prepare(
          `
        SELECT mp.* FROM mediaProgresses mp
        INNER JOIN libraryItems li ON mp.mediaItemId = li.mediaId
        WHERE li.libraryId = ?
      `,
        )
        .all(libraryId) as ABSMediaProgress[];
      this.logger.log(
        `[ABS-RESTORE] Found ${mediaProgresses.length} progress records`,
      );

      return {
        libraryItems,
        books,
        authors,
        bookAuthors,
        series,
        bookSeries,
        users,
        mediaProgresses,
      };
    } finally {
      db.close();
    }
  }

  async readMetadataJson(
    extractedPath: string,
    absBookId: string,
  ): Promise<ABSMetadataJson | null> {
    const metadataPath = path.join(
      extractedPath,
      'metadata-items',
      absBookId,
      'metadata.json',
    );

    try {
      const content = await fs.readFile(metadataPath, 'utf-8');
      return JSON.parse(content) as ABSMetadataJson;
    } catch {
      return null;
    }
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
