// apps/backend/src/library-watcher/utils/comic-pdf.utils.ts
import * as fs from 'fs/promises';
import { createCanvas } from '@napi-rs/canvas';

const MAX_RENDER_DIMENSION = 4096;

type PdfjsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

/**
 * Load the ESM-only pdfjs-dist v6 bundle from this CommonJS-compiled module.
 *
 * In production (`nest build`, tsconfig module:nodenext) the `import()` below is
 * emitted verbatim as a native dynamic import and is the only path taken.
 *
 * Jest evaluates this file inside a vm context whose dynamic import() throws
 * `TypeError: A dynamic import callback was invoked without
 * --experimental-vm-modules` unless node was started with that flag. Only the
 * `test*` package scripts set it, so `npx jest`, `pnpm exec jest` and IDE test
 * runners hit that error. The fallback loads pdf.mjs through node's real module
 * system instead: process.getBuiltinModule() returns the genuine `module`
 * builtin — unlike `require('module')`, Jest cannot intercept it — and node's
 * require(esm) support then loads the bundle directly, bypassing the vm
 * context. pdf.mjs has no top-level await, so a sync load is safe.
 *
 * If the fallback cannot help either, the original error is rethrown so a
 * genuine load failure is never masked by a confusing secondary one.
 */
async function loadPdfjs(): Promise<PdfjsModule> {
  try {
    return await import('pdfjs-dist/legacy/build/pdf.mjs');
  } catch (error) {
    try {
      const { createRequire } = process.getBuiltinModule('module');
      return createRequire(__filename)(
        'pdfjs-dist/legacy/build/pdf.mjs',
      ) as PdfjsModule;
    } catch {
      throw error;
    }
  }
}

type PdfLoadingTask = ReturnType<PdfjsModule['getDocument']>;
type PdfDocument = Awaited<PdfLoadingTask['promise']>;
type PdfDocumentParams = Parameters<PdfjsModule['getDocument']>[0];

/**
 * Shared getDocument parameters for reading a comic PDF.
 *
 * `verbosity` matters: at its default (WARNINGS) pdfjs writes recovery chatter
 * straight to the console — most visibly `Warning: Indexing all PDF objects`,
 * emitted for any PDF whose xref table is damaged. It is not actionable, since
 * pdfjs recovers and the file still imports, but it floods both the import log
 * and the test output (the spec's deliberately corrupt fixtures trigger it).
 * ERRORS silences that without hiding real failures: those reject
 * `loadingTask.promise` and are reported by loadDocument below. Raise this back
 * to `VerbosityLevel.WARNINGS` when debugging a PDF that imports incorrectly.
 */
function documentParams(pdfjs: PdfjsModule, buf: Buffer): PdfDocumentParams {
  return {
    data: new Uint8Array(buf),
    useSystemFonts: true,
    disableFontFace: true,
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  };
}

/** Read `message` off an unknown throwable without relying on `instanceof`. */
function describeError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

/**
 * Await a loading task, normalising a load failure into an Error created here.
 *
 * pdfjs throws its own exception classes (InvalidPDFException, …). Those are
 * `Error` subclasses, but only within the realm pdfjs was loaded into — via the
 * loadPdfjs fallback that is node's realm, not this module's. Cross-realm,
 * `error instanceof Error` is false, which silently degrades
 * comic-metadata.worker.ts (it falls back to `String(error)` for the quarantine
 * message) and defeats Jest's toThrow(). Re-throwing a local Error keeps the
 * diagnosis in `cause` and gives callers one stable type in every environment.
 */
async function loadDocument(loadingTask: PdfLoadingTask): Promise<PdfDocument> {
  try {
    return await loadingTask.promise;
  } catch (error) {
    throw new Error(`Unreadable PDF: ${describeError(error)}`, {
      cause: error,
    });
  }
}

export interface ComicPdfContents {
  pageCount: number;
  coverImage: { data: Buffer; extension: string } | null;
}

/**
 * Read a PDF comic: page count + first page rendered to PNG.
 * Throws on unreadable PDFs (callers quarantine).
 */
export async function readComicPdf(
  filePath: string,
): Promise<ComicPdfContents> {
  const pdfjs = await loadPdfjs();

  const buf = await fs.readFile(filePath);
  // Keep the loading task so we can call destroy() on it after use.
  // PDFDocumentProxy (the .promise result) has cleanup() but not destroy();
  // destroy() lives on PDFDocumentLoadingTask.
  const loadingTask = pdfjs.getDocument(documentParams(pdfjs, buf));

  try {
    const doc = await loadDocument(loadingTask);

    let coverImage: { data: Buffer; extension: string } | null = null;
    try {
      const page = await doc.getPage(1);
      // Cap canvas size to avoid allocating enormous buffers for large scanned pages.
      // Normal cover pages (e.g. 612×792 pt) scale to 2× comfortably; a 4096-px
      // ceiling kicks in only for giant scans (e.g. 3000-pt width → ~1.37× scale).
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

export interface ExtractedPdfPage {
  data: Buffer;
  extension: string;
}

/**
 * Render a single PDF page (zero-based index) to a PNG buffer.
 * Returns null if the index is out of range or the page fails to render.
 */
export async function readComicPdfPage(
  filePath: string,
  pageIndex: number,
): Promise<ExtractedPdfPage | null> {
  const pdfjs = await loadPdfjs();
  const buf = await fs.readFile(filePath);
  const loadingTask = pdfjs.getDocument(documentParams(pdfjs, buf));
  try {
    const doc = await loadingTask.promise;
    if (pageIndex < 0 || pageIndex >= doc.numPages) return null;

    const page = await doc.getPage(pageIndex + 1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(
      2,
      MAX_RENDER_DIMENSION / Math.max(baseViewport.width, baseViewport.height),
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
    return { data: canvas.toBuffer('image/png'), extension: '.png' };
  } catch (error) {
    console.warn('[comic-pdf] page render failed:', error);
    return null;
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
}
