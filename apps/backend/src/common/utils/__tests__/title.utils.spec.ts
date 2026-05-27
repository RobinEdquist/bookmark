import { splitTitleSubtitle, stripDuplicateSubtitle } from '../title.utils';

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
