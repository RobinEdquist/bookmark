import type { MetadataSource } from '../../app-settings/schema';

/**
 * Candidate values for one field, keyed by the source they came from.
 *
 * `manual` and `embedded` are required: `manual` is what the user typed and
 * `embedded` is the stored column that acts as the final fallback. The rest
 * (`hardcover`, `goodreads`, `comicvine`, …) are optional — a caller only
 * supplies the sources that apply to its media type.
 */
export type MetadataSources<T> = Partial<
  Record<MetadataSource, T | null | undefined>
> & {
  manual: T | null | undefined;
  embedded: T | null | undefined;
};

/**
 * Check if a value is non-empty (not null, undefined, empty string, or empty array)
 */
export function hasValue<T>(value: T | null | undefined): value is T {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

/**
 * Resolve a field value based on metadata priority settings.
 * Manual edits always take priority, then follows the configured order.
 * Returns the first non-empty value according to priority order.
 *
 * This is the single source of truth for "what value does the user actually
 * see for this field". Any endpoint that returns a title/author/description
 * must run its DB columns through here — a raw column rendered anywhere leaks
 * values the detail views have already overridden (e.g. an embedded
 * `"Title (Unabridged)"` where an external source supplies the clean title).
 *
 * `manualFieldName` is the key looked up in `manualFields[]`, which is the
 * stored *column* name. It usually matches the priority key, but not always
 * (comics check `'number'` while reading `priority.bookNumber`), so it is
 * passed separately rather than derived.
 *
 * Sources with no entry in `sources` are skipped, so `'filename'` and
 * `'folder_image'` — which only apply at import time — fall through here.
 */
export function resolveFieldByPriority<T>(
  manualFieldName: string,
  sources: MetadataSources<T>,
  priority: MetadataSource[],
  manualFields: string[],
): T | null {
  // Manual edits always take priority
  if (manualFields.includes(manualFieldName) && hasValue(sources.manual)) {
    return sources.manual;
  }

  // Then follow the configured priority order ('manual' already handled above)
  for (const source of priority) {
    if (source === 'manual') continue;
    const value = sources[source];
    if (hasValue(value)) return value;
  }

  // Fallback: return embedded (which is the original DB value)
  return sources.embedded ?? null;
}
