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
