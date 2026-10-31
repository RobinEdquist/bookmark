import {
  normalizeMainCharacterNames,
  splitSoloAndTeamUps,
} from '../comic-main-characters';

describe('normalizeMainCharacterNames', () => {
  it('trims names and drops blanks', () => {
    expect(normalizeMainCharacterNames(['  Wolverine ', '', '   '])).toEqual([
      'Wolverine',
    ]);
  });

  it('drops case-insensitive duplicates and keeps the first spelling', () => {
    expect(
      normalizeMainCharacterNames(['Wolverine', 'wolverine', 'X-Men']),
    ).toEqual(['Wolverine', 'X-Men']);
  });

  it('keeps the given order', () => {
    expect(normalizeMainCharacterNames(['Rogue', 'Gambit'])).toEqual([
      'Rogue',
      'Gambit',
    ]);
  });

  it('returns an empty list for an empty input', () => {
    expect(normalizeMainCharacterNames([])).toEqual([]);
  });
});

describe('splitSoloAndTeamUps', () => {
  const series = (id: string, characters: number) => ({
    id,
    mainCharacters: Array.from({ length: characters }, (_, i) => i),
  });

  it('puts series with one main character in solo series', () => {
    const { soloSeries, teamUps } = splitSoloAndTeamUps([series('a', 1)]);
    expect(soloSeries.map((s) => s.id)).toEqual(['a']);
    expect(teamUps).toEqual([]);
  });

  it('puts series with several main characters in team-ups, keeping order', () => {
    const { soloSeries, teamUps } = splitSoloAndTeamUps([
      series('a', 2),
      series('b', 1),
      series('c', 3),
    ]);
    expect(soloSeries.map((s) => s.id)).toEqual(['b']);
    expect(teamUps.map((s) => s.id)).toEqual(['a', 'c']);
  });
});
