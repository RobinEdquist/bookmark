import type { MetadataSource } from '../app-settings/schema';
import {
  resolveFieldByPriority,
  resolveFieldSource,
  type MetadataSources,
} from '../common/utils/metadata-priority.utils';

/**
 * Where a shown value came from, in the words the agent is told to use.
 *
 * `manual` and `embedded` share one column: a hand-edit overwrites the file's
 * value and records the field in `manualFields`. So the column reads as
 * `hand-edit` when the field is locked and `file` otherwise, and a locked
 * field has no file value left to report.
 */
export type SourceLabel =
  'hand-edit' | 'file' | 'comicvine' | 'hardcover' | 'goodreads';

export interface FieldReport<T> {
  value: T | null;
  source: SourceLabel | null;
  /** Present and true when a hand-edit (or, later, the agent) pinned it. */
  locked?: true;
  /** What the other sources hold. Unlinked sources are left out. */
  other?: Partial<Record<SourceLabel, T | null>>;
}

/** Longest text kept for a source that is not the shown one. */
const OTHER_TEXT_LIMIT = 300;

function label(source: MetadataSource, locked: boolean): SourceLabel | null {
  switch (source) {
    case 'manual':
      return 'hand-edit';
    case 'embedded':
      return locked ? 'hand-edit' : 'file';
    case 'comicvine':
    case 'hardcover':
    case 'goodreads':
      return source;
    default:
      return null;
  }
}

function clip<T>(value: T | null): T | null {
  if (typeof value === 'string' && value.length > OTHER_TEXT_LIMIT) {
    return `${value.slice(0, OTHER_TEXT_LIMIT)}…` as T;
  }
  return value;
}

/**
 * One field as the agent sees it: the value the app shows, which source it
 * came from, and what the other sources have.
 *
 * External sources passed as `undefined` are treated as not linked and left
 * out; pass `null` for a linked source that has no value.
 */
export function reportField<T>(
  manualFieldName: string,
  sources: MetadataSources<T>,
  priority: MetadataSource[],
  manualFields: string[],
): FieldReport<T> {
  const locked = manualFields.includes(manualFieldName);
  const value = resolveFieldByPriority(
    manualFieldName,
    sources,
    priority,
    manualFields,
  );
  const winner = resolveFieldSource(
    manualFieldName,
    sources,
    priority,
    manualFields,
  );
  const shown = winner ? label(winner, locked) : null;

  const other: Partial<Record<SourceLabel, T | null>> = {};
  const columnLabel: SourceLabel = locked ? 'hand-edit' : 'file';
  if (shown !== columnLabel) {
    other[columnLabel] = clip(sources.embedded ?? null);
  }
  for (const source of ['comicvine', 'hardcover', 'goodreads'] as const) {
    if (sources[source] === undefined || shown === source) continue;
    other[source] = clip(sources[source] ?? null);
  }

  return {
    value: winner ? value : null,
    source: shown,
    ...(locked ? { locked: true as const } : {}),
    ...(Object.keys(other).length > 0 ? { other } : {}),
  };
}

/**
 * A list field (authors, series), mirroring `resolveRelationByPriority`: once
 * locked, the local rows are the value even when there are none, because an
 * empty list can be a deliberate edit ("no series").
 */
export function reportRelation<T>(
  manualFieldName: string,
  sources: MetadataSources<T[]>,
  priority: MetadataSource[],
  manualFields: string[],
): FieldReport<T[]> {
  if (!manualFields.includes(manualFieldName)) {
    return reportField(manualFieldName, sources, priority, manualFields);
  }

  const other: Partial<Record<SourceLabel, T[] | null>> = {};
  for (const source of ['comicvine', 'hardcover', 'goodreads'] as const) {
    if (sources[source] !== undefined) other[source] = sources[source] ?? null;
  }
  return {
    value: sources.manual ?? [],
    source: 'hand-edit',
    locked: true,
    ...(Object.keys(other).length > 0 ? { other } : {}),
  };
}

/** A plain local field: the column is the only source. */
export function reportLocal<T>(
  field: string,
  value: T | null | undefined,
  manualFields: string[],
): FieldReport<T> {
  return reportField(
    field,
    { manual: value, embedded: value },
    ['manual', 'embedded'],
    manualFields,
  );
}
