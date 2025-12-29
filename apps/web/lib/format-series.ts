/**
 * Format a series order, removing unnecessary decimals.
 *
 * Examples:
 * - "1.0" -> "1"
 * - "1.5" -> "1.5"
 * - "10.0" -> "10"
 * - "2.25" -> "2.25"
 */
export function formatSeriesOrder(order: string): string {
  const num = parseFloat(order);
  if (isNaN(num)) return order;
  return Number.isInteger(num) ? num.toString() : num.toString();
}
