import { splitPersonNames } from '../name.utils';

describe('splitPersonNames', () => {
  it('splits comma-separated names from a single string', () => {
    expect(splitPersonNames('Stephen Hawking, Hugh Laurie')).toEqual([
      'Stephen Hawking',
      'Hugh Laurie',
    ]);
  });

  it('splits comma-separated names from arrays and preserves order', () => {
    expect(
      splitPersonNames([
        'Stephen Hawking, Hugh Laurie',
        'Morgan Freeman',
        'Neil Gaiman, Terry Pratchett',
      ]),
    ).toEqual([
      'Stephen Hawking',
      'Hugh Laurie',
      'Morgan Freeman',
      'Neil Gaiman',
      'Terry Pratchett',
    ]);
  });

  it('trims whitespace, drops empty values, and deduplicates names case-insensitively', () => {
    expect(
      splitPersonNames([
        '  Stephen Hawking  ,  Hugh Laurie ',
        'stephen hawking',
        ', , Hugh Laurie,',
      ]),
    ).toEqual(['Stephen Hawking', 'Hugh Laurie']);
  });

  it('returns empty array for undefined or blank input', () => {
    expect(splitPersonNames(undefined)).toEqual([]);
    expect(splitPersonNames(' , , ')).toEqual([]);
  });
});
