import type { ComicBookFormat } from "./use-comics";

// Formats that package multiple issues into one volume. Everything else is an
// "issue" for grouping purposes in the series view.
export const COLLECTED_EDITION_FORMATS: ReadonlySet<ComicBookFormat> = new Set([
  "tpb",
  "omnibus",
  "compendium",
  "graphic_novel",
]);

export function isCollectedEdition(format: ComicBookFormat): boolean {
  return COLLECTED_EDITION_FORMATS.has(format);
}

// Side material that isn't part of the main numbered run and isn't a
// multi-issue collection: annuals, one-shots, specials, and anything
// unclassified. The backend already excludes these from gap detection, so the
// series view groups them in their own "Specials & Annuals" section rather
// than interleaving them with the numbered issues.
export function isSpecialEdition(format: ComicBookFormat): boolean {
  return format !== "single_issue" && !isCollectedEdition(format);
}
