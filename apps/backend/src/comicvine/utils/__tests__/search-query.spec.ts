import { localSeriesFor, planVolumeSearch } from '../search-query';

const NOW = new Date('2026-10-31T12:00:00Z');
const plan = (title: string) => planVolumeSearch(title, NOW);

// ---------------------------------------------------------------------------
// planVolumeSearch — titles taken from a real library's folder names
// ---------------------------------------------------------------------------

describe('planVolumeSearch', () => {
  it('strips a pack order number, volume marker, issue range and extras', () => {
    expect(plan('02 Wolverine v2 01-189+Extras (1988-2003)')).toEqual({
      queries: ['Wolverine'],
      matchTitle: 'Wolverine',
      startYear: 1988,
      isCollected: false,
    });
  });

  it('searches without a bracketed edition but keeps it for matching', () => {
    expect(plan('Wolverine By Claremont & Miller (Deluxe Edition)')).toEqual({
      queries: [
        'Wolverine By Claremont & Miller',
        'Wolverine By Claremont/Miller',
      ],
      matchTitle: 'Wolverine By Claremont & Miller Deluxe Edition',
      startYear: null,
      isCollected: true,
    });
  });

  it('reads the start year from a collector-style name', () => {
    expect(plan('Rogue (2004)')).toMatchObject({
      queries: ['Rogue'],
      matchTitle: 'Rogue',
      startYear: 2004,
    });
  });

  it('does not take a year as the start year when the issues do not start at 1', () => {
    expect(plan('06 Wolverine v1 300-317 (2012-2013)')).toMatchObject({
      queries: ['Wolverine'],
      startYear: null,
    });
  });

  it('turns a spaced dash into a colon and falls back to each side', () => {
    expect(plan('Wolverine - Manifest Destiny 01-04')).toMatchObject({
      queries: ['Wolverine: Manifest Destiny', 'Manifest Destiny'],
      matchTitle: 'Wolverine: Manifest Destiny',
    });
    expect(plan('Fear Itself - Wolverine 01-03').queries).toEqual([
      'Fear Itself: Wolverine',
      'Fear Itself',
    ]);
  });

  it('never falls back to a single word', () => {
    expect(plan('Batman: Year One').queries).toEqual([
      'Batman: Year One',
      'Year One',
    ]);
    expect(plan('Batman: Odyssey').queries).toEqual(['Batman: Odyssey']);
  });

  it('tries "/" for "&", the way team-up volumes are usually named', () => {
    expect(plan('Wolverine & Hulk 01-04').queries).toEqual([
      'Wolverine & Hulk',
      'Wolverine/Hulk',
    ]);
  });

  it('drops TPB and HC from the search but marks the series as collected', () => {
    expect(plan('Wolverine - Old Man Logan TPB')).toMatchObject({
      queries: ['Wolverine: Old Man Logan', 'Old Man Logan'],
      matchTitle: 'Wolverine: Old Man Logan',
      isCollected: true,
    });
    expect(plan('Think Tank TPBs (v01-v03)(2012-2014)(digital)')).toMatchObject(
      { queries: ['Think Tank'], startYear: 2012 },
    );
  });

  it('reads a trailing bare year from free text', () => {
    expect(plan('Wolverine 1982')).toMatchObject({
      queries: ['Wolverine'],
      startYear: 1982,
    });
  });

  it('keeps numbers that are part of the title', () => {
    expect(plan('100 Bullets').queries).toEqual(['100 Bullets']);
    expect(plan('Spider-Man 2099').queries).toEqual(['Spider-Man 2099']);
    expect(plan('Marvel 1602').queries).toEqual(['Marvel 1602']);
    expect(plan('52').queries).toEqual(['52']);
    expect(plan('X-Men').queries).toEqual(['X-Men']);
  });

  it('removes scanner tags in brackets and zero-padded issue numbers', () => {
    expect(plan('Saga 001 (2012) (Digital) (Zone-Empire)')).toMatchObject({
      queries: ['Saga'],
      startYear: 2012,
    });
    expect(plan('Batman #1').queries).toEqual(['Batman']);
  });

  it('treats a bare year range as years, not issues', () => {
    expect(plan('Annuals 1995-2012')).toMatchObject({
      queries: ['Annuals'],
      startYear: 1995,
    });
  });

  it('reads issue ranges inside brackets', () => {
    expect(plan('Astonishing Tales (001-006)').queries).toEqual([
      'Astonishing Tales',
    ]);
    expect(plan('Wolverine (300-317) (2012)').startYear).toBeNull();
  });

  it('leaves a clean title alone', () => {
    expect(plan('Something is Killing the Children')).toEqual({
      queries: ['Something is Killing the Children'],
      matchTitle: 'Something is Killing the Children',
      startYear: null,
      isCollected: false,
    });
  });

  it('falls back to the original title when cleaning leaves nothing', () => {
    expect(plan('(2009)').queries).toEqual(['(2009)']);
  });

  it('tries at most three queries', () => {
    expect(
      plan('Wolverine & Gambit - Victims & Villains 01-04').queries,
    ).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// localSeriesFor
// ---------------------------------------------------------------------------

describe('localSeriesFor', () => {
  it('prefers the stored start year over one read from the title', () => {
    expect(localSeriesFor('Rogue (2004)', 2003, 12, NOW)).toEqual({
      title: 'Rogue',
      startYear: 2003,
      bookCount: 12,
      isCollected: false,
    });
  });

  it('uses the year from the title when none is stored', () => {
    expect(localSeriesFor('Rogue (2004)', null, null, NOW)).toMatchObject({
      startYear: 2004,
    });
  });
});
