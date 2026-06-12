import { parseMylarSeriesJson } from '../mylar-series-json.parser';

describe('parseMylarSeriesJson', () => {
  it('parses a Mylar series.json', () => {
    const json = JSON.stringify({
      version: '1.0.2',
      metadata: {
        type: 'comicSeries',
        publisher: 'Image Comics',
        imprint: null,
        name: 'Saga',
        comicid: 39342,
        year: 2012,
        description_text: 'Epic space opera.',
        volume: null,
        booktype: 'Print',
        age_rating: 'Mature',
        total_issues: 54,
        publication_run: '2012 - 2018',
        status: 'Ended',
      },
    });
    expect(parseMylarSeriesJson(json)).toEqual({
      name: 'Saga',
      publisher: 'Image Comics',
      imprint: null,
      year: 2012,
      description: 'Epic space opera.',
      totalIssues: 54,
      ageRating: 'Mature',
      comicvineVolumeId: 39342,
    });
  });

  it('returns null for invalid JSON', () => {
    expect(parseMylarSeriesJson('{nope')).toBeNull();
  });

  it('returns null when metadata.type is not comicSeries', () => {
    expect(
      parseMylarSeriesJson(JSON.stringify({ metadata: { type: 'other' } })),
    ).toBeNull();
  });
});
