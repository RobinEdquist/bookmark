import { absoluteComicvineLinks } from '../description-links';

describe('absoluteComicvineLinks', () => {
  it('points root- and protocol-relative links at ComicVine', () => {
    // Shortened from ComicVine's description of Sex Criminals (2013).
    const html =
      '<p>Writer <a href="//www.comicvine.com/matt-fraction/4040-42266/" data-ref-id="4040-42266">Matt Fraction</a>.</p><h4>Companion Series</h4><ul><li><a href="/just-the-tips/4050-78556/" data-ref-id="4050-78556">Just the Tips</a></li></ul>';

    expect(absoluteComicvineLinks(html)).toBe(
      '<p>Writer <a href="https://www.comicvine.com/matt-fraction/4040-42266/" data-ref-id="4040-42266">Matt Fraction</a>.</p><h4>Companion Series</h4><ul><li><a href="https://comicvine.gamespot.com/just-the-tips/4050-78556/" data-ref-id="4050-78556">Just the Tips</a></li></ul>',
    );
  });

  it('leaves absolute, fragment and page-relative links alone', () => {
    const html =
      '<a href="https://example.com/x">a</a> <a href="#top">b</a> <a href="notes/">c</a>';

    expect(absoluteComicvineLinks(html)).toBe(html);
  });

  it('returns a description without links unchanged', () => {
    const html = '<p>Tom &amp; Jerry&nbsp;#1</p>';

    expect(absoluteComicvineLinks(html)).toBe(html);
    expect(absoluteComicvineLinks('Plain text & more')).toBe(
      'Plain text & more',
    );
  });

  it('passes empty values through', () => {
    expect(absoluteComicvineLinks(null)).toBeNull();
    expect(absoluteComicvineLinks(undefined)).toBeUndefined();
    expect(absoluteComicvineLinks('')).toBe('');
  });
});
