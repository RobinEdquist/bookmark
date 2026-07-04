import type { AudibleSearchResult, AudnexusBookDetail } from "../../lib/use-audnexus";
import type { ItunesSearchResult } from "../../lib/use-itunes";
import type { SeriesEntry } from "../shared/series-entry-editor";

/**
 * Metadata extracted from an external provider, shaped to match the edit
 * dialog form state. Every field is optional — only fields the provider
 * actually returned are present.
 */
export interface MatchedMetadata {
  title?: string;
  subtitle?: string;
  description?: string;
  authors?: string[];
  narrators?: string[];
  publisher?: string;
  language?: string; // ISO 639-1 code
  publishedYear?: string; // 4-digit string
  isbn?: string;
  asin?: string;
  genres?: string[];
  tags?: string[];
  series?: SeriesEntry[];
  coverUrl?: string;
}

// Audible/Audnexus return full language names; the edit forms use ISO 639-1
// codes from their LANGUAGE_OPTIONS list. Unknown names map to undefined so
// the field is simply omitted rather than corrupting the language select.
const LANGUAGE_NAME_TO_CODE: Record<string, string> = {
  english: "en",
  spanish: "es",
  french: "fr",
  german: "de",
  italian: "it",
  portuguese: "pt",
  dutch: "nl",
  swedish: "sv",
  norwegian: "no",
  danish: "da",
  finnish: "fi",
  polish: "pl",
  russian: "ru",
  japanese: "ja",
  chinese: "zh",
  mandarin: "zh",
  korean: "ko",
};

export function languageNameToCode(name?: string): string | undefined {
  if (!name) return undefined;
  return LANGUAGE_NAME_TO_CODE[name.trim().toLowerCase()];
}

function releaseDateToYear(releaseDate?: string): string | undefined {
  const year = releaseDate?.slice(0, 4);
  return year && /^\d{4}$/.test(year) ? year : undefined;
}

/**
 * Map a full Audnexus book detail response to form metadata.
 */
export function mapAudnexusBook(detail: AudnexusBookDetail): MatchedMetadata {
  return {
    title: detail.title || undefined,
    subtitle: detail.subtitle || undefined,
    description: detail.description || undefined,
    authors: detail.authors.length ? detail.authors : undefined,
    narrators: detail.narrators.length ? detail.narrators : undefined,
    publisher: detail.publisher || undefined,
    language: languageNameToCode(detail.language),
    publishedYear: releaseDateToYear(detail.releaseDate),
    isbn: detail.isbn || undefined,
    asin: detail.asin || undefined,
    genres: detail.genres.length ? detail.genres : undefined,
    tags: detail.tags.length ? detail.tags : undefined,
    // Entries without a position are dropped — the edit form discards
    // order-less series entries on save anyway
    series: (() => {
      const entries = detail.series
        .filter((s) => s.position && !isNaN(parseFloat(s.position)))
        .map((s) => ({
          seriesName: s.name,
          order: String(parseFloat(s.position as string)),
        }));
      return entries.length ? entries : undefined;
    })(),
    coverUrl: detail.coverUrl || undefined,
  };
}

/**
 * Map an Audible catalog search result to form metadata. Used as a fallback
 * when the Audnexus book detail endpoint has no data for the ASIN (it does
 * not index every regional ASIN).
 */
export function mapAudibleSearchResult(
  result: AudibleSearchResult
): MatchedMetadata {
  return {
    title: result.title || undefined,
    subtitle: result.subtitle || undefined,
    authors: result.authors.length ? result.authors : undefined,
    narrators: result.narrators.length ? result.narrators : undefined,
    publisher: result.publisher || undefined,
    language: languageNameToCode(result.language),
    publishedYear: releaseDateToYear(result.releaseDate),
    asin: result.asin || undefined,
    coverUrl: result.coverUrl || undefined,
  };
}

/**
 * Map an iTunes search result to form metadata.
 */
export function mapItunesResult(result: ItunesSearchResult): MatchedMetadata {
  return {
    title: result.title || undefined,
    authors: result.author ? [result.author] : undefined,
    description: result.description || undefined,
    genres: result.genres.length ? result.genres : undefined,
    publishedYear: releaseDateToYear(result.releaseDate),
    coverUrl: result.coverUrl || undefined,
  };
}
