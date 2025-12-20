export interface AudnexusChapter {
  title: string;
  lengthMs: number;
  startOffsetMs: number;
  startOffsetSec: number;
}

export interface AudnexusChapterResponse {
  asin: string;
  brandIntroDurationMs?: number;
  brandOutroDurationMs?: number;
  chapters: AudnexusChapter[];
  isAccurate: boolean;
  region: string;
  runtimeLengthMs: number;
  runtimeLengthSec: number;
}

// Transformed response for frontend
export interface ChapterData {
  title: string;
  startTime: number; // seconds
  endTime?: number; // seconds
  lengthSeconds: number;
}

export interface ChaptersResponse {
  asin: string;
  chapters: ChapterData[];
  totalDuration: number; // seconds
  isAccurate: boolean;
}
