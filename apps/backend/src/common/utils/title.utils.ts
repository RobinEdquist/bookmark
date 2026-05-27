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
