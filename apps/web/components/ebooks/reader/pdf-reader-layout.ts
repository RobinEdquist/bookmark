/** Pure helpers for PDF fit/zoom/page navigation — kept free of React for tests. */

export type PdfFitMode = "page" | "width";

export const PDF_ZOOM_MIN = 0.5;
export const PDF_ZOOM_MAX = 4;
export const PDF_ZOOM_STEP = 0.25;
export const PDF_ZOOM_DEFAULT = 1;

export function clampPage(target: number, numPages: number): number {
  if (!Number.isFinite(target)) return 1;
  const pages = Math.max(1, numPages || 1);
  return Math.min(Math.max(Math.trunc(target), 1), pages);
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return PDF_ZOOM_DEFAULT;
  const stepped = Math.round(zoom / PDF_ZOOM_STEP) * PDF_ZOOM_STEP;
  return Math.min(PDF_ZOOM_MAX, Math.max(PDF_ZOOM_MIN, Number(stepped.toFixed(2))));
}

export function stepZoom(zoom: number, direction: 1 | -1): number {
  return clampZoom(zoom + direction * PDF_ZOOM_STEP);
}

/**
 * Base Page dimensions for the current fit mode (before zoom).
 * `pageAspect` is width/height at scale 1; when unknown, fall back to width.
 */
export function computeBasePageSize(
  fitMode: PdfFitMode,
  container: { width: number; height: number },
  pageAspect: number | null,
): { width: number } | { height: number } {
  if (fitMode === "width" || !pageAspect || pageAspect <= 0) {
    return { width: Math.max(1, container.width) };
  }
  // fit-page: contain
  return container.width / container.height > pageAspect
    ? { height: Math.max(1, container.height) }
    : { width: Math.max(1, container.width) };
}

/** Scale a single-dimension Page size prop by zoom (aspect preserved by react-pdf). */
export function applyZoomToPageSize(
  base: { width: number } | { height: number },
  zoom: number,
): { width: number } | { height: number } {
  const z = clampZoom(zoom);
  if ("width" in base) return { width: base.width * z };
  return { height: base.height * z };
}

export function parsePageInput(
  raw: string,
  numPages: number,
): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n)) return null;
  return clampPage(n, numPages);
}

const PDF_LOCATOR_PATTERN = /^page:(\d+)$/;

/** Parse a saved PDF locator (`page:N`) into a 1-based page number. */
export function parsePdfLocator(locator: string | null): number | null {
  if (!locator) return null;
  const match = PDF_LOCATOR_PATTERN.exec(locator);
  if (!match || !match[1]) return null;
  const page = parseInt(match[1], 10);
  return Number.isNaN(page) || page < 1 ? null : page;
}

