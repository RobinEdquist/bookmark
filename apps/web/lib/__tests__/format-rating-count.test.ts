import { describe, expect, it } from "vitest";
import { formatRatingCount } from "../format-rating-count";

describe("formatRatingCount", () => {
  it.each([
    [0, "0"],
    [900, "900"],
    [1500, "1,500"],
    [900000, "900,000"],
    [1234567, "1,234,567"],
  ])("formats %i as %s regardless of ambient locale", (count, expected) => {
    expect(formatRatingCount(count)).toBe(expected);
  });
});
