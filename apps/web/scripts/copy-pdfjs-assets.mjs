#!/usr/bin/env node
/**
 * Copy the pdfjs-dist worker + CMaps / standard fonts / WASM that react-pdf's
 * pinned pdfjs-dist version expects into apps/web/public so production builds
 * (including Next standalone) serve matching assets locally.
 *
 * Run from apps/web (pnpm copy-pdfjs-assets) or via prebuild/build.
 */
import { cpSync, mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const webRoot = join(__dirname, "..");
const require = createRequire(join(webRoot, "package.json"));

// pdfjs-dist is a transitive dep of react-pdf; resolve through react-pdf so
// pnpm's strict isolation still finds it.
const reactPdfPkg = require.resolve("react-pdf/package.json");
const requireFromReactPdf = createRequire(reactPdfPkg);
const pdfjsPkgPath = requireFromReactPdf.resolve("pdfjs-dist/package.json");
const pdfjsRoot = dirname(pdfjsPkgPath);
const pdfjsVersion = JSON.parse(readFileSync(pdfjsPkgPath, "utf8")).version;

const publicDir = join(webRoot, "public");
const pdfjsPublic = join(publicDir, "pdfjs");

mkdirSync(pdfjsPublic, { recursive: true });

const workerSrc = join(pdfjsRoot, "build", "pdf.worker.min.mjs");
if (!existsSync(workerSrc)) {
  throw new Error(`pdf.worker.min.mjs not found at ${workerSrc}`);
}
cpSync(workerSrc, join(publicDir, "pdf.worker.min.mjs"));

for (const dir of ["cmaps", "standard_fonts", "wasm"]) {
  const src = join(pdfjsRoot, dir);
  if (!existsSync(src)) {
    throw new Error(`Missing pdfjs-dist asset directory: ${src}`);
  }
  cpSync(src, join(pdfjsPublic, dir), { recursive: true });
}

writeFileSync(join(pdfjsPublic, "VERSION"), `${pdfjsVersion}\n`, "utf8");

console.log(
  `Copied pdfjs-dist@${pdfjsVersion} worker + cmaps/standard_fonts/wasm → public/`,
);
