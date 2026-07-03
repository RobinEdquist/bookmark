// Pure planning logic: decide which EPUB spine items to narrate and how to
// group them into chapters, using the flow (linear spine) + TOC.

export interface SpineItemLike {
  id?: string;
  href?: string;
  title?: string;
  'media-type'?: string;
  mediaType?: string;
  'epub-type'?: string;
}

export interface PlannedChapter {
  /** Title from the TOC; null means "derive from content or number". */
  title: string | null;
  /** Spine item ids merged into this chapter (split-file chapters). */
  flowIds: string[];
}

// Unambiguous front/back-matter names. Deliberately conservative: narrating
// an extra page is harmless, silently dropping a real chapter is not.
// (No "index" - Calibre names ALL content files index_split_NNN.html.)
const SKIP_PATTERN =
  /(^|[^a-z])(cover|toc|nav|ncx|copyright|colophon|title[-_ ]?page|titlepage|halftitle|half[-_ ]?title|dedication|acknowledg\w*|imprint|front[-_ ]?matter|back[-_ ]?matter|also[-_ ]?by|advert\w*|newsletter|landmark)([^a-z]|$)/i;

const SKIP_EPUB_TYPES = new Set([
  'cover',
  'toc',
  'landmarks',
  'copyright-page',
  'titlepage',
  'halftitlepage',
  'dedication',
  'acknowledgments',
  'imprint',
  'frontmatter',
]);

function mediaTypeOf(item: SpineItemLike): string | undefined {
  return item['media-type'] ?? item.mediaType;
}

function isHtmlItem(item: SpineItemLike): boolean {
  const mediaType = mediaTypeOf(item);
  if (mediaType) {
    return /x?html/i.test(mediaType);
  }
  return /\.x?html?$/i.test(item.href ?? '');
}

function shouldSkip(item: SpineItemLike): boolean {
  const epubType = item['epub-type'];
  if (epubType && SKIP_EPUB_TYPES.has(epubType.toLowerCase())) return true;
  const href = item.href ?? '';
  const baseName = href.split('/').pop() ?? '';
  return SKIP_PATTERN.test(item.id ?? '') || SKIP_PATTERN.test(baseName);
}

/** Strip anchors and relative-path noise so flow and TOC hrefs compare. */
function normalizeHref(href: string): string {
  let normalized = href.split('#')[0];
  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    // keep the raw value when the href isn't valid percent-encoding
  }
  return normalized.replace(/^(\.\.?\/)+/, '').toLowerCase();
}

function baseNameOf(href: string): string {
  return normalizeHref(href).split('/').pop() ?? '';
}

/**
 * Plan the narration chapters for an EPUB.
 *
 * Walks the linear spine, drops non-content items, and groups consecutive
 * spine items that fall under the same TOC entry into a single chapter
 * (publishers commonly split one chapter across several xhtml files).
 */
export function planChapters(
  flow: SpineItemLike[],
  toc: SpineItemLike[],
): PlannedChapter[] {
  // TOC lookup by normalized href, with a basename fallback for epubs whose
  // TOC and spine disagree about relative paths. First entry wins.
  const byHref = new Map<string, string>();
  const byBaseName = new Map<string, string | null>();
  for (const entry of toc) {
    if (!entry.href) continue;
    const title = entry.title?.trim();
    if (!title) continue;
    const href = normalizeHref(entry.href);
    if (!byHref.has(href)) byHref.set(href, title);
    const base = baseNameOf(entry.href);
    if (!byBaseName.has(base)) {
      byBaseName.set(base, title);
    } else if (byBaseName.get(base) !== title) {
      byBaseName.set(base, null); // ambiguous basename - don't match on it
    }
  }

  const tocTitleFor = (item: SpineItemLike): string | undefined => {
    if (!item.href) return undefined;
    const direct = byHref.get(normalizeHref(item.href));
    if (direct) return direct;
    const byBase = byBaseName.get(baseNameOf(item.href));
    return byBase ?? undefined;
  };

  const chapters: PlannedChapter[] = [];
  let current: PlannedChapter | null = null;

  for (const item of flow) {
    if (!item.id || !isHtmlItem(item) || shouldSkip(item)) {
      continue;
    }

    const tocTitle = tocTitleFor(item);
    if (tocTitle !== undefined || current === null) {
      current = { title: tocTitle ?? null, flowIds: [item.id] };
      chapters.push(current);
    } else {
      // No TOC entry of its own: continuation of the previous chapter
      current.flowIds.push(item.id);
    }
  }

  return chapters;
}
