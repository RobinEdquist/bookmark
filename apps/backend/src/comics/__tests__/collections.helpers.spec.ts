import { reorderPositions, resolveCollectionCover } from '../collections.helpers';

describe('reorderPositions', () => {
  it('maps each id to its array index', () => {
    expect(reorderPositions(['c', 'a', 'b'])).toEqual([
      { seriesId: 'c', position: 0 },
      { seriesId: 'a', position: 1 },
      { seriesId: 'b', position: 2 },
    ]);
  });
});

describe('resolveCollectionCover', () => {
  it('uses the collection own cover when present', () => {
    expect(
      resolveCollectionCover('/api/comics/collections/c1/cover', '/api/comics/series/s1/cover'),
    ).toBe('/api/comics/collections/c1/cover');
  });
  it('falls back to the first member cover when own is null', () => {
    expect(resolveCollectionCover(null, '/api/comics/series/s1/cover')).toBe(
      '/api/comics/series/s1/cover',
    );
  });
  it('returns null when neither exists', () => {
    expect(resolveCollectionCover(null, null)).toBeNull();
  });
});
