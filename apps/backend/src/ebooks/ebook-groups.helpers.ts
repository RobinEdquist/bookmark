export const EBOOK_GROUP_NAME_MAX_LENGTH = 300;
export const EBOOK_GROUP_DESCRIPTION_MAX_LENGTH = 10_000;
export const EBOOK_GROUP_ROLE_MAX_LENGTH = 120;

/** Collapse whitespace and trim. Empty input becomes an empty string. */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/** Trim optional text. Blank input is stored as null. */
export function normalizeOptionalText(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Free-text membership label. Blank input is stored as null so the UI can
 * tell "no role" from a role that is only whitespace.
 */
export function normalizeRole(role: string | null | undefined): string | null {
  if (role == null) return null;
  const trimmed = role.trim().replace(/\s+/g, ' ');
  return trimmed.length === 0 ? null : trimmed;
}

/** LIKE/ILIKE contains-pattern with `\`, `%`, and `_` treated as literals. */
export function containsPattern(search: string): string {
  const escaped = search.replace(/[\\%_]/g, (char) => `\\${char}`);
  return `%${escaped}%`;
}

/** A group's own cover when one is set, otherwise the first member cover. */
export function resolveGroupCover(
  ownCoverUrl: string | null,
  firstMemberCoverUrl: string | null,
): string | null {
  return ownCoverUrl ?? firstMemberCoverUrl ?? null;
}

export class MemberOrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MemberOrderError';
  }
}

/**
 * Applies the order a client asked for without dropping members that client
 * could not see (a hidden ebook, or one blocked by that user's tag blacklist).
 * Unlisted members stay where they were relative to the listed block: anything
 * that originally sat before the first listed member stays in front, and
 * anything that sat after it stays behind.
 */
export function mergeMemberOrder(
  storedIds: string[],
  requestedIds: string[],
): string[] {
  if (new Set(requestedIds).size !== requestedIds.length) {
    throw new MemberOrderError('Reorder list contains a duplicate ebook');
  }

  const stored = new Set(storedIds);
  for (const id of requestedIds) {
    if (!stored.has(id)) {
      throw new MemberOrderError(
        'Reorder list includes an ebook that is not in the group',
      );
    }
  }

  const requested = new Set(requestedIds);
  const result: string[] = [];
  let inserted = false;
  for (const id of storedIds) {
    if (!requested.has(id)) {
      result.push(id);
      continue;
    }
    if (!inserted) {
      result.push(...requestedIds);
      inserted = true;
    }
  }
  if (!inserted) {
    result.push(...requestedIds);
  }
  return result;
}
