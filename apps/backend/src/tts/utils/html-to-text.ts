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

/**
 * Convert chapter XHTML into plain text. Block-level boundaries become
 * paragraph breaks so the TTS chunker can split at natural pauses.
 */
export function htmlToPlainText(html: string): string {
  let text = html;

  // Drop invisible/non-narratable content entirely
  text = text.replace(/<(script|style|head|svg|math)[\s\S]*?<\/\1>/gi, '');
  text = text.replace(/<!--[\s\S]*?-->/g, '');

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
