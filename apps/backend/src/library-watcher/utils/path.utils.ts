import * as path from 'path';
import { AudiobookUnit, EbookUnit } from '../media-detector.service';

export interface AudiobookPathResult {
  isRootLevelFile: boolean;
  relativeUnitPath: string;
}

/**
 * Calculate path storage values for an audiobook unit.
 *
 * ## Background
 * Audiobooks can exist in two locations within the library:
 * 1. **Root-level files**: Single audio files directly in the library root (e.g., `/library/MyBook.m4b`)
 * 2. **Subdirectory audiobooks**: Audio files inside folders (e.g., `/library/Author - Title/book.m4b`)
 *
 * ## Storage Strategy
 * The `audiobooks.filePath` column stores the RELATIVE PATH from the library root to the audiobook's location:
 * - Root-level files: `""` (empty string) - indicates the file is at library root
 * - Subdirectory audiobooks: `"Author - Title"` or `"A/B/C"` - the folder path
 *
 * The `audiobookFiles.filePath` column stores just the FILENAME (e.g., `"book.m4b"`).
 *
 * Full path reconstruction: `{libraryPath}/{audiobook.filePath}/{file.filePath}`
 *
 * ## Detection Logic
 * The MediaDetectorService creates AudiobookUnit objects differently based on location:
 * - Root-level: `unit.path === unit.files[0]` (both are the file path)
 * - Subdirectory: `unit.path !== unit.files[0]` (unit.path is folder, files[0] is file inside)
 *
 * This function uses that invariant to distinguish between the two cases.
 *
 * ## Historical Bug (Fixed)
 * Previously, the detection used `path.dirname(unit.path) === libraryPath` which incorrectly
 * identified subdirectory audiobooks as root-level when the folder was directly under library root.
 *
 * @param unit - The audiobook unit from the detector (contains path and files array)
 * @param libraryPath - The absolute path to the audiobook library root
 * @returns Object with isRootLevelFile flag and the relative path to store
 */
export function calculateAudiobookPaths(
  unit: AudiobookUnit,
  libraryPath: string,
): AudiobookPathResult {
  const primaryFile = unit.files[0];
  // Root-level files: unit.path points to the file itself
  // Subdirectory audiobooks: unit.path points to the containing folder
  const isRootLevelFile =
    unit.type === 'single-file' && unit.path === primaryFile;
  const relativeUnitPath = isRootLevelFile
    ? ''
    : path.relative(libraryPath, unit.path);
  return { isRootLevelFile, relativeUnitPath };
}

/**
 * Calculate relative file path for an ebook.
 *
 * ## Background
 * Unlike audiobooks (which can be multi-file), ebooks are always single files.
 * The `ebooks.filePath` stores the relative path from library root to the file itself.
 *
 * ## Examples
 * - `/library/Book.epub` -> `"Book.epub"`
 * - `/library/Author/Series/Book.epub` -> `"Author/Series/Book.epub"`
 *
 * @param unit - The ebook unit from the detector (contains absolute file path)
 * @param libraryPath - The absolute path to the ebook library root
 * @returns Relative path from library root to the ebook file
 */
export function calculateEbookPath(
  unit: EbookUnit,
  libraryPath: string,
): string {
  return path.relative(libraryPath, unit.path);
}

/**
 * Build full file path from audiobook record + file record.
 *
 * ## Purpose
 * Reconstructs the absolute path to an audio file for:
 * - Streaming audio to the player
 * - Rescanning metadata from existing files
 * - Cover extraction from audio files
 *
 * ## Formula
 * `{libraryPath}/{audiobook.filePath}/{file.filePath}`
 *
 * ## Edge Cases
 * - Root-level files: `audiobook.filePath` is empty string, resulting in
 *   `path.join(libraryPath, '', filename)` -> `{libraryPath}/{filename}`
 * - Subdirectory files: Normal path joining
 *
 * @param libraryPath - Absolute path to audiobook library root
 * @param audiobookFilePath - Relative folder path from audiobook record (may be empty)
 * @param fileFilePath - Filename from audiobookFiles record
 * @returns Absolute path to the audio file
 */
export function resolveAudiobookFilePath(
  libraryPath: string,
  audiobookFilePath: string,
  fileFilePath: string,
): string {
  return path.join(libraryPath, audiobookFilePath, fileFilePath);
}
