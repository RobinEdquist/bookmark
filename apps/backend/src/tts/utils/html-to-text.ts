// Pure helpers to turn EPUB chapter XHTML into narration-ready plain text.

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  copy: '©',
  reg: '®',
  trade: '™',
  deg: '°',
  shy: '',
};

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const code = parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : '';
    })
    .replace(/&([a-zA-Z]+);/g, (match, name: string) => {
      const decoded = NAMED_ENTITIES[name.toLowerCase()];
      return decoded !== undefined ? decoded : match;
    });
}

// Regions whose entire content is dropped during conversion: script/style/
// head/svg/math (the same list the previous regex handled), plus comments.
const BLOCKED_TAG_PATTERN = /^\/?(script|style|head|svg|math)(?![a-z0-9])/;

/**
 * Removes blocked elements (script/style/head/svg/math) and comments in
 * linear time.
 *
 * This replaces a pair of lazy regexes (`/<(script|...)[\s\S]*?<\/\1>/gi`
 * and `/<!--[\s\S]*?-->/g`) whose backtracking was quadratic on input with
 * many unclosed openers — a ReDoS vector, since chapter HTML comes from
 * EPUB files. The scan is a single forward pass: each `<` is examined once
 * (cheap boundary check), and each recognized region does one bounded
 * `indexOf` for its closer. An opener with no closer leaves the rest of
 * the input untouched — the same output the old regex produced for that
 * case (content is kept, only complete regions are removed).
 */
function stripBlockedRegions(html: string): string {
  const lower = html.toLowerCase();
  let result = '';
  let cursor = 0;

  while (cursor < html.length) {
    const open = lower.indexOf('<', cursor);
    if (open === -1) break;

    // "<" + optional "/" + longest tag name ("script") — a window of 9
    // characters after "<" is enough to test the boundary.
    const rest = lower.slice(open + 1, open + 10);
    const isComment = rest.startsWith('!--');
    const tagMatch = BLOCKED_TAG_PATTERN.exec(rest);

    if (!isComment && !tagMatch) {
      // Not a region opener: keep this character, keep scanning.
      result += html.slice(cursor, open + 1);
      cursor = open + 1;
      continue;
    }

    result += html.slice(cursor, open);

    if (isComment) {
      const close = lower.indexOf('-->', open + 4);
      // No closer: nothing is removed (matches the old lazy-regex behavior)
      // — the region itself and everything after it stay in the output.
      if (close === -1) return result + html.slice(open);
      cursor = close + 3;
      continue;
    }

    const tag = tagMatch![1];
    const close = lower.indexOf('</' + tag, open + 1 + tag.length);
    if (close === -1) return result + html.slice(open);
    const closeEnd = lower.indexOf('>', close);
    cursor = closeEnd === -1 ? html.length : closeEnd + 1;
  }

  result += html.slice(cursor);
  return result;
}

/**
 * Convert chapter XHTML into plain text. Block-level boundaries become
 * paragraph breaks so the TTS chunker can split at natural pauses.
 */
export function htmlToPlainText(html: string): string {
  let text = html;

  // Drop invisible/non-narratable content entirely
  text = stripBlockedRegions(text);

  // Block boundaries -> paragraph breaks
  text = text.replace(
    /<\/?(p|div|section|article|h[1-6]|li|ul|ol|blockquote|table|tr|figure|figcaption|header|footer|aside|dt|dd)\b[^>]*>/gi,
    '\n\n',
  );
  text = text.replace(/<(br|hr)\b[^>]*\/?>/gi, '\n\n');

  // Strip any remaining tags
  text = text.replace(/<[^>]+>/g, '');

  text = decodeHtmlEntities(text);

  // Normalize whitespace: paragraph breaks (from block tags) survive as
  // blank lines; single newlines are source formatting and become spaces.
  // NUL is used as a placeholder while the two are disentangled.
  text = text.replace(/\u00a0/g, ' ');
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/ ?\n ?/g, '\n');
  text = text.replace(/\n{2,}/g, '\u0000');
  text = text.replace(/\n/g, ' ');
  text = text.split('\u0000').join('\n\n');
  text = text.replace(/ {2,}/g, ' ');

  return text.trim();
}

/**
 * Text of the first heading element, used as a chapter-title fallback when
 * the spine item has no TOC entry.
 */
export function firstHeadingText(html: string): string | null {
  const match = /<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/i.exec(html);
  if (!match) return null;
  const text = decodeHtmlEntities(match[1].replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
  return text || null;
}
