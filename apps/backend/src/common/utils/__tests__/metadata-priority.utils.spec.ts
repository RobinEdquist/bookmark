import { hasValue, resolveFieldByPriority } from '../metadata-priority.utils';

describe('hasValue', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
    ['whitespace-only string', '   '],
    ['empty array', []],
  ])('treats %s as empty', (_label, value) => {
    expect(hasValue(value)).toBe(false);
  });

  it.each([
    ['a string', 'Dune'],
    ['zero', 0],
    ['false', false],
    ['a non-empty array', ['Frank Herbert']],
  ])('treats %s as present', (_label, value) => {
    expect(hasValue(value)).toBe(true);
  });
});

describe('resolveFieldByPriority', () => {
  const sources = {
    manual: 'Manual title',
    embedded: 'Embedded title',
    hardcover: 'Hardcover title',
    goodreads: 'Goodreads title',
  };

  it('returns the manual value when the field was manually edited', () => {
    expect(
      resolveFieldByPriority(
        'title',
        sources,
        ['manual', 'embedded', 'hardcover'],
        ['title'],
      ),
    ).toBe('Manual title');
  });

  it('ignores the manual value when the field was not manually edited', () => {
    expect(
      resolveFieldByPriority(
        'title',
        sources,
        ['manual', 'embedded', 'hardcover'],
        [],
      ),
    ).toBe('Embedded title');
  });

  it('follows the configured order for non-manual sources', () => {
    expect(
      resolveFieldByPriority(
        'title',
        sources,
        ['manual', 'goodreads', 'hardcover', 'embedded'],
        [],
      ),
    ).toBe('Goodreads title');
  });

  it('skips empty sources and falls through to the next one', () => {
    expect(
      resolveFieldByPriority(
        'title',
        { ...sources, goodreads: '  ' },
        ['manual', 'goodreads', 'hardcover', 'embedded'],
        [],
      ),
    ).toBe('Hardcover title');
  });

  it('falls back to the manual field name being checked, not the priority key', () => {
    // Comics check the column name ('number') while reading priority.bookNumber
    expect(
      resolveFieldByPriority(
        'number',
        { manual: '12', embedded: '11', comicvine: '10' },
        ['manual', 'comicvine', 'embedded'],
        ['number'],
      ),
    ).toBe('12');
  });

  it('ignores import-only sources that callers do not supply', () => {
    expect(
      resolveFieldByPriority(
        'title',
        { manual: null, embedded: 'Embedded title', hardcover: null },
        ['filename', 'folder_image', 'embedded'],
        [],
      ),
    ).toBe('Embedded title');
  });

  it('falls back to the embedded value when nothing in the priority matches', () => {
    expect(
      resolveFieldByPriority(
        'title',
        { manual: null, embedded: 'Embedded title', hardcover: null },
        ['hardcover'],
        [],
      ),
    ).toBe('Embedded title');
  });

  it('returns null when even the embedded value is missing', () => {
    expect(
      resolveFieldByPriority(
        'title',
        { manual: null, embedded: null, hardcover: null },
        ['manual', 'embedded', 'hardcover'],
        ['title'],
      ),
    ).toBeNull();
  });
});
