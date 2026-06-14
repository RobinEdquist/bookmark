import { describe, it, expect } from "vitest";
import { isCollectedEdition } from "../comic-format";

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
