import * as path from 'path';

/**
 * Sanitize text fields to prevent database parameter binding issues.
 *
 * ## Problem
 * Some Unicode characters (smart quotes, em-dashes, special ellipsis) can cause
 * issues with Drizzle ORM's parameter serialization, leading to database errors
 * or corrupted data during import.
 *
 * ## Solution
 * Replace problematic Unicode characters with their ASCII equivalents:
 * - Smart/curly quotes -> straight quotes
 * - Em-dash, en-dash -> regular hyphen
 * - Ellipsis character -> three periods
 * - Null bytes -> removed (can corrupt string handling)
 *
 * ## When to Use
 * Apply to all user-facing text extracted from audiobook metadata:
 * - Title, subtitle, description
 * - Author, narrator names
 * - Publisher name
 * - Chapter titles
 *
 * @param text - Raw text from metadata extraction (may contain problematic chars)
 * @returns Sanitized text safe for database storage, or undefined if input is empty
 */
export function sanitizeText(text: string | undefined): string | undefined {
  if (!text) return undefined;

  return (
    text
      // Replace smart/curly quotes with straight quotes
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'") // single quotes
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"') // double quotes
      // Replace various dashes with regular hyphen
      .replace(/[\u2013\u2014\u2015]/g, '-') // en-dash, em-dash, horizontal bar
      // Replace ellipsis character with three dots
      .replace(/\u2026/g, '...')
      // Remove null bytes that might be embedded
      .replace(/\0/g, '')
  );
}

/**
 * Normalize published date to a consistent format for database storage.
 *
 * ## Problem
 * Audiobook metadata contains dates in many formats:
 * - Year only: "2023", "1999"
 * - ISO dates: "2023-06-15"
 * - Various locale formats: "June 15, 2023", "15/06/2023"
 *
 * ## Solution
 * Normalize to ISO format (YYYY-MM-DD) for consistent querying:
 * - Year-only -> "YYYY-01-01" (assume January 1st)
 * - Valid dates -> pass through
 * - Invalid dates -> return undefined (don't store garbage)
 *
 * ## Validation
 * - Years must be 4 digits and reasonable (1000-2100)
 * - Full dates must parse to valid Date objects
 *
 * @param dateString - Raw date string from metadata
 * @returns Normalized ISO date string, or undefined if invalid
 */
export function normalizePublishedDate(
  dateString: string | undefined,
): string | undefined {
  if (!dateString) return undefined;

  // Handle year-only format (must be 4 digits and reasonable)
  if (/^\d{4}$/.test(dateString)) {
    const year = parseInt(dateString, 10);
    if (year >= 1000 && year <= 2100) {
      return `${dateString}-01-01`;
    }
    return undefined; // Invalid year
  }

  // Try to parse as date - if invalid, return undefined
  const parsed = new Date(dateString);
  if (isNaN(parsed.getTime())) {
    return undefined;
  }

  return dateString;
}

/**
 * Infer audiobook title from file/folder path when metadata is missing.
 *
 * ## Problem
 * Not all audiobooks have embedded title metadata. We need a fallback.
 *
 * ## Strategy
 * - Single-file audiobooks: Use filename without extension
 *   - `/library/My Audiobook.m4b` -> "My Audiobook"
 * - Multi-file audiobooks: Use folder name
 *   - `/library/Author - Title/part1.mp3` -> "Author - Title"
 *
 * ## Why Different Strategies?
 * - Single files are often named after the book
 * - Multi-file audiobooks use folder names because individual files
 *   are usually named "Part 1", "Track 01", etc.
 *
 * @param audiobookPath - Path to the audiobook (file or folder)
 * @param type - Whether this is a single-file or multi-file audiobook
 * @returns Inferred title string
 */
export function inferTitleFromPath(
  audiobookPath: string,
  type: 'single-file' | 'multi-file',
): string {
  if (type === 'single-file') {
    return path.basename(audiobookPath, path.extname(audiobookPath));
  }
  return path.basename(audiobookPath);
}
