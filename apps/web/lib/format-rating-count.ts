/**
 * Format a ratings count (Goodreads / Hardcover) for display.
 *
 * The locale is pinned to "en-US" instead of relying on the ambient
 * `Intl` default: ratings badges render on the server during SSR and are
 * re-rendered by the browser during hydration — an ambient locale would
 * produce "1,500" on one side and "1 500" on the other (hydration
 * mismatch), and made component tests fail on any machine whose default
 * locale does not group with commas. English grouping also matches the
 * `4.18`-style decimal ratings shown next to it.
 *
 * Examples:
 * - 900 -> "900"
 * - 1500 -> "1,500"
 * - 900000 -> "900,000"
 */
export function formatRatingCount(count: number): string {
  return count.toLocaleString("en-US");
}
