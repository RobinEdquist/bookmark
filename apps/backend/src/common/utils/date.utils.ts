/**
 * Get the most recent Monday at 00:00:00 UTC.
 * If today is Monday, returns today at 00:00:00 UTC.
 *
 * @param now - The reference date (defaults to current time)
 * @returns Date object representing last Monday 00:00:00 UTC
 */
export function getLastMondayUTC(now: Date = new Date()): Date {
  const date = new Date(now);

  // Get current day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  const dayOfWeek = date.getUTCDay();

  // Calculate days since last Monday
  // Monday = 1, so: (dayOfWeek - 1 + 7) % 7 gives days since Monday
  // But we want Sunday (0) to go back to previous Monday (6 days)
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  // Subtract days to get to Monday
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);

  // Set to 00:00:00.000 UTC
  date.setUTCHours(0, 0, 0, 0);

  return date;
}
