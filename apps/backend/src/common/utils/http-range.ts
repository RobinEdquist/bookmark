export interface ByteRange {
  start: number;
  end: number;
}

/**
 * Parse an HTTP Range header ("bytes=start-end", "bytes=start-" or
 * "bytes=-suffix") against a file size. The returned end is clamped to the
 * last byte. Returns null when the header is malformed or unsatisfiable
 * (caller should respond with 416).
 */
export function parseRangeHeader(
  range: string,
  fileSize: number,
): ByteRange | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) return null;

  let start: number;
  let end: number;

  if (match[1]) {
    start = parseInt(match[1], 10);
    end = match[2] ? parseInt(match[2], 10) : fileSize - 1;
  } else if (match[2]) {
    // Suffix range: last N bytes
    const suffixLength = parseInt(match[2], 10);
    if (suffixLength === 0) return null;
    start = Math.max(fileSize - suffixLength, 0);
    end = fileSize - 1;
  } else {
    return null;
  }

  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  if (start > end || start >= fileSize) return null;

  return { start, end: Math.min(end, fileSize - 1) };
}
