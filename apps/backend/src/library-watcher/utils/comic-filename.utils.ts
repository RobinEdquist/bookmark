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

  // 1. Strip bracketed scene/format groups: [group], {tag}
  base = base.replace(/\[[^\]]*\]/g, ' ').replace(/\{[^}]*\}/g, ' ');

  // 2. Year: a 4-digit year in parens, optionally preceded by a month name
  //    Handles "(2012)", "(April 2018)", "(Apr 2018)".
  let year: number | null = null;
  const dateMatch = base.match(/\((?:[A-Za-z]{3,9}\.?\s+)?((?:19|20)\d{2})\)/);
  if (dateMatch) {
    year = parseInt(dateMatch[1], 10);
    base = base.replace(dateMatch[0], ' ');
  }

  // 3. "(of N)" total count
  let countInSeries: number | null = null;
  const ofMatch = base.match(/\(of\s+(\d+)\)/i);
  if (ofMatch) {
    countInSeries = parseInt(ofMatch[1], 10);
    base = base.replace(ofMatch[0], ' ');
  }

  // 4. Remove any remaining parenthetical scene tags, e.g. "(Digital)", "(Empire)"
  base = base
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  let format: ComicBookFormat = 'single_issue';
  let number: string | null = null;
  let title = base;

  const annualMatch = base.match(/^(.*?)\s+Annual\s*#?(\d+(?:\.\d+)?)\b/i);
  const omnibusMatch = base.match(/^(.*?)\s+Omnibus(?:\s*#?(\d+))?\b/i);
  const hashMatch = base.match(/#\s*(\d+(?:\.\d+)?[A-Za-z]*)/);
  const volMatch = base.match(/^(.*?)\s+(?:Vol\.?\s*|v)(\d+(?:\.\d+)?)\s*$/i);
  const trailingMatch = base.match(/^(.*?)\s+(\d+(?:\.\d+)?[A-Za-z]*)\s*$/);

  if (annualMatch) {
    title = cleanTitle(annualMatch[1]);
    number = `Annual ${stripLeadingZeros(annualMatch[2])}`;
    format = 'annual';
  } else if (omnibusMatch) {
    title = cleanTitle(omnibusMatch[1]);
    number = omnibusMatch[2] ? stripLeadingZeros(omnibusMatch[2]) : null;
    format = 'omnibus';
  } else if (hashMatch) {
    number = stripLeadingZeros(hashMatch[1]);
    title = cleanTitle(base.slice(0, base.indexOf('#')));
    format = 'single_issue';
  } else if (volMatch) {
    title = cleanTitle(volMatch[1]);
    number = stripLeadingZeros(volMatch[2]);
    format = 'tpb';
  } else if (trailingMatch) {
    title = cleanTitle(trailingMatch[1]);
    number = stripLeadingZeros(trailingMatch[2]);
    format = 'single_issue';
  }

  return {
    title: title || base,
    number,
    sortNumber: computeSortNumber(number),
    format,
    year,
    countInSeries,
  };
}

/** Trim a parsed title and drop a trailing "Vol.<digits>" qualifier (e.g. "Saga Vol.2012" -> "Saga"). */
function cleanTitle(raw: string): string {
  return raw
    .replace(/\s+Vol\.?\s*\d+\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function stripLeadingZeros(value: string): string {
  const match = value.match(/^0*(\d+(?:\.\d+)?)([A-Za-z]*)$/);
  if (!match) return value;
  return `${match[1]}${match[2]}`;
}
