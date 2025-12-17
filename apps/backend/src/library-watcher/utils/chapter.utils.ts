import * as path from 'path';
import { AudioFileInfo } from '../metadata/embedded-metadata.provider';

export interface GeneratedChapter {
  title: string;
  startTime: number;
  endTime: number;
}

/**
 * Generate chapter boundaries from a list of audio files.
 *
 * ## Purpose
 * Multi-file audiobooks (e.g., one MP3 per chapter) often lack embedded chapter
 * markers. This function creates synthetic chapters based on file boundaries.
 *
 * ## Algorithm
 * 1. Process files in order (assumed to be sorted by filename)
 * 2. Each file becomes one chapter
 * 3. Chapter title = filename without extension
 * 4. Times are cumulative:
 *    - File 1: start=0, end=duration1
 *    - File 2: start=duration1, end=duration1+duration2
 *    - etc.
 *
 * ## When to Use
 * Only for multi-file audiobooks with NO embedded chapters.
 * If embedded chapters exist, prefer those (they have author-intended titles).
 *
 * ## Example
 * Files: ["01 - Intro.mp3" (5min), "02 - Chapter 1.mp3" (30min)]
 * Result:
 * - { title: "01 - Intro", startTime: 0, endTime: 300 }
 * - { title: "02 - Chapter 1", startTime: 300, endTime: 2100 }
 *
 * @param fileInfos - Ordered array of audio file info with durations
 * @returns Array of generated chapters with cumulative timing
 */
export function generateChaptersFromFiles(
  fileInfos: AudioFileInfo[],
): GeneratedChapter[] {
  let cumulativeTime = 0;

  return fileInfos.map((file) => {
    const startTime = cumulativeTime;
    const endTime = cumulativeTime + file.duration;
    cumulativeTime = endTime;

    const title = path.basename(file.fileName, path.extname(file.fileName));
    return { title, startTime, endTime };
  });
}
