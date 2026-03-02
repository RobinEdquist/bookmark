/**
 * Split one or more person name strings into normalized, deduplicated names.
 *
 * Supports comma-separated values (e.g. "Author A, Author B") and arrays of
 * values. Deduplication is case-insensitive and preserves first-seen order.
 */
export function splitPersonNames(
  names: string | string[] | null | undefined,
): string[] {
  if (!names) return [];

  const values = Array.isArray(names) ? names : [names];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (!value) continue;

    for (const part of value.split(',')) {
      const normalized = part.trim();
      if (!normalized) continue;

      const dedupeKey = normalized.toLowerCase();
      if (seen.has(dedupeKey)) continue;

      seen.add(dedupeKey);
      result.push(normalized);
    }
  }

  return result;
}
