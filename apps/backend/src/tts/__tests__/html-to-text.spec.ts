import {
  decodeHtmlEntities,
  htmlToPlainText,
  firstHeadingText,
} from '../utils/html-to-text';

describe('decodeHtmlEntities', () => {
  it('decodes named entities', () => {
    expect(decodeHtmlEntities('Tom &amp; Jerry &ndash; &ldquo;hi&rdquo;')).toBe(
      'Tom & Jerry – “hi”',
    );
  });

  it('decodes numeric decimal and hex entities', () => {
    expect(decodeHtmlEntities('&#65;&#x42;')).toBe('AB');
    expect(decodeHtmlEntities('caf&#233;')).toBe('café');
  });

  it('leaves unknown named entities untouched', () => {
    expect(decodeHtmlEntities('&bogus;')).toBe('&bogus;');
  });
});

describe('htmlToPlainText', () => {
  it('turns block elements into paragraph breaks', () => {
    const html = '<p>First paragraph.</p><p>Second paragraph.</p>';
    expect(htmlToPlainText(html)).toBe('First paragraph.\n\nSecond paragraph.');
  });

  it('strips scripts, styles, and comments entirely', () => {
    const html =
      '<style>p { color: red }</style><script>alert(1)</script><!-- x --><p>Kept.</p>';
    expect(htmlToPlainText(html)).toBe('Kept.');
  });

  it('strips inline tags but keeps their text', () => {
    const html = '<p>He said <em>hello</em> to <a href="#">her</a>.</p>';
    expect(htmlToPlainText(html)).toBe('He said hello to her.');
  });

  it('collapses runs of whitespace but preserves paragraph breaks', () => {
    const html = '<p>One   two\n three</p>\n\n\n<p>Four</p>';
    expect(htmlToPlainText(html)).toBe('One two three\n\nFour');
  });

  it('handles br and hr as breaks', () => {
    expect(htmlToPlainText('line one<br/>line two')).toBe(
      'line one\n\nline two',
    );
  });
});

describe('firstHeadingText', () => {
  it('returns the first heading text without tags', () => {
    const html = '<div><h2>Chapter <i>One</i></h2><p>Text</p></div>';
    expect(firstHeadingText(html)).toBe('Chapter One');
  });

  it('returns null when there is no heading', () => {
    expect(firstHeadingText('<p>No heading here</p>')).toBeNull();
  });
});
