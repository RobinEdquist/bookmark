import { describe, expect, it } from "vitest";

import {
  applyZoomToPageSize,
  clampPage,
  clampZoom,
  computeBasePageSize,
  parsePageInput,
  stepZoom,
  PDF_ZOOM_MAX,
  PDF_ZOOM_MIN,
  parsePdfLocator,
  resolveInitialPdfPage,
  formatPdfLocator,
  pdfProgressPercent,
} from "../pdf-reader-layout";

describe("clampPage", () => {
  it("clamps into 1..numPages", () => {
    expect(clampPage(0, 10)).toBe(1);
    expect(clampPage(-5, 10)).toBe(1);
    expect(clampPage(11, 10)).toBe(10);
    expect(clampPage(5.9, 10)).toBe(5);
  });

  it("treats empty books as a single page", () => {
    expect(clampPage(3, 0)).toBe(1);
  });
});

describe("clampZoom / stepZoom", () => {
  it("clamps and snaps to the zoom step", () => {
    expect(clampZoom(0.1)).toBe(PDF_ZOOM_MIN);
    expect(clampZoom(9)).toBe(PDF_ZOOM_MAX);
    expect(clampZoom(1.12)).toBe(1);
    expect(clampZoom(1.13)).toBe(1.25);
  });

  it("steps by 0.25", () => {
    expect(stepZoom(1, 1)).toBe(1.25);
    expect(stepZoom(1, -1)).toBe(0.75);
    expect(stepZoom(PDF_ZOOM_MIN, -1)).toBe(PDF_ZOOM_MIN);
    expect(stepZoom(PDF_ZOOM_MAX, 1)).toBe(PDF_ZOOM_MAX);
  });
});

describe("computeBasePageSize", () => {
  const container = { width: 800, height: 600 };

  it("fit-width always uses container width", () => {
    expect(computeBasePageSize("width", container, 0.5)).toEqual({
      width: 800,
    });
  });

  it("fit-page contains a portrait page by height", () => {
    // aspect 0.5 → taller than container (800/600≈1.33)
    expect(computeBasePageSize("page", container, 0.5)).toEqual({
      height: 600,
    });
  });

  it("fit-page contains a landscape page by width", () => {
    expect(computeBasePageSize("page", container, 2)).toEqual({ width: 800 });
  });
});

describe("applyZoomToPageSize", () => {
  it("scales width or height by zoom", () => {
    expect(applyZoomToPageSize({ width: 400 }, 2)).toEqual({ width: 800 });
    expect(applyZoomToPageSize({ height: 300 }, 0.5)).toEqual({ height: 150 });
  });
});

describe("parsePageInput", () => {
  it("parses and clamps page numbers", () => {
    expect(parsePageInput("3", 10)).toBe(3);
    expect(parsePageInput(" 99 ", 10)).toBe(10);
    expect(parsePageInput("", 10)).toBeNull();
    expect(parsePageInput("abc", 10)).toBeNull();
  });
});

describe("parsePdfLocator", () => {
  it("reads page:N locators", () => {
    expect(parsePdfLocator("page:4")).toBe(4);
    expect(parsePdfLocator("page:0")).toBeNull();
    expect(parsePdfLocator("epubcfi(/6/2)")).toBeNull();
    expect(parsePdfLocator(null)).toBeNull();
  });
});

describe("resolveInitialPdfPage / formatPdfLocator / pdfProgressPercent", () => {
  it("falls back to page 1 for null, invalid, or out-of-range locators", () => {
    expect(resolveInitialPdfPage(null, 10)).toBe(1);
    expect(resolveInitialPdfPage("epubcfi(/6/2)", 10)).toBe(1);
    expect(resolveInitialPdfPage("page:0", 10)).toBe(1);
    expect(resolveInitialPdfPage("page:99", 10)).toBe(10);
    expect(resolveInitialPdfPage("page:1", 1)).toBe(1);
    expect(resolveInitialPdfPage("page:5", 1)).toBe(1);
  });

  it("formats locators and percent for first/last/single-page books", () => {
    expect(formatPdfLocator(3)).toBe("page:3");
    expect(pdfProgressPercent(1, 1)).toBe(100);
    expect(pdfProgressPercent(1, 4)).toBe(25);
    expect(pdfProgressPercent(4, 4)).toBe(100);
  });
});
