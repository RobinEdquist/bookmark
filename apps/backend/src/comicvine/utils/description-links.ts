// ---------------------------------------------------------------------------
// Links in ComicVine descriptions
// ---------------------------------------------------------------------------
// ComicVine's HTML descriptions link to its own pages with root-relative
// ("/just-the-tips/4050-78556/") and protocol-relative
// ("//www.comicvine.com/matt-fraction/4040-42266/") URLs. Rendered inside
// Bookmark, a root-relative link opens a Bookmark page that does not exist.
// Descriptions are cached as ComicVine sent them, so the links are made
// absolute when a description is read, which also covers rows cached before.
// ---------------------------------------------------------------------------

import * as cheerio from 'cheerio';

const COMICVINE_ORIGIN = 'https://comicvine.gamespot.com/';

/**
 * Point every root- and protocol-relative link in a ComicVine description at
 * ComicVine. Other links and the rest of the HTML are left alone; a
 * description with nothing to change comes back as the same string.
 */
export function absoluteComicvineLinks(html: string): string;
export function absoluteComicvineLinks(
  html: string | null | undefined,
): string | null | undefined;
export function absoluteComicvineLinks(
  html: string | null | undefined,
): string | null | undefined {
  if (!html?.includes('href')) return html;

  const $ = cheerio.load(html, null, false);
  let changed = false;
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')?.trim();
    if (!href?.startsWith('/')) return;
    $(el).attr('href', new URL(href, COMICVINE_ORIGIN).toString());
    changed = true;
  });

  return changed ? $.html() : html;
}
