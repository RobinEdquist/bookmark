import { describe, it, expect } from "vitest";
import { isCollectedEdition, isSpecialEdition } from "../comic-format";

describe("isCollectedEdition", () => {
  it("treats tpb, omnibus, compendium and graphic_novel as collected editions", () => {
    expect(isCollectedEdition("tpb")).toBe(true);
    expect(isCollectedEdition("omnibus")).toBe(true);
    expect(isCollectedEdition("compendium")).toBe(true);
    expect(isCollectedEdition("graphic_novel")).toBe(true);
  });

  it("treats single_issue, annual, one_shot, special, other as issues", () => {
    expect(isCollectedEdition("single_issue")).toBe(false);
    expect(isCollectedEdition("annual")).toBe(false);
    expect(isCollectedEdition("one_shot")).toBe(false);
    expect(isCollectedEdition("special")).toBe(false);
    expect(isCollectedEdition("other")).toBe(false);
  });
});

describe("isSpecialEdition", () => {
  it("treats annual, one_shot, special and other as side material", () => {
    expect(isSpecialEdition("annual")).toBe(true);
    expect(isSpecialEdition("one_shot")).toBe(true);
    expect(isSpecialEdition("special")).toBe(true);
    expect(isSpecialEdition("other")).toBe(true);
  });

  it("excludes the numbered run and collected editions", () => {
    expect(isSpecialEdition("single_issue")).toBe(false);
    expect(isSpecialEdition("tpb")).toBe(false);
    expect(isSpecialEdition("omnibus")).toBe(false);
    expect(isSpecialEdition("compendium")).toBe(false);
    expect(isSpecialEdition("graphic_novel")).toBe(false);
  });

  it("partitions every format into exactly one of the three buckets", () => {
    const formats = [
      "single_issue",
      "annual",
      "tpb",
      "omnibus",
      "compendium",
      "one_shot",
      "special",
      "graphic_novel",
      "other",
    ] as const;
    for (const f of formats) {
      const buckets = [
        f === "single_issue",
        isSpecialEdition(f),
        isCollectedEdition(f),
      ].filter(Boolean);
      expect(buckets).toHaveLength(1);
    }
  });
});
