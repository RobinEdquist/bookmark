import {
  distinctSourceSeriesIds,
  withSeriesIdManual,
  selectBooksToImport,
} from '../comic-grouping.utils';

describe('distinctSourceSeriesIds', () => {
  it('returns unique source series excluding the target', () => {
    const books = [
      { seriesId: 'a' },
      { seriesId: 'a' },
      { seriesId: 'b' },
      { seriesId: 'target' },
    ];
    expect(distinctSourceSeriesIds(books, 'target')).toEqual(['a', 'b']);
  });

  it('returns empty when all books already belong to the target', () => {
    expect(distinctSourceSeriesIds([{ seriesId: 'target' }], 'target')).toEqual(
      [],
    );
  });
});

describe('withSeriesIdManual', () => {
  it('adds seriesId to an empty/null manualFields', () => {
    expect(withSeriesIdManual(null)).toEqual(['seriesId']);
  });

  it('does not duplicate seriesId and preserves existing fields', () => {
    expect(withSeriesIdManual(['title', 'seriesId'])).toEqual([
      'title',
      'seriesId',
    ]);
  });
});

describe('selectBooksToImport', () => {
  it('returns only file paths that do not already exist', () => {
    const exists = new Set(['Saga/Saga 001.cbz']);
    expect(
      selectBooksToImport(['Saga/Saga 001.cbz', 'Saga/Saga 002.cbz'], exists),
    ).toEqual(['Saga/Saga 002.cbz']);
  });

  it('returns empty when every file already exists (prevents phantom series)', () => {
    const exists = new Set(['Saga 055.cbz']);
    expect(selectBooksToImport(['Saga 055.cbz'], exists)).toEqual([]);
  });
});
