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
      const viewport = page.getViewport({ scale: 2 });
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
    } catch {
      // Rendering failure is non-fatal — page count alone is still useful
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
