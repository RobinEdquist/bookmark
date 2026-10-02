import type { TrackerSearchResult } from '../tracker/types';
import type { ContentType } from './schema';

export function normalizeBookText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Same representation as PostgreSQL json_build_array in the migration. */
export function bookKey(title: string, author: string | null): string {
  return `[${[normalizeBookText(title), normalizeBookText(author ?? '')].map((value) => JSON.stringify(value)).join(', ')}]`;
}

export function languageKey(names: string[]): string {
  return names.length
    ? JSON.stringify([...new Set(names.map(normalizeBookText))].sort())
    : 'any';
}

export function nextSearchDate(
  now: Date,
  failures: number,
  releaseDate: Date | null,
): Date {
  // Daily availability checks, exponential infrastructure backoff capped at
  // seven days. Revalidate future publication metadata weekly, so a changed
  // date cannot indefinitely prevent discovery.
  const delay = Math.min(7, 2 ** Math.min(failures, 3)) * 86_400_000;
  const regular = now.getTime() + delay;
  if (
    releaseDate &&
    Number.isFinite(releaseDate.getTime()) &&
    releaseDate > now
  ) {
    return new Date(
      Math.min(releaseDate.getTime(), now.getTime() + 7 * 86_400_000),
    );
  }
  return new Date(regular);
}

export function selectCandidate(
  request: {
    title: string;
    author: string | null;
    contentType: ContentType;
    languageNames: string[];
  },
  candidates: TrackerSearchResult[],
): TrackerSearchResult | null {
  const matches = candidates.filter(
    (candidate) =>
      Number.isSafeInteger(candidate.id) &&
      candidate.id > 0 &&
      Number.isInteger(candidate.categoryId) &&
      candidate.contentType === request.contentType &&
      normalizeBookText(candidate.title) === normalizeBookText(request.title) &&
      (!request.author ||
        normalizeBookText(candidate.author ?? '') ===
          normalizeBookText(request.author)) &&
      (!request.languageNames.length ||
        request.languageNames.some(
          (name) =>
            normalizeBookText(name) ===
            normalizeBookText(candidate.language ?? ''),
        )),
  );
  if (
    !request.author &&
    new Set(
      matches.map((candidate) => normalizeBookText(candidate.author ?? '')),
    ).size > 1
  )
    return null;
  // No release ranking or file-format preferences. A stable choice avoids
  // depending on upstream result ordering when equivalent releases exist.
  return matches.sort((a, b) => a.id - b.id)[0] ?? null;
}

export function parseReleaseDate(
  value: string | null | undefined,
): Date | null {
  if (
    !value ||
    !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(
      value,
    )
  )
    return null;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day
  )
    return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}
