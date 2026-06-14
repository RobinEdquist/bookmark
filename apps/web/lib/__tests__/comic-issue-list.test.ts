import { describe, it, expect } from "vitest";
import { parseCollects, formatIssueList } from "../comic-issue-list";

// KEEP THIS TABLE IN SYNC with apps/backend/src/comics/__tests__/comic-issue-list.spec.ts
const VECTORS = [
  { input: "", present: [], presentInts: [], unrecognized: [] },
  { input: "12", present: [12], presentInts: [12], unrecognized: [] },
  { input: "#12", present: [12], presentInts: [12], unrecognized: [] },
  { input: "1-54", present: Array.from({ length: 54 }, (_, i) => i + 1), presentInts: Array.from({ length: 54 }, (_, i) => i + 1), unrecognized: [] },
  { input: "1-18, 26, 52, 132", present: [...Array.from({ length: 18 }, (_, i) => i + 1), 26, 52, 132], presentInts: [...Array.from({ length: 18 }, (_, i) => i + 1), 26, 52, 132], unrecognized: [] },
  { input: "#1 – 18, 26", present: [...Array.from({ length: 18 }, (_, i) => i + 1), 26], presentInts: [...Array.from({ length: 18 }, (_, i) => i + 1), 26], unrecognized: [] },
  { input: "1.5", present: [1.5], presentInts: [], unrecognized: [] },
  { input: "1, 1, 2", present: [1, 2], presentInts: [1, 2], unrecognized: [] },
  { input: "E^12", present: [], presentInts: [], unrecognized: ["E^12"] },
  { input: "5-2", present: [], presentInts: [], unrecognized: ["5-2"] },
  { input: "1-", present: [], presentInts: [], unrecognized: ["1-"] },
  { input: "1-10, abc", present: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], presentInts: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], unrecognized: ["abc"] },
  { input: "1-99999", present: [], presentInts: [], unrecognized: ["1-99999"] },
];

describe("parseCollects", () => {
  for (const v of VECTORS) {
    it(`parses ${JSON.stringify(v.input)}`, () => {
      const r = parseCollects(v.input);
      expect(r.present).toEqual(v.present);
      expect(r.presentInts).toEqual(v.presentInts);
      expect(r.unrecognized).toEqual(v.unrecognized);
    });
  }
});

describe("formatIssueList", () => {
  it("collapses consecutive integers into ranges", () => {
    expect(formatIssueList([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 26, 52])).toBe("#1–18, #26, #52");
  });
  it("returns empty string for no numbers", () => {
    expect(formatIssueList([])).toBe("");
  });
  it("ignores non-integers", () => {
    expect(formatIssueList([1, 1.5, 2])).toBe("#1–2");
  });
});
