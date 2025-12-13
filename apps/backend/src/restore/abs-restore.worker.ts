// Worker thread for ABS backup parsing - runs in separate thread to avoid blocking main event loop
// better-sqlite3 is synchronous by design, so we run it in a worker
import { parentPort } from 'worker_threads';
import * as fs from 'fs/promises';
import * as path from 'path';
import Database from 'better-sqlite3';

// Types (copied from abs-backup.types.ts to avoid import issues in worker)
interface ABSBackupDetails {
  backupName: string;
  backupType: string;
  timestamp: number;
  version: string;
}

interface ABSLibrary {
  id: string;
  name: string;
  mediaType: 'book' | 'podcast';
  displayOrder: number;
}

interface ABSLibraryFolder {
  id: string;
  path: string;
  libraryId: string;
}

interface ABSLibraryItem {
  id: string;
  path: string;
  relPath: string;
  mediaId: string;
  mediaType: string;
  libraryId: string;
  title: string;
  authorNamesFirstLast: string | null;
  createdAt: string;
}

interface ABSBook {
  id: string;
  title: string;
  titleIgnorePrefix: string | null;
  subtitle: string | null;
  publishedYear: string | null;
  publishedDate: string | null;
  publisher: string | null;
  description: string | null;
  isbn: string | null;
  asin: string | null;
  language: string | null;
  explicit: boolean;
  abridged: boolean;
  coverPath: string | null;
  duration: number | null;
  narrators: string[] | null;
  audioFiles: ABSAudioFile[] | null;
  chapters: ABSChapter[] | null;
  genres: string[] | null;
}

interface ABSAudioFile {
  index: number;
  ino: string;
  metadata: {
    filename: string;
    ext: string;
    path: string;
    relPath: string;
    size: number;
  };
  duration: number;
  bitRate: number;
  format: string;
}

interface ABSChapter {
  id: number;
  start: number;
  end: number;
  title: string;
}

interface ABSAuthor {
  id: string;
  name: string;
  lastFirst: string | null;
  asin: string | null;
  description: string | null;
  imagePath: string | null;
  libraryId: string;
}

interface ABSBookAuthor {
  id: string;
  bookId: string;
  authorId: string;
  createdAt: string;
}

interface ABSSeries {
  id: string;
  name: string;
  nameIgnorePrefix: string | null;
  description: string | null;
  libraryId: string;
}

interface ABSBookSeries {
  id: string;
  bookId: string;
  seriesId: string;
  sequence: string | null;
}

interface ABSUser {
  id: string;
  username: string;
  email: string | null;
  type: string;
}

interface ABSMediaProgress {
  id: string;
  mediaItemId: string;
  mediaItemType: string;
  userId: string;
  duration: number;
  currentTime: number;
  isFinished: boolean;
  hideFromContinueListening: boolean;
  finishedAt: string | null;
}

interface ABSMetadataJson {
  title: string;
  subtitle: string | null;
  authors: string[];
  narrators: string[];
  series: string[];
  genres: string[];
  publishedYear: string | null;
  publishedDate: string | null;
  publisher: string | null;
  description: string | null;
  isbn: string | null;
  asin: string | null;
  language: string | null;
  explicit: boolean;
  abridged: boolean;
  chapters: ABSChapter[];
  tags: string[];
}

interface ParsedBackup {
  details: ABSBackupDetails;
  libraries: ABSLibrary[];
  libraryFolders: Record<string, ABSLibraryFolder[]>; // Use Record for JSON serialization
}

interface LibraryData {
  libraryItems: ABSLibraryItem[];
  books: Record<string, ABSBook>; // Use Record for JSON serialization
  authors: ABSAuthor[];
  bookAuthors: ABSBookAuthor[];
  series: ABSSeries[];
  bookSeries: ABSBookSeries[];
  users: ABSUser[];
  mediaProgresses: ABSMediaProgress[];
}

interface WorkerTask {
  type: 'parseBackupDetails' | 'parseLibraryData' | 'readMetadataJson';
  extractedPath: string;
  libraryId?: string;
  absBookId?: string;
  taskId: string;
}

interface WorkerResponse {
  taskId: string;
  success: boolean;
  result?: ParsedBackup | LibraryData | ABSMetadataJson | null;
  error?: string;
}

async function parseBackupDetails(
  extractedPath: string,
): Promise<ParsedBackup> {
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

  // Open SQLite database
  const dbPath = path.join(extractedPath, 'absdatabase.sqlite');
  const db = new Database(dbPath, { readonly: true });

  try {
    // Get libraries
    const libraries = db
      .prepare('SELECT * FROM libraries WHERE mediaType = ?')
      .all('book') as ABSLibrary[];

    // Get library folders for each library
    const libraryFolders: Record<string, ABSLibraryFolder[]> = {};
    for (const library of libraries) {
      const folders = db
        .prepare('SELECT * FROM libraryFolders WHERE libraryId = ?')
        .all(library.id) as ABSLibraryFolder[];
      libraryFolders[library.id] = folders;
    }

    return { details, libraries, libraryFolders };
  } finally {
    db.close();
  }
}

async function parseLibraryData(
  extractedPath: string,
  libraryId: string,
): Promise<LibraryData> {
  const dbPath = path.join(extractedPath, 'absdatabase.sqlite');
  const db = new Database(dbPath, { readonly: true });

  try {
    // Get library items for this library
    const libraryItems = db
      .prepare(
        `
      SELECT id, path, relPath, mediaId, mediaType, libraryId, title, authorNamesFirstLast, createdAt
      FROM libraryItems
      WHERE libraryId = ? AND mediaType = 'book'
    `,
      )
      .all(libraryId) as ABSLibraryItem[];

    // Get books for these items
    const mediaIds = libraryItems.map((item) => item.mediaId);
    const books: Record<string, ABSBook> = {};

    if (mediaIds.length > 0) {
      const placeholders = mediaIds.map(() => '?').join(',');
      const booksResult = db
        .prepare(`SELECT * FROM books WHERE id IN (${placeholders})`)
        .all(...mediaIds) as any[];

      for (const book of booksResult) {
        // Parse JSON fields
        books[book.id] = {
          ...book,
          narrators: book.narrators ? JSON.parse(book.narrators) : null,
          audioFiles: book.audioFiles ? JSON.parse(book.audioFiles) : null,
          chapters: book.chapters ? JSON.parse(book.chapters) : null,
          genres: book.genres ? JSON.parse(book.genres) : null,
        };
      }
    }

    // Get authors for this library
    const authors = db
      .prepare('SELECT * FROM authors WHERE libraryId = ?')
      .all(libraryId) as ABSAuthor[];

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

async function readMetadataJson(
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

async function handleTask(task: WorkerTask): Promise<WorkerResponse> {
  try {
    let result: ParsedBackup | LibraryData | ABSMetadataJson | null;

    switch (task.type) {
      case 'parseBackupDetails':
        result = await parseBackupDetails(task.extractedPath);
        break;
      case 'parseLibraryData':
        if (!task.libraryId) {
          throw new Error('libraryId is required for parseLibraryData');
        }
        result = await parseLibraryData(task.extractedPath, task.libraryId);
        break;
      case 'readMetadataJson':
        if (!task.absBookId) {
          throw new Error('absBookId is required for readMetadataJson');
        }
        result = await readMetadataJson(task.extractedPath, task.absBookId);
        break;
      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }

    return { taskId: task.taskId, success: true, result };
  } catch (error) {
    return {
      taskId: task.taskId,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Handle messages from main thread
if (parentPort) {
  parentPort.on('message', async (task: WorkerTask) => {
    const response = await handleTask(task);
    parentPort!.postMessage(response);
  });
}
