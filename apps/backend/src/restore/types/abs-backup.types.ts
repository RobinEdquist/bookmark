// Types representing ABS backup structure

export interface ABSBackupDetails {
  backupName: string;
  backupType: string;
  timestamp: number;
  version: string;
}

export interface ABSLibrary {
  id: string;
  name: string;
  mediaType: 'book' | 'podcast';
  displayOrder: number;
}

export interface ABSLibraryFolder {
  id: string;
  path: string;
  libraryId: string;
}

export interface ABSLibraryItem {
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

export interface ABSBook {
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
  narrators: string[] | null; // JSON array
  audioFiles: ABSAudioFile[] | null; // JSON array
  chapters: ABSChapter[] | null; // JSON array
  genres: string[] | null; // JSON array
}

export interface ABSAudioFile {
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

export interface ABSChapter {
  id: number;
  start: number;
  end: number;
  title: string;
}

export interface ABSAuthor {
  id: string;
  name: string;
  lastFirst: string | null;
  asin: string | null;
  description: string | null;
  imagePath: string | null;
  libraryId: string;
}

export interface ABSBookAuthor {
  id: string;
  bookId: string;
  authorId: string;
  createdAt: string;
}

export interface ABSSeries {
  id: string;
  name: string;
  nameIgnorePrefix: string | null;
  description: string | null;
  libraryId: string;
}

export interface ABSBookSeries {
  id: string;
  bookId: string;
  seriesId: string;
  sequence: string | null;
}

export interface ABSUser {
  id: string;
  username: string;
  email: string | null;
  type: string;
}

export interface ABSMediaProgress {
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

export interface ABSMetadataJson {
  title: string;
  subtitle: string | null;
  authors: string[];
  narrators: string[];
  series: string[]; // Format: "Series Name #1"
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
