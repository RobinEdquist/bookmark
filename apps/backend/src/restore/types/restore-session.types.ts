// Types for restore session management

export enum RestoreSessionState {
  UPLOADING = 'uploading',
  PARSING = 'parsing',
  MAPPING = 'mapping',
  PREVIEWING = 'previewing',
  IMPORTING = 'importing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  ROLLED_BACK = 'rolled_back',
}

export interface PathMapping {
  absPath: string;
  savPath: string;
}

export interface UserMapping {
  absUserId: string;
  savUserId: string | null; // null means skip this user
}

export interface RestoreOptions {
  importProgress: boolean;
  importCovers: boolean;
  importAuthorImages: boolean;
  overwriteExisting: boolean;
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
  extractedPath?: string; // Path to extracted backup contents
  selectedLibraryId?: string; // Selected ABS library ID
}

export interface AudiobookPreviewItem {
  title: string;
  author: string;
  absPath: string;
  savPath: string;
  found: boolean;
  reason?: string; // Why not found or other notes
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
