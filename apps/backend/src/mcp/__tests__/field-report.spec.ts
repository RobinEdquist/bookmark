import { DEFAULT_COMIC_METADATA_PRIORITY } from '../../app-settings/schema';
import { reportField, reportLocal, reportRelation } from '../field-report';

const priority = DEFAULT_COMIC_METADATA_PRIORITY.description;

describe('reportField', () => {
  it('reports the file value as the source when ComicVine is not linked', () => {
    expect(
      reportField(
        'description',
        { manual: 'From the file', embedded: 'From the file' },
        priority,
        [],
      ),
    ).toEqual({ value: 'From the file', source: 'file' });
  });

  it('falls back to ComicVine and says what the file had', () => {
    expect(
      reportField(
        'description',
        { manual: null, embedded: null, comicvine: 'From ComicVine' },
        priority,
        [],
      ),
    ).toEqual({
      value: 'From ComicVine',
      source: 'comicvine',
      other: { file: null },
    });
  });

  it('calls a locked column a hand-edit and keeps ComicVine as the other', () => {
    expect(
      reportField(
        'description',
        { manual: 'Typed', embedded: 'Typed', comicvine: 'From ComicVine' },
        ['manual', 'comicvine', 'embedded'],
        ['description'],
      ),
    ).toEqual({
      value: 'Typed',
      source: 'hand-edit',
      locked: true,
      other: { comicvine: 'From ComicVine' },
    });
  });

  it('shows ComicVine over the file when the priority puts it first', () => {
    expect(
      reportField(
        'description',
        { manual: 'File', embedded: 'File', comicvine: 'CV' },
        ['manual', 'comicvine', 'embedded'],
        [],
      ),
    ).toEqual({ value: 'CV', source: 'comicvine', other: { file: 'File' } });
  });

  it('reports a linked source with no value as null', () => {
    expect(
      reportField(
        'description',
        { manual: 'File', embedded: 'File', comicvine: null },
        priority,
        [],
      ),
    ).toEqual({ value: 'File', source: 'file', other: { comicvine: null } });
  });

  it('reports nothing shown when no source has a value', () => {
    expect(
      reportField(
        'description',
        { manual: '', embedded: '', comicvine: null },
        priority,
        [],
      ),
    ).toEqual({
      value: null,
      source: null,
      other: { file: '', comicvine: null },
    });
  });

  it('shortens long text from sources that are not shown', () => {
    const long = 'x'.repeat(1000);
    const report = reportField(
      'description',
      { manual: 'Short', embedded: 'Short', comicvine: long },
      priority,
      [],
    );
    expect(report.value).toBe('Short');
    expect((report.other?.comicvine as string).length).toBe(301);
  });
});

describe('reportRelation', () => {
  it('keeps a locked empty list instead of falling back', () => {
    expect(
      reportRelation(
        'series',
        { manual: [], embedded: [], hardcover: ['Stormlight'] },
        ['manual', 'embedded', 'hardcover'],
        ['series'],
      ),
    ).toEqual({
      value: [],
      source: 'hand-edit',
      locked: true,
      other: { hardcover: ['Stormlight'] },
    });
  });

  it('resolves like a field when not locked', () => {
    expect(
      reportRelation(
        'author',
        { manual: [], embedded: [], hardcover: ['Brandon Sanderson'] },
        ['manual', 'embedded', 'hardcover'],
        [],
      ),
    ).toEqual({
      value: ['Brandon Sanderson'],
      source: 'hardcover',
      other: { file: [] },
    });
  });
});

describe('reportLocal', () => {
  it('reports a local column with its lock', () => {
    expect(reportLocal('imprint', 'Vertigo', ['imprint'])).toEqual({
      value: 'Vertigo',
      source: 'hand-edit',
      locked: true,
    });
  });
});
