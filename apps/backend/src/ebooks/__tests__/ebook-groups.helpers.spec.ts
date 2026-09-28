import {
  containsPattern,
  MemberOrderError,
  mergeMemberOrder,
  normalizeName,
  normalizeOptionalText,
  normalizeRole,
  resolveGroupCover,
} from '../ebook-groups.helpers';

describe('normalizeName', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeName('  Curse   of\tStrahd  ')).toBe('Curse of Strahd');
  });
});

describe('normalizeOptionalText', () => {
  it('keeps internal newlines and drops blank text', () => {
    expect(normalizeOptionalText('  A game.\n\nGuides.  ')).toBe(
      'A game.\n\nGuides.',
    );
    expect(normalizeOptionalText('   ')).toBeNull();
    expect(normalizeOptionalText(null)).toBeNull();
  });
});

describe('normalizeRole', () => {
  it('stores a trimmed label and treats blank as no role', () => {
    expect(normalizeRole("  Dungeon   Master's Guide  ")).toBe(
      "Dungeon Master's Guide",
    );
    expect(normalizeRole('   ')).toBeNull();
    expect(normalizeRole(undefined)).toBeNull();
  });
});

describe('containsPattern', () => {
  it('escapes LIKE wildcards', () => {
    expect(containsPattern('100%_done\\x')).toBe('%100\\%\\_done\\\\x%');
  });
});

describe('resolveGroupCover', () => {
  it('prefers the group cover and falls back to the first ebook', () => {
    expect(resolveGroupCover('/groups/1/cover', '/ebooks/1/cover')).toBe(
      '/groups/1/cover',
    );
    expect(resolveGroupCover(null, '/ebooks/1/cover')).toBe('/ebooks/1/cover');
    expect(resolveGroupCover(null, null)).toBeNull();
  });
});

describe('mergeMemberOrder', () => {
  it('reorders the listed members and keeps a hidden member in place', () => {
    expect(
      mergeMemberOrder(['a', 'hidden', 'b', 'c'], ['b', 'a', 'c']),
    ).toEqual(['b', 'a', 'c', 'hidden']);
  });

  it('keeps an unlisted member that sits before the listed block', () => {
    expect(mergeMemberOrder(['hidden', 'a', 'b'], ['b', 'a'])).toEqual([
      'hidden',
      'b',
      'a',
    ]);
  });

  it('leaves the stored order alone when the client sends an empty list', () => {
    expect(mergeMemberOrder(['hidden', 'also-hidden'], [])).toEqual([
      'hidden',
      'also-hidden',
    ]);
  });

  it('rejects a duplicate or an unknown ebook', () => {
    expect(() => mergeMemberOrder(['a', 'b'], ['a', 'a'])).toThrow(
      MemberOrderError,
    );
    expect(() => mergeMemberOrder(['a'], ['missing'])).toThrow(
      MemberOrderError,
    );
  });
});
