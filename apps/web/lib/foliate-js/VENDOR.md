# Vendored: foliate-js

- **Upstream:** https://github.com/johnfactotum/foliate-js
- **Commit:** `78914aef4466eb960965702401634c2cb348e9b1` (2026-05-01)
- **License:** MIT (see `LICENSE` in this directory)
- **Vendored:** 2026-07-01

foliate-js has no official npm release, so the source is vendored at a pinned
commit. It powers the in-browser ebook reader for EPUB, MOBI, AZW3, FB2 and
CBZ files. PDFs are rendered by `react-pdf` instead.

## Vendored files

Copied verbatim from upstream:

```
view.js  paginator.js  fixed-layout.js  overlayer.js  progress.js
epubcfi.js  text-walker.js  search.js  epub.js  mobi.js  fb2.js
comic-book.js  vendor/zip.js  vendor/fflate.js  LICENSE
```

## Local patches

Exactly two files differ from upstream — both replaced with throw-only stubs
so the bundler never resolves their transitive dependencies:

1. `pdf.js` — upstream imports `./vendor/pdfjs/` (not vendored); we render
   PDFs with react-pdf. `view.js` only imports this lazily when it sniffs a
   `%PDF` header, which our reader never feeds it.
2. `tts.js` — text-to-speech is unused; only loaded when `view.initTTS()` is
   called, which we never do.

## Re-vendoring

1. Download the desired commit tarball from upstream.
2. Copy the files listed above verbatim.
3. Re-apply the two stub patches.
4. Update the commit SHA and date in this file.
5. Note: saved reading positions for MOBI/AZW3 use CFIs synthesized by
   foliate-js; they are stable per vendored version but may shift across
   upstream changes (the reader falls back to `progressPercent`).

These files are excluded from ESLint (`apps/web/eslint.config.js`) and are
not type-checked (tsconfig only includes `**/*.ts(x)`); the typed surface the
app relies on is hand-written in `foliate-view.d.ts`.
