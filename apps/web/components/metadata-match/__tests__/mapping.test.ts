import { describe, it, expect } from "vitest";
import {
  resolveAudibleReviewMetadata,
  mapAudibleSearchResult,
  mapAudnexusBook,
} from "../mapping";

describe("resolveAudibleReviewMetadata", () => {
  it("uses the selected Audible result while Audnexus detail is pending", () => {
    const fallback = {
      asin: "B0FXFHSXC7",
      title: "Fallback Title",
      authors: ["Fallback Author"],
      narrators: [],
    };

    expect(resolveAudibleReviewMetadata(undefined, fallback)).toEqual(
      mapAudibleSearchResult(fallback)
    );
  });

  it("prefers the full Audnexus detail when it exists", () => {
    const fallback = {
      asin: "B0FXFHSXC7",
      title: "Fallback Title",
      authors: ["Fallback Author"],
      narrators: [],
    };

    const detail = {
      asin: "B0FXFHSXC7",
      title: "Full Title",
      authors: ["Full Author"],
      narrators: ["Narrator"],
      genres: [],
      tags: [],
      series: [],
    };

    expect(resolveAudibleReviewMetadata(detail, fallback)).toEqual(
      mapAudnexusBook(detail)
    );
  });
});
