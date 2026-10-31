export const READING_LIST_MEDIA_TYPES = [
  'audiobook',
  'ebook',
  'comic',
] as const;
export type ReadingListMediaType = (typeof READING_LIST_MEDIA_TYPES)[number];

/** How many items one call may add or order. */
export const MAX_READING_LIST_ITEMS = 1000;

/** An issue or book the library does not have yet. */
export interface MissingItem {
  title: string;
  /** Comics: the issue on ComicVine. */
  comicvineIssueId?: number | null;
  /** Comics: the volume on ComicVine, with `number`. */
  comicvineVolumeId?: number | null;
  number?: string | null;
}

/** What to add to a list: an item in the library, or a missing one. */
export type ReadingListEntryInput =
  { itemId: string } | { missing: MissingItem };

/** One entry as undo and the change log store it. */
export interface ReadingListEntryState {
  /** Null while the item is missing from the library. */
  itemId: string | null;
  note: string | null;
  /** Set while missing: the entry's own id and what it names. */
  missing?: {
    entryId: string;
    title: string;
    comicvineIssueId: number | null;
    comicvineVolumeId: number | null;
    number: string | null;
  };
}

/**
 * How an entry is named in moves, removals and notes: its item id, or for a
 * missing item the entry's own id.
 */
export function entryKey(state: ReadingListEntryState): string {
  return state.itemId ?? state.missing!.entryId;
}

/** "007" and "7" are the same issue; case and spaces do not count. */
export function normalizeIssueNumber(number: string): string {
  return number
    .trim()
    .toLowerCase()
    .replace(/^0+(?=\d)/, '');
}

/**
 * The list's item order after inserting `adding` before `position` (0-based;
 * past the end or omitted means at the end). Items already in the list stay
 * where they are, and repeats in `adding` count once.
 */
export function placeItems(
  current: string[],
  adding: string[],
  position?: number,
): string[] {
  const present = new Set(current);
  const fresh = [...new Set(adding)].filter((id) => !present.has(id));
  const at = Math.min(position ?? current.length, current.length);
  return [...current.slice(0, at), ...fresh, ...current.slice(at)];
}

/**
 * Checks that `order` holds every item in `current` exactly once and nothing
 * else. Returns a message naming what is wrong, or null.
 */
export function orderProblem(
  current: string[],
  order: string[],
): string | null {
  const given = new Set(order);
  const repeated = order.length !== given.size;
  const missing = current.filter((id) => !given.has(id));
  const extra = order.filter((id) => !current.includes(id));
  if (!repeated && missing.length === 0 && extra.length === 0) return null;
  return (
    'Give every item in the reading list, once, in the new order.' +
    (repeated ? ' Some items are given twice.' : '') +
    (missing.length > 0 ? ` Missing: ${missing.join(', ')}.` : '') +
    (extra.length > 0 ? ` Not in it: ${extra.join(', ')}.` : '')
  );
}
