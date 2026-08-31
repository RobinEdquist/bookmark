import { parseRangeHeader } from '../http-range';

describe('parseRangeHeader', () => {
  const FILE_SIZE = 1000;

  it('parses a start-end range', () => {
    expect(parseRangeHeader('bytes=0-99', FILE_SIZE)).toEqual({
      start: 0,
      end: 99,
    });
  });

  it('parses an open-ended range to the last byte', () => {
    expect(parseRangeHeader('bytes=500-', FILE_SIZE)).toEqual({
      start: 500,
      end: 999,
    });
  });

  it('parses a suffix range as the last N bytes', () => {
    expect(parseRangeHeader('bytes=-100', FILE_SIZE)).toEqual({
      start: 900,
      end: 999,
    });
  });

  it('clamps a suffix range larger than the file to the whole file', () => {
    expect(parseRangeHeader('bytes=-5000', FILE_SIZE)).toEqual({
      start: 0,
      end: 999,
    });
  });

  it('clamps end past the file size to the last byte', () => {
    expect(parseRangeHeader('bytes=900-5000', FILE_SIZE)).toEqual({
      start: 900,
      end: 999,
    });
  });

  it('returns null when start is at or past the file size', () => {
    expect(parseRangeHeader('bytes=1000-', FILE_SIZE)).toBeNull();
    expect(parseRangeHeader('bytes=1500-1600', FILE_SIZE)).toBeNull();
  });

  it('returns null when start is greater than end', () => {
    expect(parseRangeHeader('bytes=200-100', FILE_SIZE)).toBeNull();
  });

  it('returns null for a zero-length suffix', () => {
    expect(parseRangeHeader('bytes=-0', FILE_SIZE)).toBeNull();
  });

  it('returns null for malformed headers', () => {
    expect(parseRangeHeader('bytes=', FILE_SIZE)).toBeNull();
    expect(parseRangeHeader('bytes=-', FILE_SIZE)).toBeNull();
    expect(parseRangeHeader('bytes=abc-def', FILE_SIZE)).toBeNull();
    expect(parseRangeHeader('items=0-99', FILE_SIZE)).toBeNull();
    expect(parseRangeHeader('bytes=0-99,200-299', FILE_SIZE)).toBeNull();
  });

  it('handles a single-byte file', () => {
    expect(parseRangeHeader('bytes=0-', 1)).toEqual({ start: 0, end: 0 });
    expect(parseRangeHeader('bytes=1-', 1)).toBeNull();
  });
});
