import { describe, it, expect } from "vitest";
import { formatSeriesOrder } from "../format-series";

describe("formatSeriesOrder", () => {
  it("removes trailing .0 from integer-like strings", () => {
    expect(formatSeriesOrder("1.0")).toBe("1");
  });

  it("preserves fractional values", () => {
    expect(formatSeriesOrder("1.5")).toBe("1.5");
  });

  it("removes trailing .0 from larger numbers", () => {
    expect(formatSeriesOrder("10.0")).toBe("10");
  });

  it("preserves multi-decimal values", () => {
    expect(formatSeriesOrder("2.25")).toBe("2.25");
  });

  it("handles plain integer strings", () => {
    expect(formatSeriesOrder("5")).toBe("5");
  });

  it("returns original string for non-numeric input", () => {
    expect(formatSeriesOrder("Prologue")).toBe("Prologue");
  });

  it("returns original string for empty string", () => {
    expect(formatSeriesOrder("")).toBe("");
  });

  it("handles negative numbers", () => {
    expect(formatSeriesOrder("-1.0")).toBe("-1");
  });
});
