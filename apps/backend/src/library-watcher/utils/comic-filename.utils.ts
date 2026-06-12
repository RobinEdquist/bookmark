// apps/backend/src/library-watcher/utils/comic-filename.utils.ts
import * as path from 'path';

export type ComicBookFormat =
  | 'single_issue'
  | 'annual'
  | 'tpb'
  | 'omnibus'
  | 'one_shot'
  | 'special'
  | 'graphic_novel'
  | 'other';

export interface ParsedComicFilename {
  title: string;
  number: string | null;
  sortNumber: number | null;
  format: ComicBookFormat;
  year: number | null;
  countInSeries: number | null;
}

export interface ParsedSeriesFolder {
  title: string;
  year: number | null;
}

/** Parse a leading numeric value out of a display number ("1.5" -> 1.5, "1AU" -> 1, "Annual 1" -> 1). */
export function computeSortNumber(number: string | null): number | null {
  if (!number) return null;
  const match = number.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  return parseFloat(match[1]);
}

/** Extract a trailing "(YYYY)" from a series folder name. */
export function parseSeriesFolderName(folderName: string): ParsedSeriesFolder {
  const yearMatch = folderName.match(/^(.*?)\s*\((\d{4})\)\s*$/);
  if (yearMatch) {
    return { title: yearMatch[1].trim(), year: parseInt(yearMatch[2], 10) };
  }
  return { title: folderName.trim(), year: null };
}

export function parseComicFilename(fileName: string): ParsedComicFilename {
  let base = path.basename(fileName, path.extname(fileName)).trim();

  // Year: last "(YYYY)" group
  let year: number | null = null;
  const yearMatch = base.match(/\((\d{4})\)/);
  if (yearMatch) {
    year = parseInt(yearMatch[1], 10);
    base = base.replace(yearMatch[0], '').trim();
  }

  // "(of N)" total count
  let countInSeries: number | null = null;
  const ofMatch = base.match(/\(of\s+(\d+)\)/i);
  if (ofMatch) {
    countInSeries = parseInt(ofMatch[1], 10);
    base = base.replace(ofMatch[0], '').trim();
  }

  // Remove any remaining empty parens and collapse whitespace
  base = base
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  let format: ComicBookFormat = 'single_issue';
  let number: string | null = null;
  let title = base;

  // Annual: "Title Annual #N" / "Title Annual N"
  const annualMatch = base.match(/^(.*?)\s+Annual\s*#?(\d+(?:\.\d+)?)$/i);
  // Omnibus: "Title Omnibus N" / "Title Omnibus"
  const omnibusMatch = base.match(/^(.*?)\s+Omnibus(?:\s*#?(\d+))?$/i);
  // Trade volume: "Title Vol. 04" / "Title Vol 4" / "Title v04"
  const volMatch = base.match(/^(.*?)\s+(?:Vol\.?\s*|v)(\d+(?:\.\d+)?)$/i);
  // Issue: "Title #043" / "Title 043" (number must be the last token)
  const issueMatch = base.match(/^(.*?)\s+#?(\d+(?:\.\d+)?[A-Za-z]*)$/);

  if (annualMatch) {
    title = annualMatch[1].trim();
    number = `Annual ${stripLeadingZeros(annualMatch[2])}`;
    format = 'annual';
  } else if (omnibusMatch) {
    title = omnibusMatch[1].trim();
    number = omnibusMatch[2] ? stripLeadingZeros(omnibusMatch[2]) : null;
    format = 'omnibus';
  } else if (volMatch) {
    title = volMatch[1].trim();
    number = stripLeadingZeros(volMatch[2]);
    format = 'tpb';
  } else if (issueMatch) {
    title = issueMatch[1].trim();
    number = stripLeadingZeros(issueMatch[2]);
    format = 'single_issue';
  }

  return {
    title,
    number,
    sortNumber: computeSortNumber(number),
    format,
    year,
    countInSeries,
  };
}

function stripLeadingZeros(value: string): string {
  const match = value.match(/^0*(\d+(?:\.\d+)?)([A-Za-z]*)$/);
  if (!match) return value;
  return `${match[1]}${match[2]}`;
}
