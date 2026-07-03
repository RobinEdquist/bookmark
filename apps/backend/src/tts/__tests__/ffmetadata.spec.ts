import { buildFfmetadata, escapeFfmetadataValue } from '../utils/ffmetadata';

describe('escapeFfmetadataValue', () => {
  it('escapes =, ;, #, and backslash', () => {
    expect(escapeFfmetadataValue('a=b;c#d\\e')).toBe('a\\=b\\;c\\#d\\\\e');
  });

  it('escapes newlines with a backslash continuation', () => {
    expect(escapeFfmetadataValue('line1\nline2')).toBe('line1\\\nline2');
    expect(escapeFfmetadataValue('line1\r\nline2')).toBe('line1\\\nline2');
  });
});

describe('buildFfmetadata', () => {
  it('writes the header, tags, and chapters', () => {
    const output = buildFfmetadata({ title: 'My Book', artist: 'Jane Doe' }, [
      { title: 'Chapter 1', startMs: 0, endMs: 1500 },
      { title: 'Chapter 2', startMs: 1500, endMs: 4000 },
    ]);

    expect(output).toBe(
      [
        ';FFMETADATA1',
        'title=My Book',
        'artist=Jane Doe',
        '',
        '[CHAPTER]',
        'TIMEBASE=1/1000',
        'START=0',
        'END=1500',
        'title=Chapter 1',
        '',
        '[CHAPTER]',
        'TIMEBASE=1/1000',
        'START=1500',
        'END=4000',
        'title=Chapter 2',
        '',
      ].join('\n'),
    );
  });

  it('omits undefined and empty tags', () => {
    const output = buildFfmetadata(
      { title: 'T', genre: undefined, comment: '' },
      [],
    );
    expect(output).toBe(';FFMETADATA1\ntitle=T\n');
  });

  it('escapes special characters in tag values and chapter titles', () => {
    const output = buildFfmetadata({ title: 'A;B' }, [
      { title: 'C=D', startMs: 0, endMs: 10 },
    ]);
    expect(output).toContain('title=A\\;B');
    expect(output).toContain('title=C\\=D');
  });

  it('rounds and clamps chapter times', () => {
    const output = buildFfmetadata({}, [
      { title: 'X', startMs: -5.4, endMs: 10.6 },
    ]);
    expect(output).toContain('START=0');
    expect(output).toContain('END=11');
  });
});
