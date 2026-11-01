// Elements whose text is not part of the prose: image captions, tables of
// collected editions, and anything that is code rather than text.
const DROPPED_SELECTOR = "figure, table, script, style, template";

// Elements that start a new line when rendered. Their boundaries become
// spaces so neighbouring paragraphs don't run into one word.
const BLOCK_SELECTOR =
  "p, div, br, h1, h2, h3, h4, h5, h6, li, ul, ol, dl, dt, dd, blockquote, pre, hr, section, article, header, footer";

/**
 * Plain text of an HTML fragment, for short previews of third-party
 * descriptions (ComicVine sends HTML) where markup can't be rendered.
 *
 * Entities are decoded and whitespace collapsed. DOMParser builds an inert
 * document, so nothing in the fragment runs or loads. Browser only.
 */
export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.body.querySelectorAll(DROPPED_SELECTOR).forEach((el) => el.remove());
  doc.body.querySelectorAll(BLOCK_SELECTOR).forEach((el) => {
    el.before(" ");
    el.after(" ");
  });
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
}
