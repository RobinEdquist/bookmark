# Ebook PDF support

Bookmark imports PDFs from the configured **ebook** library as ebooks
(`format: pdf`) and from the **comics** library as comics. Prefer
non-overlapping library roots so the same path is not watched twice.

## Reader

- Progress is stored in the existing `cfi` column as `page:N` (1-based).
- The reader renders **one page at a time** via react-pdf; zoomed pages scroll
  inside the viewport. Fit-page / fit-width and direct page entry are in the
  PDF toolbar.
- Local PDF.js assets (worker, CMaps, standard fonts, WASM) live under
  `apps/web/public/` and are refreshed with `pnpm --filter web copy-pdfjs-assets`
  (also runs as part of `web` build). See `apps/web/public/pdfjs/VERSION`.

## Reader regression tests

The Playwright PDF suite opens a generated four-page PDF in the application
reader and verifies that zoomed page edges remain reachable, Escape cancels a
page edit, intentionally committed pages survive reopening, and corrupt PDFs
retain an error message and a working Close control. The fixture response is
served by Playwright; authentication and progress use the real backend.
This tests the browser reader, not backend file streaming or HTTP range proxying.

```bash
pnpm --filter web exec playwright install chromium firefox
E2E_API_URL=http://localhost:43120 E2E_WEB_URL=http://localhost:43121 pnpm --filter web exec playwright test e2e/ebook-pdf.spec.ts --project=chromium --project=firefox --project=mobile-chrome --workers=1
```

Docker is required for the suite's temporary PostgreSQL container. These nine
checks passed locally on macOS on 2026-09-23 and also run in the E2E CI job.

Embedded covers are converted to JPEG before caching and serving to match the
cache filename and OPDS MIME type. Previously cached PNG covers are repaired on
read. JPEG covers and uploaded covers keep their existing bytes.

## Large fixture (≥300 pages, ≥50 MB)

Generate a sparse performance fixture (not committed):

```bash
pnpm --filter backend exec node ./scripts/generate-large-pdf-fixture.mjs /tmp/bookmark-large-ebook.pdf
```

Place the file in an ebook library folder (or point a test library at `/tmp`)
and open it in the reader. Expected behaviour:

- Startup loads document metadata / first visible page only (not all 300 pages).
- Page next/prev and direct page entry stay responsive.
- Network panel shows HTTP range requests (`206`) for the stream URL when the
  browser requests byte ranges.
- Closing the reader tears down the pdf.js worker (no lingering worker in
  DevTools → Threads after navigation away).

### Observations log (fill when re-running)

| Date (Europe/Stockholm) | Browser / device                        | Startup to first paint                                                                                                                                      | Peak memory (approx.)                                      | Notes                                                                                                                                                                         |
| ----------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-22 22:50 CEST   | Node/pdfjs on Linux CI agent (headless) | Generator produced 300 pages / 50.1 MB in ~3s; `readComicPdf` returns pageCount+first-page cover only; `readComicPdfPage(150)` renders a single middle page | Fixture ~50 MB on disk; worker destroy() on each util call | Range streaming covered by ebooks.controller 206/416 unit tests + Next `/api` rewrite contract test. Safari/WebKit and large-file browser performance have not been measured. |

## Boundaries (out of scope)

OCR, PDF→EPUB conversion, forms/signatures editing, annotation authoring,
full-document search, outline navigation, password entry/storage, and PDF TTS
remain deferred — see GitHub issue #115.
