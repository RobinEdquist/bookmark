import { nextJsConfig } from "@repo/eslint-config/next-js";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nextJsConfig,
  {
    // Vendored third-party source (see lib/foliate-js/VENDOR.md) and the
    // pdf.js worker bundle copied from pdfjs-dist
    ignores: ["lib/foliate-js/**", "public/pdf.worker.min.mjs"],
  },
];
