import {
  parseComicFilename,
  parseSeriesFolderName,
  computeSortNumber,
} from '../comic-filename.utils';

describe('parseComicFilename', () => {
  const cases: Array<
    [
      string,
      {
        title: string;
        number: string | null;
        sortNumber: number | null;
        format: string;
        year: number | null;
        countInSeries: number | null;
      },
    ]
  > = [
    [
      'Saga #043 (2017).cbz',
      {
        title: 'Saga',
        number: '43',
        sortNumber: 43,
        format: 'single_issue',
        year: 2017,
        countInSeries: null,
      },
    ],
    [
      'Saga 043 (of 54) (2017).cbz',
      {
        title: 'Saga',
        number: '43',
        sortNumber: 43,
        format: 'single_issue',
        year: 2017,
        countInSeries: 54,
      },
    ],
    [
      'Monstress Vol. 04 (2019).cbz',
      {
        title: 'Monstress',
        number: '4',
        sortNumber: 4,
        format: 'tpb',
        year: 2019,
        countInSeries: null,
      },
    ],
    [
      'Monstress v04 (2019).cbr',
      {
        title: 'Monstress',
        number: '4',
        sortNumber: 4,
        format: 'tpb',
        year: 2019,
        countInSeries: null,
      },
    ],
    [
      'X-Men Annual #1 (1991).cbz',
      {
        title: 'X-Men',
        number: 'Annual 1',
        sortNumber: 1,
        format: 'annual',
        year: 1991,
        countInSeries: null,
      },
    ],
    [
      'Saga Compendium Omnibus 1.cbz',
      {
        title: 'Saga Compendium',
        number: '1',
        sortNumber: 1,
        format: 'omnibus',
        year: null,
        countInSeries: null,
      },
    ],
    [
      'Watchmen.pdf',
      {
        title: 'Watchmen',
        number: null,
        sortNumber: null,
        format: 'single_issue',
        year: null,
        countInSeries: null,
      },
    ],
    [
      'Paper Girls #1.5 (2016).cbz',
      {
        title: 'Paper Girls',
        number: '1.5',
        sortNumber: 1.5,
        format: 'single_issue',
        year: 2016,
        countInSeries: null,
      },
    ],
  ];

  it.each(cases)('parses %s', (fileName, expected) => {
    const result = parseComicFilename(fileName);
    expect(result.title).toBe(expected.title);
    expect(result.number).toBe(expected.number);
    expect(result.sortNumber).toBe(expected.sortNumber);
    expect(result.format).toBe(expected.format);
    expect(result.year).toBe(expected.year);
    expect(result.countInSeries).toBe(expected.countInSeries);
  });

  it.each([
    // [filename, expectedNumber, expectedTitle, expectedFormat, expectedYear]
    ['Saga Vol.2012 #51 (April 2018).cbz', '51', 'Saga', 'single_issue', 2018],
    ['Saga Vol.2012 #01 (March 2012).cbz', '1', 'Saga', 'single_issue', 2012],
    ['Batman #700 (2010).cbz', '700', 'Batman', 'single_issue', 2010],
    ['Invincible #001 (Digital) (Empire).cbz', '1', 'Invincible', 'single_issue', null],
    ['Saga Vol. 4 (2015).cbz', '4', 'Saga', 'tpb', 2015],
    ['X-Men Annual #1 (1995).cbz', 'Annual 1', 'X-Men', 'annual', 1995],
    ['Y The Last Man #03 (of 60) (2002).cbz', '3', 'Y The Last Man', 'single_issue', 2002],
    ['Saga #25.5 (2015).cbz', '25.5', 'Saga', 'single_issue', 2015],
  ] as const)('parses "%s" -> #%s / %s / %s / %s', (fileName, num, title, format, year) => {
    const r = parseComicFilename(fileName);
    expect(r.number).toBe(num);
    expect(r.title).toBe(title);
    expect(r.format).toBe(format);
    expect(r.year).toBe(year);
  });
});

describe('parseSeriesFolderName', () => {
  it('extracts trailing year', () => {
    expect(parseSeriesFolderName('Saga (2012)')).toEqual({
      title: 'Saga',
      year: 2012,
    });
  });

  it('handles folder without year', () => {
    expect(parseSeriesFolderName('Paper Girls')).toEqual({
      title: 'Paper Girls',
      year: null,
    });
  });
});

describe('computeSortNumber', () => {
  it.each([
    ['43', 43],
    ['1.5', 1.5],
    ['1AU', 1],
    ['Annual 1', 1],
    [null, null],
    ['abc', null],
  ])('computes sort number for %s', (input, expected) => {
    expect(computeSortNumber(input)).toBe(expected);
  });
});
