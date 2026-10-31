export const READING_LIST_MEDIA_TYPES = [
  'audiobook',
  'ebook',
  'comic',
] as const;
export type ReadingListMediaType = (typeof READING_LIST_MEDIA_TYPES)[number];

/** How many items one call may add or order. */
export const MAX_READING_LIST_ITEMS = 1000;

/** One entry as undo and the change log store it. */
export interface ReadingListEntryState {
  itemId: string;
  note: string | null;
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
