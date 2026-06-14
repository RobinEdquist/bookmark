import { parseCollects } from '../comic-issue-list';

// KEEP THIS TABLE IN SYNC with apps/web/lib/__tests__/comic-issue-list.test.ts
const VECTORS = [
  { input: '', present: [], presentInts: [], unrecognized: [] },
  { input: '12', present: [12], presentInts: [12], unrecognized: [] },
  { input: '#12', present: [12], presentInts: [12], unrecognized: [] },
  {
    input: '1-54',
    present: Array.from({ length: 54 }, (_, i) => i + 1),
    presentInts: Array.from({ length: 54 }, (_, i) => i + 1),
    unrecognized: [],
  },
  {
    input: '1-18, 26, 52, 132',
    present: [...Array.from({ length: 18 }, (_, i) => i + 1), 26, 52, 132],
    presentInts: [...Array.from({ length: 18 }, (_, i) => i + 1), 26, 52, 132],
    unrecognized: [],
  },
  {
    input: '#1 – 18, 26',
    present: [...Array.from({ length: 18 }, (_, i) => i + 1), 26],
    presentInts: [...Array.from({ length: 18 }, (_, i) => i + 1), 26],
    unrecognized: [],
  },
  { input: '1.5', present: [1.5], presentInts: [], unrecognized: [] },
  { input: '1, 1, 2', present: [1, 2], presentInts: [1, 2], unrecognized: [] },
  { input: 'E^12', present: [], presentInts: [], unrecognized: ['E^12'] },
  { input: '5-2', present: [], presentInts: [], unrecognized: ['5-2'] },
  { input: '1-', present: [], presentInts: [], unrecognized: ['1-'] },
  {
    input: '1-10, abc',
    present: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    presentInts: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    unrecognized: ['abc'],
  },
  { input: '1-99999', present: [], presentInts: [], unrecognized: ['1-99999'] },
];

describe('parseCollects', () => {
  for (const v of VECTORS) {
    it(`parses ${JSON.stringify(v.input)}`, () => {
      const r = parseCollects(v.input);
      expect(r.present).toEqual(v.present);
      expect(r.presentInts).toEqual(v.presentInts);
      expect(r.unrecognized).toEqual(v.unrecognized);
    });
  }

  it('treats null/undefined as empty', () => {
    expect(parseCollects(null)).toEqual({
      present: [],
      presentInts: [],
      unrecognized: [],
    });
    expect(parseCollects(undefined)).toEqual({
      present: [],
      presentInts: [],
      unrecognized: [],
    });
  });
});

import { computeIssueCoverage } from '../comic-issue-list';

describe('computeIssueCoverage', () => {
  it('counts collected-edition issues as present (no false missing)', () => {
    // Owns only a compendium collecting #1-54 → caller passes the parsed set 1..54.
    const r = computeIssueCoverage(
      Array.from({ length: 54 }, (_, i) => i + 1),
      null,
    );
    expect(r.gaps).toEqual([]);
    expect(r.publishedTotal).toBeNull();
    expect(r.unownedPublished).toEqual([]);
  });

  it('reports internal gaps at/below the highest owned issue', () => {
    const r = computeIssueCoverage([1, 2, 3, 4, 5, 7, 8, 9, 10], null);
    expect(r.gaps).toEqual(['6']);
    expect(r.unownedPublished).toEqual([]);
  });

  it('ongoing with no ComicVine count: gaps only, no fabricated total', () => {
    const r = computeIssueCoverage([1, 2, 3], null);
    expect(r.gaps).toEqual([]);
    expect(r.publishedTotal).toBeNull();
    expect(r.unownedPublished).toEqual([]);
  });

  it('ComicVine count present: reports the published tail beyond owned', () => {
    const r = computeIssueCoverage([1, 2, 3, 4, 5], 8);
    expect(r.gaps).toEqual([]);
    expect(r.publishedTotal).toBe(8);
    expect(r.unownedPublished).toEqual(['6', '7', '8']);
  });

  it('combines internal gaps and published tail', () => {
    const r = computeIssueCoverage([1, 3, 5], 7);
    expect(r.gaps).toEqual(['2', '4']);
    expect(r.unownedPublished).toEqual(['6', '7']);
  });
});
