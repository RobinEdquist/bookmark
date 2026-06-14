// Pure helpers for DB-owned comic series membership. Kept side-effect free so
// the core move/merge/import decisions are unit-testable in isolation.

/** Distinct series ids the given books currently belong to, minus the target. */
export function distinctSourceSeriesIds(
  books: { seriesId: string }[],
  targetSeriesId: string,
): string[] {
  return [...new Set(books.map((b) => b.seriesId))].filter(
    (id) => id !== targetSeriesId,
  );
}

/** Mark a book's series placement as manual so re-scan/sync never overrides it. */
export function withSeriesIdManual(existing: string[] | null): string[] {
  return [...new Set([...(existing ?? []), 'seriesId'])];
}

/**
 * Given a detected unit's book file paths and the set already present in the DB,
 * return the paths that still need importing. Empty result => caller must NOT
 * create a series (prevents resurrecting an emptied, manually-moved one-shot).
 */
export function selectBooksToImport(
  unitFilePaths: string[],
  existsByPath: Set<string>,
): string[] {
  return unitFilePaths.filter((p) => !existsByPath.has(p));
}
