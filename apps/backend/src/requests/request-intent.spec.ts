import {
  bookKey,
  languageKey,
  nextSearchDate,
  selectCandidate,
  parseReleaseDate,
} from './request-intent';

describe('Book request intent', () => {
  const request = {
    title: 'The Book',
    author: 'An Author',
    contentType: 'audiobook' as const,
    languageNames: ['English'],
  };
  const result = {
    id: 10,
    title: 'The Book',
    author: 'An Author',
    contentType: 'audiobook' as const,
    categoryId: 13,
    language: 'English',
  };

  it('shares normalized book identities while preserving author distinctions and delimiter-containing titles', () => {
    expect(bookKey('  The  Book ', 'AN Author')).toBe(
      bookKey('the book', 'an author'),
    );
    expect(bookKey('Book', 'Author A')).not.toBe(bookKey('Book', 'Author B'));
    expect(bookKey('a, b', 'c')).not.toBe(bookKey('a', 'b, c'));
    expect(languageKey(['Swedish', 'ENGLISH', 'English'])).toBe(
      languageKey(['English', 'Swedish']),
    );
  });

  it('never selects a different medium, author, unknown language, or approximate title', () => {
    expect(
      selectCandidate(request, [
        { ...result, contentType: 'ebook' },
        { ...result, author: 'Other' },
        { ...result, language: 'Swedish' },
        { ...result, language: undefined },
        { ...result, title: 'The Book sequel' },
      ]),
    ).toBeNull();
    expect(selectCandidate(request, [result, { ...result, id: 5 }])?.id).toBe(
      5,
    );
  });

  it('waits on ambiguous authors when only a title is known', () => {
    expect(selectCandidate({ ...request, author: null }, [result])?.id).toBe(
      10,
    );
    expect(
      selectCandidate({ ...request, author: null }, [
        result,
        { ...result, id: 20, author: 'Other Author' },
      ]),
    ).toBeNull();
  });

  it('does not trust invalid calendar dates or locale-dependent date strings', () => {
    expect(parseReleaseDate('2026-02-30')).toBeNull();
    expect(parseReleaseDate('02/03/2026')).toBeNull();
    expect(parseReleaseDate('2026-02-28T12:00:00Z')?.toISOString()).toBe(
      '2026-02-28T12:00:00.000Z',
    );
  });

  it('handles publication transitions, unknown dates, and bounded infrastructure backoff', () => {
    const now = new Date('2026-10-02T00:00:00Z');
    expect(nextSearchDate(now, 0, null).toISOString()).toBe(
      '2026-10-03T00:00:00.000Z',
    );
    expect(nextSearchDate(now, 0, new Date('2026-10-04')).toISOString()).toBe(
      '2026-10-04T00:00:00.000Z',
    );
    expect(nextSearchDate(now, 0, new Date('2027-01-01')).toISOString()).toBe(
      '2026-10-09T00:00:00.000Z',
    );
    expect(nextSearchDate(now, 0, new Date('2026-09-01')).toISOString()).toBe(
      '2026-10-03T00:00:00.000Z',
    );
    expect(nextSearchDate(now, 20, new Date('invalid')).toISOString()).toBe(
      '2026-10-09T00:00:00.000Z',
    );
  });
});
