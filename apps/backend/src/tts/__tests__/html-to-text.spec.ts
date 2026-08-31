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

  it('keeps the content of an unclosed blocked element (no removal without a closer)', () => {
    const html = '<p>Before</p><script>var x = 1;<p>After</p>';
    // The old lazy regex also left unclosed regions untouched — content is
    // kept rather than silently dropped on malformed chapters.
    expect(htmlToPlainText(html)).toContain('After');
    expect(htmlToPlainText(html)).toContain('Before');
  });

  it('keeps the text of a never-closed comment', () => {
    expect(htmlToPlainText('Kept<!-- dangling')).toBe('Kept<!-- dangling');
  });

  it('strips several blocked regions in sequence', () => {
    const html =
      '<script>a</script><p>One</p><!-- c --><style>b</style><p>Two</p>';
    expect(htmlToPlainText(html)).toBe('One\n\nTwo');
  });

  it('does not treat lookalike tag names as blocked openers', () => {
    expect(htmlToPlainText('<scripting-is-fun>hello</scripting-is-fun>')).toBe(
      'hello',
    );
  });

  it('processes adversarial input with many unclosed openers in linear time', () => {
    // 200k "<script" opens without closes: quadratic backtracking on the
    // old regex took minutes; the forward scan must finish near-instantly.
    const adversarial = '<script>'.repeat(200_000) + '<p>tail</p>';
    const startedAt = Date.now();
    const result = htmlToPlainText(adversarial);
    const elapsed = Date.now() - startedAt;

    expect(result).toContain('tail');
    // Generous bound: even a slow CI runner completes this in well under a
    // second; the old implementation needed orders of magnitude more.
    expect(elapsed).toBeLessThan(2000);
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
