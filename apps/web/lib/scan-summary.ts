/** What `POST /admin/library-watcher/scan*` reports back. */
export interface LibraryScanResult {
  added: number;
  missing: number;
  restored: number;
  deleted: number;
  repaired: number;
  errors: Array<{ path: string; error: string }>;
}

export type ScanSummaryKey =
  "added" | "repaired" | "restored" | "missing" | "deleted" | "errors";

const ORDER: ScanSummaryKey[] = [
  "added",
  "repaired",
  "restored",
  "missing",
  "deleted",
  "errors",
];

/**
 * The non-zero counts of a scan in reading order, so a summary can say what
 * actually changed (a scan that only marked folders missing is not a no-op).
 * An empty array means nothing changed.
 */
export function scanSummaryParts(
  result: LibraryScanResult,
): Array<{ key: ScanSummaryKey; count: number }> {
  const counts: Record<ScanSummaryKey, number> = {
    added: result.added,
    repaired: result.repaired,
    restored: result.restored,
    missing: result.missing,
    deleted: result.deleted,
    errors: result.errors.length,
  };
  return ORDER.filter((key) => counts[key] > 0).map((key) => ({
    key,
    count: counts[key],
  }));
}
