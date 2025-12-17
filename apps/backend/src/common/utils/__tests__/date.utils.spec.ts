import { getLastMondayUTC } from '../date.utils';

describe('getLastMondayUTC', () => {
  it('should return previous Monday 00:00 UTC when called on a Wednesday', () => {
    // Wednesday, Dec 18, 2025 at 14:30:00 UTC
    const wednesday = new Date('2025-12-18T14:30:00.000Z');
    const result = getLastMondayUTC(wednesday);

    // Should be Monday, Dec 15, 2025 at 00:00:00 UTC
    expect(result.toISOString()).toBe('2025-12-15T00:00:00.000Z');
  });

  it('should return same day when called on Monday at noon', () => {
    // Monday, Dec 15, 2025 at 12:00:00 UTC
    const monday = new Date('2025-12-15T12:00:00.000Z');
    const result = getLastMondayUTC(monday);

    // Should be Monday, Dec 15, 2025 at 00:00:00 UTC
    expect(result.toISOString()).toBe('2025-12-15T00:00:00.000Z');
  });

  it('should return same day when called on Monday at midnight', () => {
    // Monday, Dec 15, 2025 at 00:00:00 UTC
    const mondayMidnight = new Date('2025-12-15T00:00:00.000Z');
    const result = getLastMondayUTC(mondayMidnight);

    expect(result.toISOString()).toBe('2025-12-15T00:00:00.000Z');
  });

  it('should return previous Monday when called on Sunday', () => {
    // Sunday, Dec 21, 2025 at 23:59:59 UTC
    const sunday = new Date('2025-12-21T23:59:59.000Z');
    const result = getLastMondayUTC(sunday);

    // Should be Monday, Dec 15, 2025 at 00:00:00 UTC
    expect(result.toISOString()).toBe('2025-12-15T00:00:00.000Z');
  });

  it('should use current date when no argument provided', () => {
    const result = getLastMondayUTC();

    // Result should be a Monday
    expect(result.getUTCDay()).toBe(1);
    // Result should be at 00:00:00.000 UTC
    expect(result.getUTCHours()).toBe(0);
    expect(result.getUTCMinutes()).toBe(0);
    expect(result.getUTCSeconds()).toBe(0);
    expect(result.getUTCMilliseconds()).toBe(0);
  });
});
