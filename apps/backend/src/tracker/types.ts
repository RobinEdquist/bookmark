// Tracker Search Types
export interface TrackerSearchParams {
  query: string;
  categories?: string[]; // content-type ids: 'audiobook', 'ebook'
  searchIn?: string[]; // Fields to search: title, author, narrator, series, tags, description
  languages?: number[]; // Language IDs
  perPage?: number;
  offset?: number;
}

export interface TrackerSeries {
  name: string;
  number?: string | null;
}

// A single, pre-parsed search result. The tracker client resolves all
// upstream formatting quirks before returning these.
export interface TrackerSearchResult {
  id: number;
  title: string;
  author?: string | null;
  narrator?: string | null;
  series?: TrackerSeries[] | null;
  description?: string | null;
  contentType: 'audiobook' | 'ebook';
  categoryId: number;
  categoryName?: string;
  size?: string;
  language?: string;
  fileType?: string;
  tags?: string[];
  addedDate?: string;
}

export interface TrackerSearchResponse {
  results: TrackerSearchResult[];
  total: number;
}

// Tracker Download Types
export interface TrackerDownloadOptions {
  category?: string; // download client category (e.g., "audiobooks", "books")
  tags?: string;
  paused?: boolean;
  savepath?: string;
  usePersonalFL?: boolean; // Spend a personal freeleech wedge before downloading
}

export interface TrackerDownloadResponse {
  status: string;
  message: string;
  hash: string;
}

// Torrent Status Types
export interface TorrentFile {
  name: string;
  size: number;
}

export interface TorrentStatus {
  hash: string;
  name: string;
  // Download client states: downloading, stalledDL, metaDL, pausedDL, queuedDL, checkingDL, forcedDL,
  // uploading, stalledUP, pausedUP, queuedUP, checkingUP, forcedUP, checkingResumeData,
  // moving, missingFiles, error, allocating, completed, seeding
  // We also use 'not_found' for missing torrents
  state: string;
  progress: number;
  size?: number;
  downloaded?: number;
  files?: TorrentFile[];
}

export interface BulkTorrentStatus {
  torrents: TorrentStatus[];
}
