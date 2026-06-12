// apps/backend/src/library-watcher/utils/comicinfo.parser.ts
import { XMLParser } from 'fast-xml-parser';
import { ComicBookFormat } from './comic-filename.utils';

export type ComicCreatorRole =
  | 'writer'
  | 'penciller'
  | 'inker'
  | 'colorist'
  | 'letterer'
  | 'cover_artist'
  | 'editor'
  | 'other';

export interface ComicInfoCreator {
  name: string;
  role: ComicCreatorRole;
}

export interface ParsedComicInfo {
  title: string | null;
  series: string | null;
  number: string | null;
  count: number | null;
  volume: number | null;
  volumeIsYear: boolean;
  summary: string | null;
  coverDate: string | null; // ISO date string
  creators: ComicInfoCreator[];
  publisher: string | null;
  imprint: string | null;
  genres: string[];
  pageCount: number | null;
  languageIso: string | null;
  ageRating: string | null;
  format: ComicBookFormat;
  formatRaw: string | null;
  frontCoverPageIndex: number | null;
}

const CREATOR_FIELD_ROLES: Array<[string, ComicCreatorRole]> = [
  ['Writer', 'writer'],
  ['Penciller', 'penciller'],
  ['Inker', 'inker'],
  ['Colorist', 'colorist'],
  ['Letterer', 'letterer'],
  ['CoverArtist', 'cover_artist'],
  ['Editor', 'editor'],
];

export function mapComicInfoFormat(raw: string | null): ComicBookFormat {
  if (!raw || raw.trim() === '') return 'single_issue';
  const value = raw.trim().toLowerCase();
  if (/\btpb\b|trade/.test(value)) return 'tpb';
  if (/omnibus/.test(value)) return 'omnibus';
  if (/annual/.test(value)) return 'annual';
  if (/one[- ]?shot/.test(value)) return 'one_shot';
  if (/special/.test(value)) return 'special';
  if (/graphic novel|\bgn\b/.test(value)) return 'graphic_novel';
  // Unrecognized non-empty formats (e.g. Hardcover, Limited Series) deliberately fall through to 'other'
  return 'other';
}

function asString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str === '' ? null : str;
}

function asInt(value: unknown): number | null {
  const str = asString(value);
  if (str === null) return null;
  const num = parseInt(str, 10);
  return Number.isNaN(num) ? null : num;
}

function splitList(value: unknown): string[] {
  const str = asString(value);
  if (!str) return [];
  return str
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseComicInfoXml(xml: string): ParsedComicInfo | null {
  let root: Record<string, unknown>;
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      parseTagValue: false,
      parseAttributeValue: false,
    });
    const parsed = parser.parse(xml) as Record<string, unknown>;
    root = parsed?.ComicInfo as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!root || typeof root !== 'object') return null;

  const creators: ComicInfoCreator[] = [];
  for (const [field, role] of CREATOR_FIELD_ROLES) {
    for (const name of splitList(root[field])) {
      creators.push({ name, role });
    }
  }

  // Cover date from Year/Month/Day (Month/Day default to 1)
  const year = asInt(root.Year);
  const month = asInt(root.Month) ?? 1;
  const day = asInt(root.Day) ?? 1;
  const coverDate = year
    ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    : null;

  const volume = asInt(root.Volume);
  const volumeIsYear = volume !== null && volume >= 1900 && volume <= 2100;

  // Pages/Page can be a single object or an array
  let frontCoverPageIndex: number | null = null;
  const pages = root.Pages as Record<string, unknown> | undefined;
  if (pages && pages.Page) {
    const pageList = Array.isArray(pages.Page) ? pages.Page : [pages.Page];
    for (const page of pageList as Array<Record<string, unknown>>) {
      if (asString(page['@_Type']) === 'FrontCover') {
        frontCoverPageIndex = asInt(page['@_Image']);
        break;
      }
    }
  }

  const formatRaw = asString(root.Format);

  return {
    title: asString(root.Title),
    series: asString(root.Series),
    number: asString(root.Number),
    count: asInt(root.Count),
    volume,
    volumeIsYear,
    summary: asString(root.Summary),
    coverDate,
    creators,
    publisher: asString(root.Publisher),
    imprint: asString(root.Imprint),
    genres: splitList(root.Genre),
    pageCount: asInt(root.PageCount),
    languageIso: asString(root.LanguageISO),
    ageRating: asString(root.AgeRating),
    format: mapComicInfoFormat(formatRaw),
    formatRaw,
    frontCoverPageIndex,
  };
}
