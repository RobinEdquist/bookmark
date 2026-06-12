// apps/backend/src/library-watcher/utils/mylar-series-json.parser.ts

export interface MylarSeriesMetadata {
  name: string | null;
  publisher: string | null;
  imprint: string | null;
  year: number | null;
  description: string | null;
  totalIssues: number | null;
  ageRating: string | null;
  /** ComicVine volume id — stored for Phase 2 exact matching */
  comicvineVolumeId: number | null;
}

export function parseMylarSeriesJson(
  content: string,
): MylarSeriesMetadata | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  const metadata = (parsed as { metadata?: Record<string, unknown> })?.metadata;
  if (!metadata || metadata.type !== 'comicSeries') return null;

  const str = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null;

  return {
    name: str(metadata.name),
    publisher: str(metadata.publisher),
    imprint: str(metadata.imprint),
    year: num(metadata.year),
    description: str(metadata.description_text),
    totalIssues: num(metadata.total_issues),
    ageRating: str(metadata.age_rating),
    comicvineVolumeId: num(metadata.comicid),
  };
}
