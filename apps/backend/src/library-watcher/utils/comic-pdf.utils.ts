// apps/backend/src/library-watcher/utils/comic-pdf.utils.ts
import * as fs from 'fs/promises';
import { createCanvas } from '@napi-rs/canvas';

export interface ComicPdfContents {
  pageCount: number;
  coverImage: { data: Buffer; extension: string } | null;
}

/**
 * Read a PDF comic: page count + first page rendered to PNG.
 * Throws on unreadable PDFs (callers quarantine).
 *
 * pdfjs-dist v6 is ESM-only (.mjs). This file uses a real ESM dynamic import(),
 * which works at runtime because:
 *   - NestJS production: tsconfig module:nodenext preserves import() as native ESM.
 *   - Jest tests: test scripts set NODE_OPTIONS=--experimental-vm-modules so Jest
 *     can evaluate ESM modules via the vm module system.
 */
export async function readComicPdf(
  filePath: string,
): Promise<ComicPdfContents> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const buf = await fs.readFile(filePath);
  // Keep the loading task so we can call destroy() on it after use.
  // PDFDocumentProxy (the .promise result) has cleanup() but not destroy();
  // destroy() lives on PDFDocumentLoadingTask.
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buf),
    useSystemFonts: true,
    disableFontFace: true,
  });

  try {
    const doc = await loadingTask.promise;

    let coverImage: { data: Buffer; extension: string } | null = null;
    try {
      const page = await doc.getPage(1);
      // Cap canvas size to avoid allocating enormous buffers for large scanned pages.
      // Normal cover pages (e.g. 612×792 pt) scale to 2× comfortably; a 4096-px
      // ceiling kicks in only for giant scans (e.g. 3000-pt width → ~1.37× scale).
      const MAX_RENDER_DIMENSION = 4096;
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(
        2,
        MAX_RENDER_DIMENSION /
          Math.max(baseViewport.width, baseViewport.height),
      );
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(
        Math.ceil(viewport.width),
        Math.ceil(viewport.height),
      );
      const ctx = canvas.getContext('2d');
      await page.render({
        // pdfjs v6 RenderParameters: canvas is required but accepts null.
        // When canvas is null, pdfjs uses canvasContext directly for drawing.
        // @napi-rs/canvas context is API-compatible; cast satisfies the DOM type.
        canvas: null,
        canvasContext: ctx as unknown as CanvasRenderingContext2D,
        viewport,
      }).promise;
      coverImage = { data: canvas.toBuffer('image/png'), extension: '.png' };
    } catch (error) {
      // Rendering failure is non-fatal — page count alone is still useful.
      // Log so production workers show why a PDF imported without a cover.
      // console.warn is intentional — NestJS Logger is unavailable in worker threads.
      console.warn('[comic-pdf] first-page render failed:', error);
      coverImage = null;
    }

    return { pageCount: doc.numPages, coverImage };
  } finally {
    // Always destroy the loading task, also when loadingTask.promise rejects
    // (corrupt PDF) — otherwise pdfjs internal state leaks in the long-running
    // worker. In pdfjs v6 destroy() resolves cleanly even after a failed load
    // (verified against 6.0.227), but its source has a re-throw path; guard so
    // a cleanup failure can never mask the original error.
    await loadingTask.destroy().catch(() => undefined);
  }
}
