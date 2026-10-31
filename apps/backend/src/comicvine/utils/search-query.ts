// ---------------------------------------------------------------------------
// ComicVine volume search queries
// ---------------------------------------------------------------------------
// Pure functions — no DB, no HTTP, no NestJS dependencies.
//
// ComicVine's volume search is a name filter: it returns volumes whose name
// contains the text. "Wolverine" finds hundreds of volumes, but
// "Wolverine 1982" and "02 Wolverine v2 01-189+Extras (1988-2003)" find none.
// Series titles often come from folder names, so they are cleaned before
// searching, and a start year in them is kept for ranking.
// ---------------------------------------------------------------------------

import { isLikelyCollectedEdition, type LocalSeries } from './match-confidence';

export interface VolumeSearchPlan {
  /** Texts for ComicVine's name filter, best first. Try the next only when one finds nothing. */
  queries: string[];
  /** Cleaned title to score candidates against. Keeps edition words from brackets ("Deluxe Edition"). */
  matchTitle: string;
  /** Start year read from the title. Null when the issues in the title do not start at #1. */
  startYear: number | null;
  /** The title names a collected edition (TPB, deluxe, omnibus…). */
  isCollected: boolean;
}

const MAX_QUERIES = 3;
const EARLIEST_YEAR = 1890;

const YEAR_RE = /\b(1[89]\d{2}|20\d{2})\b/;
const BRACKETS_RE = /[([{]([^)\]}]*)[)\]}]/g;
const BRACKETED_RANGE_RE = /^\s*#?(\d{1,4})\s*-\s*#?(\d{1,4})\s*$/;
// "02 Wolverine", "3 - Wolverine", "07. Wolverine": a pack's reading order.
// Unpadded numbers without a dash stay, so "100 Bullets" and "52" survive.
const PACK_NUMBER_RE = /^\s*(?:0\d|\d{1,2}\s*[-.])\s+/;
const VOLUME_MARKER_RE = /\b(?:v|vol\.?|volume)\s*\d+\b/gi;
const EXTRAS_RE = /\+\s*[^\s+]+/g;
const ISSUE_RANGE_RE = /#?\b(\d{1,4})\s*-\s*#?(\d{1,4})\b/g;
const ISSUE_NUMBER_RE = /(?:#\d+|\b0\d{1,3})\b/g;
const FORMAT_WORD_RE = /\b(?:tpbs?|hcs?|gns?)\b\.?/gi;
const TRAILING_YEAR_RE = /^(.*\S)\s+(\d{4})$/;
const SEPARATOR_RE = /\s+[-–—]\s+/g;
const EDGE_PUNCTUATION_RE = /^[\s:,&+-]+|[\s:,&+-]+$/g;

function toYear(text: string, now: Date): number | null {
  const n = Number(text);
  return Number.isInteger(n) && n >= EARLIEST_YEAR && n <= now.getFullYear() + 1
    ? n
    : null;
}

export function planVolumeSearch(
  title: string,
  now: Date = new Date(),
): VolumeSearchPlan {
  const original = title.trim();
  const seen: { year: number | null; firstIssue: number | null } = {
    year: null,
    firstIssue: null,
  };
  const editionWords: string[] = [];

  const noteIssue = (n: number) => {
    seen.firstIssue =
      seen.firstIssue === null ? n : Math.min(seen.firstIssue, n);
  };
  // Two years make a span ("1988-2003"); anything else is issue numbers.
  const readRange = (a: string, b: string) => {
    const from = toYear(a, now);
    const to = toYear(b, now);
    if (a.length === 4 && b.length === 4 && from !== null && to !== null) {
      seen.year ??= from;
    } else {
      noteIssue(Number(a));
    }
  };

  let s = original
    .replace(/_/g, ' ')
    .replace(BRACKETS_RE, (_match, inner: string) => {
      const range = BRACKETED_RANGE_RE.exec(inner);
      if (range) {
        readRange(range[1], range[2]);
      } else if (isLikelyCollectedEdition(inner)) {
        editionWords.push(inner.trim());
      } else {
        const found = YEAR_RE.exec(inner);
        if (found) seen.year ??= toYear(found[1], now);
      }
      return ' ';
    })
    .replace(PACK_NUMBER_RE, ' ')
    .replace(VOLUME_MARKER_RE, ' ')
    .replace(EXTRAS_RE, ' ')
    .replace(ISSUE_RANGE_RE, (_match, a: string, b: string) => {
      readRange(a, b);
      return ' ';
    })
    .replace(ISSUE_NUMBER_RE, (match) => {
      noteIssue(Number(match.replace('#', '')));
      return ' ';
    })
    .replace(FORMAT_WORD_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Free text often ends in the start year: "Wolverine 1982".
  const trailing = TRAILING_YEAR_RE.exec(s);
  const trailingYear = trailing ? toYear(trailing[2], now) : null;
  if (trailing && trailingYear !== null) {
    seen.year ??= trailingYear;
    s = trailing[1];
  }

  s = s.replace(SEPARATOR_RE, ': ').replace(EDGE_PUNCTUATION_RE, '').trim();
  if (!s) s = original;

  const candidates = [s];
  if (s.includes('&')) candidates.push(s.replace(/\s*&\s*/g, '/'));
  // Either side of a separator, but never a single word: "Batman" or
  // "Wolverine" alone matches hundreds of volumes and costs an API call.
  const separator = s.indexOf(': ');
  if (separator > 0) {
    for (const part of [s.slice(separator + 2), s.slice(0, separator)]) {
      if (part.trim().split(' ').length >= 2) candidates.push(part.trim());
    }
  }

  return {
    queries: [...new Set(candidates.filter(Boolean))].slice(0, MAX_QUERIES),
    matchTitle: [s, ...editionWords].join(' '),
    // A year next to issues that start later is when those issues came out,
    // not when the volume started.
    startYear:
      seen.firstIssue !== null && seen.firstIssue > 1 ? null : seen.year,
    isCollected: isLikelyCollectedEdition(original),
  };
}

/** The local side of a match: cleaned title, stored start year first. */
export function localSeriesFor(
  title: string,
  startYear: number | null,
  bookCount?: number | null,
  now: Date = new Date(),
): LocalSeries {
  const plan = planVolumeSearch(title, now);
  return {
    title: plan.matchTitle,
    startYear: startYear ?? plan.startYear,
    bookCount: bookCount ?? null,
    isCollected: plan.isCollected,
  };
}
