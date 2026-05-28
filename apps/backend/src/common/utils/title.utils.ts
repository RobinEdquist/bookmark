/**
 * External metadata sources (Hardcover, Goodreads) store the full book title
 * — including any subtitle — in a single `title` field with the convention
 * `"Title: Subtitle"`. Our DB keeps title and subtitle separate.
 *
 * When the metadata-priority resolver picks an external title while the
 * subtitle still resolves from the embedded source, the subtitle ends up
 * rendered twice (once inline in the title, once on its own line).
 *
 * This helper normalizes an external title against a known embedded subtitle:
 * if the title ends with `": <subtitle>"` (case-insensitively), strip that
 * suffix so the title aligns with our title/subtitle split.
 */
export function stripDuplicateSubtitle(
  externalTitle: string | null | undefined,
  embeddedSubtitle: string | null | undefined,
): string | null | undefined {
  if (!externalTitle || !embeddedSubtitle) return externalTitle;

  const suffix = `: ${embeddedSubtitle}`;
  if (externalTitle.toLowerCase().endsWith(suffix.toLowerCase())) {
    return externalTitle.slice(0, -suffix.length).trim() || externalTitle;
  }
  return externalTitle;
}

/**
 * Split a combined `"Title: Subtitle"` string into separate title and subtitle
 * parts on the first `": "` occurrence. Falls back to `{ title: combined,
 * subtitle: null }` if there is no separator or either side would be empty.
 *
 * Used when ingesting external metadata so the subtitle lives in its own field
 * rather than baked into the title.
 */
export function splitTitleSubtitle(
  combined: string | null | undefined,
):
  | { title: string; subtitle: string | null }
  | { title: null; subtitle: null } {
  if (!combined) return { title: null, subtitle: null };

  const idx = combined.indexOf(': ');
  if (idx <= 0) return { title: combined, subtitle: null };

  const title = combined.slice(0, idx).trim();
  const subtitle = combined.slice(idx + 2).trim();

  if (!title || !subtitle) return { title: combined, subtitle: null };

  return { title, subtitle };
}

/**
 * Resolve the title to display for an external source (Hardcover/Goodreads),
 * accounting for legacy combined titles.
 *
 * External sources historically packed `"Title: Subtitle"` into a single field.
 * Recent ingest splits incoming titles into `title`/`subtitle` columns, but old
 * rows still have the combined value with `subtitle = null`. Without cleanup,
 * the list view renders `"<Title>: <Subtitle>"` plus the embedded subtitle on
 * its own line — visually broken and inconsistent with the detail view.
 *
 * Resolution order:
 * 1. External `subtitle` is set → row was ingested post-fix, title is clean.
 * 2. External title ends with `": <embeddedSubtitle>"` → strip that exact
 *    suffix (preserves titles where the colon is part of the real name).
 * 3. External title starts with `"<embeddedTitle>: "` → it was synthesized
 *    from the embedded title plus some other subtitle the external source
 *    bundled in; return the embedded-title prefix.
 * 4. Otherwise leave it alone — we don't have enough signal to split safely.
 */
export function resolveExternalTitle(
  externalTitle: string | null | undefined,
  externalSubtitle: string | null | undefined,
  embeddedTitle: string | null | undefined,
  embeddedSubtitle: string | null | undefined,
): string | null | undefined {
  if (!externalTitle) return externalTitle;
  if (externalSubtitle) return externalTitle;

  const stripped = stripDuplicateSubtitle(externalTitle, embeddedSubtitle);
  if (stripped !== externalTitle) return stripped;

  if (embeddedTitle) {
    const prefix = `${embeddedTitle}: `;
    if (externalTitle.toLowerCase().startsWith(prefix.toLowerCase())) {
      const head = externalTitle.slice(0, embeddedTitle.length).trim();
      if (head) return head;
    }
  }

  return externalTitle;
}
