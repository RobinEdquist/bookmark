import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const publicDir = resolve(__dirname, "../../public");

describe("pdfjs public assets", () => {
  it("ships a worker and VERSION matching the copy script output", () => {
    const worker = resolve(publicDir, "pdf.worker.min.mjs");
    const versionPath = resolve(publicDir, "pdfjs/VERSION");
    expect(existsSync(worker)).toBe(true);
    expect(existsSync(versionPath)).toBe(true);
    const version = readFileSync(versionPath, "utf8").trim();
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("includes CMaps, standard fonts, and WASM directories", () => {
    for (const dir of ["cmaps", "standard_fonts", "wasm"]) {
      const full = resolve(publicDir, "pdfjs", dir);
      expect(existsSync(full)).toBe(true);
      expect(readdirSync(full).length).toBeGreaterThan(0);
    }
  });
});
