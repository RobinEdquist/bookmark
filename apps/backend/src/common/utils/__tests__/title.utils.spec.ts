import {
  resolveExternalTitle,
  splitTitleSubtitle,
  stripDuplicateSubtitle,
} from '../title.utils';

describe('stripDuplicateSubtitle', () => {
  it('strips an exact subtitle suffix', () => {
    expect(
      stripDuplicateSubtitle(
        "We're All Mad Here: The No-Nonsense Guide to Living with Social Anxiety",
        'The No-Nonsense Guide to Living with Social Anxiety',
      ),
    ).toBe("We're All Mad Here");
  });

  it('is case-insensitive when matching the suffix', () => {
    expect(
      stripDuplicateSubtitle('Project Hail Mary: A NOVEL', 'a novel'),
    ).toBe('Project Hail Mary');
  });

  it('returns the original title when there is no embedded subtitle', () => {
    expect(stripDuplicateSubtitle('Star Wars: A New Hope', null)).toBe(
      'Star Wars: A New Hope',
    );
    expect(stripDuplicateSubtitle('Star Wars: A New Hope', '')).toBe(
      'Star Wars: A New Hope',
    );
  });

  it('returns the original title when the subtitle is not a suffix', () => {
    expect(stripDuplicateSubtitle('Dune', 'Book One of the Saga')).toBe('Dune');
    expect(
      stripDuplicateSubtitle(
        'Some Book: Different Subtitle',
        'Original Subtitle',
      ),
    ).toBe('Some Book: Different Subtitle');
  });

  it('passes through null and undefined external titles', () => {
    expect(stripDuplicateSubtitle(null, 'anything')).toBeNull();
    expect(stripDuplicateSubtitle(undefined, 'anything')).toBeUndefined();
  });

  it('does not strip when the result would be empty', () => {
    expect(stripDuplicateSubtitle(': The Subtitle', 'The Subtitle')).toBe(
      ': The Subtitle',
    );
  });
});

describe('splitTitleSubtitle', () => {
  it('splits on the first ": " separator', () => {
    expect(
      splitTitleSubtitle(
        "We're All Mad Here: The No-Nonsense Guide to Living with Social Anxiety",
      ),
    ).toEqual({
      title: "We're All Mad Here",
      subtitle: 'The No-Nonsense Guide to Living with Social Anxiety',
    });
  });

  it('keeps later ": " occurrences in the subtitle', () => {
    expect(splitTitleSubtitle('Foo: Bar: Baz')).toEqual({
      title: 'Foo',
      subtitle: 'Bar: Baz',
    });
  });

  it('returns the original title when there is no separator', () => {
    expect(splitTitleSubtitle('Dune')).toEqual({
      title: 'Dune',
      subtitle: null,
    });
  });

  it('does not split when one side would be empty', () => {
    expect(splitTitleSubtitle(': Only Subtitle')).toEqual({
      title: ': Only Subtitle',
      subtitle: null,
    });
    expect(splitTitleSubtitle('Only Title: ')).toEqual({
      title: 'Only Title: ',
      subtitle: null,
    });
  });

  it('passes through null, undefined, and empty', () => {
    expect(splitTitleSubtitle(null)).toEqual({ title: null, subtitle: null });
    expect(splitTitleSubtitle(undefined)).toEqual({
      title: null,
      subtitle: null,
    });
    expect(splitTitleSubtitle('')).toEqual({ title: null, subtitle: null });
  });
});

describe('resolveExternalTitle', () => {
  it('returns the external title as-is when external subtitle is set', () => {
    expect(
      resolveExternalTitle(
        'Come as You Are',
        'The Surprising New Science',
        'Come as You Are',
        'Revised and Updated',
      ),
    ).toBe('Come as You Are');
  });

  it('strips a matching embedded subtitle suffix', () => {
    expect(
      resolveExternalTitle(
        'Project Hail Mary: A Novel',
        null,
        'Project Hail Mary',
        'A Novel',
      ),
    ).toBe('Project Hail Mary');
  });

  it('falls back to the embedded title prefix when the external subtitle does not match', () => {
    // Legacy combined external title where the baked-in subtitle differs from
    // the embedded subtitle — this is the "Come as You Are" case.
    expect(
      resolveExternalTitle(
        'Come as You Are: The Surprising New Science That Will Transform Your Sex Life',
        null,
        'Come as You Are',
        'Revised and Updated',
      ),
    ).toBe('Come as You Are');
  });

  it('matches the embedded-title prefix case-insensitively', () => {
    expect(
      resolveExternalTitle(
        'COME AS YOU ARE: something',
        null,
        'Come as You Are',
        null,
      ),
    ).toBe('COME AS YOU ARE');
  });

  it('leaves the external title alone when neither hint matches', () => {
    expect(
      resolveExternalTitle(
        'Some External Title',
        null,
        'A Completely Different Embedded Title',
        'And subtitle',
      ),
    ).toBe('Some External Title');
  });

  it('does not aggressively split titles that genuinely contain a colon', () => {
    // Embedded title is the full "Foo: Bar", so the external "Foo: Bar"
    // should not be reduced to "Foo".
    expect(resolveExternalTitle('Foo: Bar', null, 'Foo: Bar', null)).toBe(
      'Foo: Bar',
    );
  });

  it('passes through null and undefined external titles', () => {
    expect(resolveExternalTitle(null, null, 'x', 'y')).toBeNull();
    expect(resolveExternalTitle(undefined, null, 'x', 'y')).toBeUndefined();
  });
});
