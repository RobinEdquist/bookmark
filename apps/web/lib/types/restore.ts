// Types for AudioBookShelf restore functionality

export enum RestoreSessionState {
  UPLOADING = "uploading",
  PARSING = "parsing",
  MAPPING = "mapping",
  PREVIEWING = "previewing",
  IMPORTING = "importing",
  COMPLETED = "completed",
  FAILED = "failed",
  ROLLED_BACK = "rolled_back",
}

export type RestoreStep =
  | 'upload'
  | 'select-library'
  | 'path-mapping'
  | 'user-mapping'
  | 'options'
  | 'preview'
  | 'import'
  | 'complete';

export interface BackupInfo {
  version: string;
  timestamp: string;
  serverVersion: string;
}

export interface ABSLibrary {
  id: string;
  name: string;
  mediaType: 'book' | 'podcast';
  bookCount: number;
}

export interface PathMapping {
  absPath: string;
  savPath: string;
}

export interface UserMapping {
  absUserId: string;
  absUsername: string;
  savUserId: string | null; // null means skip this user
  progressCount: number;
  inProgressCount: number;
  finishedCount: number;
}

export interface RestoreOptions {
  importProgress: boolean;
  importCovers: boolean;
  importAuthorImages: boolean;
  overwriteExisting: boolean;
  lockMetadata: boolean;
}

export interface RestoreSession {
  id: string;
  state: RestoreSessionState;
  startedAt: Date;
  completedAt?: Date;
  totalItems: number;
  processedItems: number;
  errorMessage?: string;
  pathMappings: PathMapping[];
  userMappings: UserMapping[];
  options: RestoreOptions;
  extractedPath?: string;
  selectedLibraryId?: string;
}

export interface AudiobookPreviewItem {
  title: string;
  author: string;
  absPath: string;
  savPath: string;
  found: boolean;
  reason?: string;
}

export interface ImportPreview {
  audiobooksToImport: {
    count: number;
    sample: AudiobookPreviewItem[];
  };
  audiobooksToSkip: {
    count: number;
    sample: AudiobookPreviewItem[];
  };
  authorsToImport: number;
  narratorsToImport: number;
  seriesToImport: number;
  genresToImport: number;
  chaptersToImport: number;
  usersToMap: {
    total: number;
    mapped: number;
    skipped: number;
  };
  progressRecordsToImport: number;
  coversToImport: number;
  authorImagesToImport: number;
  warnings: string[];
}

export interface RestoreProgress {
  sessionId: string;
  state: RestoreSessionState;
  processedItems: number;
  totalItems: number;
  currentOperation: string;
  errors: string[];
  percentage: number;
}

export interface AvailableLibrary {
  id: string;
  name: string;
  folders: string[];
}

export interface UploadBackupResponse {
  success: boolean;
  session: {
    id: string;
    state: string;
    availableLibraries?: AvailableLibrary[];
  };
}

export interface SavUser {
  id: string;
  name: string;
  email: string;
}

export interface PathValidation {
  found: number;
  missing: number;
  missingBooks: Array<{
    id: string;
    title: string;
    author: string;
    relPath: string;
  }>;
}

export interface RestoreLogEvent {
  level: 'info' | 'warn' | 'error';
  message: string;
  timestamp: string;
}

export interface RestoreSummary {
  success: boolean;
  duration: number;
  audiobooks: number;
  people: number;
  series: number;
  genres: number;
  chapters: number;
  progress: number;
  covers: number;
  authorImages: number;
  errors: string[];
  warnings: string[];
}

export type RestoreProgressEvent =
  | { type: 'progress'; data: RestoreProgress }
  | { type: 'log'; data: RestoreLogEvent }
  | { type: 'complete'; data: RestoreSummary };

export interface ApiSuccessResponse {
  success: boolean;
  message: string;
}
