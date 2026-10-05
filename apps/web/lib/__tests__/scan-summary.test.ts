import { describe, expect, it } from "vitest";
import { scanSummaryParts, type LibraryScanResult } from "../scan-summary";

const empty: LibraryScanResult = {
  added: 0,
  missing: 0,
  restored: 0,
  deleted: 0,
  repaired: 0,
  errors: [],
};

describe("scanSummaryParts", () => {
  it("is empty when the scan changed nothing", () => {
    expect(scanSummaryParts(empty)).toEqual([]);
  });

  it("reports a scan that only marked folders missing", () => {
    expect(scanSummaryParts({ ...empty, missing: 3 })).toEqual([
      { key: "missing", count: 3 },
    ]);
  });

  it("lists every non-zero count in reading order, errors last", () => {
    expect(
      scanSummaryParts({
        added: 2,
        missing: 1,
        restored: 0,
        deleted: 4,
        repaired: 1,
        errors: [{ path: "/a", error: "boom" }],
      }),
    ).toEqual([
      { key: "added", count: 2 },
      { key: "repaired", count: 1 },
      { key: "missing", count: 1 },
      { key: "deleted", count: 4 },
      { key: "errors", count: 1 },
    ]);
  });
});
