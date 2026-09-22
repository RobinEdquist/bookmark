#!/usr/bin/env node
/**
 * Generate a sparse large PDF fixture for ebook PDF performance checks (#115).
 *
 * Target: >=300 pages AND >=50 MB. Uses 300 normal pages plus an embedded
 * incompressible binary attachment so the file is large while pdf.js can still
 * range-load and render only the visible page.
 *
 * Usage (from apps/backend):
 *   node ./scripts/generate-large-pdf-fixture.mjs [outPath]
 *
 * Default: /tmp/bookmark-large-ebook.pdf (not committed to git).
 */
import { writeFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { randomFillSync } from "node:crypto";

const require = createRequire(fileURLToPath(import.meta.url));
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const DEFAULT_OUT = "/tmp/bookmark-large-ebook.pdf";
const MIN_PAGES = 300;
const MIN_BYTES = 50 * 1024 * 1024;

async function main() {
  const outPath = resolve(process.argv[2] ?? DEFAULT_OUT);
  mkdirSync(dirname(outPath), { recursive: true });

  const doc = await PDFDocument.create();
  doc.setTitle("Bookmark large PDF fixture");
  doc.setAuthor("Bookmark test harness");
  const font = await doc.embedFont(StandardFonts.Helvetica);

  process.stderr.write(`Adding ${MIN_PAGES} pages...\n`);
  for (let i = 0; i < MIN_PAGES; i++) {
    const page = doc.addPage([612, 792]);
    page.drawText(
      `Bookmark large PDF fixture — page ${i + 1} of ${MIN_PAGES}`,
      {
        x: 48,
        y: 720,
        size: 14,
        font,
        color: rgb(0.1, 0.1, 0.1),
      },
    );
    page.drawRectangle({
      x: 48,
      y: 200,
      width: 516,
      height: 400,
      borderColor: rgb(0.6, 0.6, 0.6),
      borderWidth: 1,
    });
  }

  // Constant pads Flate-compress away; use cryptographic random bytes.
  const padSize = MIN_BYTES;
  process.stderr.write(
    `Attaching ${(padSize / (1024 * 1024)).toFixed(0)} MB random pad...\n`,
  );
  const pad = Buffer.allocUnsafe(padSize);
  randomFillSync(pad);
  await doc.attach(pad, "padding.bin", {
    mimeType: "application/octet-stream",
    description: "Size pad for range-loading / memory tests",
  });

  process.stderr.write("Saving PDF...\n");
  const bytes = await doc.save();
  writeFileSync(outPath, bytes);
  const size = statSync(outPath).size;
  const result = {
    path: outPath,
    pages: doc.getPageCount(),
    bytes: size,
    megabytes: Number((size / (1024 * 1024)).toFixed(2)),
    meetsMinPages: doc.getPageCount() >= MIN_PAGES,
    meetsMinBytes: size >= MIN_BYTES,
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.meetsMinPages || !result.meetsMinBytes) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
