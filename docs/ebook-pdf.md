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

| Date (Europe/Stockholm) | Browser / device                        | Startup to first paint                                                                                                                                      | Peak memory (approx.)                                      | Notes                                                                                                                                                         |
| ----------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-22 22:50 CEST   | Node/pdfjs on Linux CI agent (headless) | Generator produced 300 pages / 50.1 MB in ~3s; `readComicPdf` returns pageCount+first-page cover only; `readComicPdfPage(150)` renders a single middle page | Fixture ~50 MB on disk; worker destroy() on each util call | Range streaming covered by ebooks.controller 206/416 unit tests + Next `/api` rewrite contract test. Safari/WebKit not in CI — run Playwright webkit locally. |

## Boundaries (out of scope)

OCR, PDF→EPUB conversion, forms/signatures editing, annotation authoring,
full-document search, outline navigation, password entry/storage, and PDF TTS
remain deferred — see GitHub issue #115.
