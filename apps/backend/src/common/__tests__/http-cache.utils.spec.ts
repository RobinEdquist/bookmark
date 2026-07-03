import { createContentETag, matchesIfNoneMatch } from '../http-cache.utils';

describe('http-cache utils', () => {
  describe('createContentETag', () => {
    it('creates a stable strong ETag from response bytes', () => {
      const first = createContentETag(Buffer.from('cover-bytes'));
      const second = createContentETag(Buffer.from('cover-bytes'));

      expect(first).toBe(second);
      expect(first).toMatch(/^"[a-f0-9]{64}"$/);
    });

    it('changes when response bytes change', () => {
      expect(createContentETag(Buffer.from('old-cover'))).not.toBe(
        createContentETag(Buffer.from('new-cover')),
      );
    });
  });

  describe('matchesIfNoneMatch', () => {
    it('matches the current ETag', () => {
      expect(matchesIfNoneMatch('"abc"', '"abc"')).toBe(true);
    });

    it('matches a weak version of the current ETag', () => {
      expect(matchesIfNoneMatch('W/"abc"', '"abc"')).toBe(true);
    });

    it('matches one ETag from a comma-separated list', () => {
      expect(matchesIfNoneMatch('"old", "abc"', '"abc"')).toBe(true);
    });

    it('matches the wildcard validator', () => {
      expect(matchesIfNoneMatch('*', '"abc"')).toBe(true);
    });

    it('rejects stale validators', () => {
      expect(matchesIfNoneMatch('"old"', '"abc"')).toBe(false);
    });
  });
});
