// ---------------------------------------------------------------------------
// ComicVine DTOs
// ---------------------------------------------------------------------------
// Typed shapes used by ComicvineService — raw ComicVine API response fields
// mapped into our domain types, plus service-level return shapes.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Raw ComicVine API shapes (as returned by the client's `results` field)
// ---------------------------------------------------------------------------

export interface CvPublisher {
  name: string;
}

export interface CvImage {
  medium_url?: string;
  original_url?: string;
}

export interface CvPersonCredit {
  name: string;
  role: string;
}

export interface CvCharacterCredit {
  name: string;
}

export interface CvStoryArcCredit {
  name: string;
}

export interface CvVolumeRef {
  id: number;
  name: string;
}

/** Raw volume shape from the ComicVine API. */
export interface CvVolumeRaw {
  id: number;
  name: string;
  start_year?: number | string | null;
  publisher?: CvPublisher | null;
  count_of_issues?: number | null;
  description?: string | null;
  image?: CvImage | null;
  site_detail_url?: string | null;
}

/** Raw issue shape from the ComicVine API. */
export interface CvIssueRaw {
  id: number;
  issue_number?: string | null;
  name?: string | null;
  cover_date?: string | null;
  store_date?: string | null;
  volume?: CvVolumeRef | null;
  person_credits?: CvPersonCredit[] | null;
  character_credits?: CvCharacterCredit[] | null;
  story_arc_credits?: CvStoryArcCredit[] | null;
  description?: string | null;
  image?: CvImage | null;
  site_detail_url?: string | null;
}

// ---------------------------------------------------------------------------
// Service return shapes (enriched / DB row types used externally)
// ---------------------------------------------------------------------------

/** A ComicVine volume as stored in the comicvine_volumes cache table. */
export type CachedVolume = {
  id: string; // UUID primary key
  comicvineVolumeId: number;
  name: string;
  startYear: number | null;
  publisherName: string | null;
  countOfIssues: number | null;
  description: string | null;
  imageUrl: string | null;
  siteDetailUrl: string | null;
  syncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

/** A ComicVine issue as stored in the comicvine_issues cache table. */
export type CachedIssue = {
  id: string; // UUID primary key
  comicvineIssueId: number;
  comicvineVolumeId: number | null;
  issueNumber: string | null;
  name: string | null;
  coverDate: string | null;
  storeDate: string | null;
  description: string | null;
  imageUrl: string | null;
  siteDetailUrl: string | null;
  personCredits: { name: string; role: string }[];
  characterCredits: string[];
  storyArcCredits: string[];
  syncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

/** Queue item enriched with series/book title for display. */
export interface QueueItemDto {
  id: string;
  level: 'series' | 'book';
  seriesId: string | null;
  bookId: string | null;
  status: 'pending' | 'processing' | 'failed' | 'needs_review';
  errorMessage: string | null;
  createdAt: Date;
  title: string | null; // series or book title for display
}

/** Signals returned internally by matchSeries / matchBook. */
export type MatchOutcome =
  | { outcome: 'linked'; cvId: number }
  | { outcome: 'needs_review'; reason: string }
  | { outcome: 'no_api_key' };
