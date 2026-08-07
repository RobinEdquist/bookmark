/**
 * Clock-style timestamp helpers for positions inside an audiobook.
 *
 * `formatTimestamp` matches the player's display convention:
 * - 45 -> "0:45"
 * - 754 -> "12:34"
 * - 4523 -> "1:15:23"
 */
export function formatTimestamp(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";

  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Parse user input into seconds. Accepts "H:MM:SS", "M:SS" and plain seconds
 * ("90"). Returns null for anything unparseable or out of range (minutes and
 * seconds segments must be < 60 when a higher unit is present).
 */
export function parseTimestamp(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+(:\d{1,2}){0,2}$/.test(trimmed)) return null;

  const parts = trimmed.split(":").map((part) => parseInt(part, 10));

  if (parts.some((part) => Number.isNaN(part))) return null;

  if (parts.length === 1) {
    return parts[0]!;
  }

  // All segments after the first must be valid sexagesimal values
  if (parts.slice(1).some((part) => part >= 60)) return null;

  if (parts.length === 2) {
    const [minutes, secs] = parts as [number, number];
    return minutes * 60 + secs;
  }

  const [hours, minutes, secs] = parts as [number, number, number];
  return hours * 3600 + minutes * 60 + secs;
}
