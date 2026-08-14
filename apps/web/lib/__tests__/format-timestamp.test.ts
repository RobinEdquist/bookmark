import { describe, expect, it } from "vitest";
import { formatTimestamp, parseTimestamp } from "../format-timestamp";

describe("formatTimestamp", () => {
  it("formats sub-minute values", () => {
    expect(formatTimestamp(0)).toBe("0:00");
    expect(formatTimestamp(45)).toBe("0:45");
  });

  it("formats minutes and seconds", () => {
    expect(formatTimestamp(754)).toBe("12:34");
    expect(formatTimestamp(60)).toBe("1:00");
  });

  it("formats hours with zero-padded minutes and seconds", () => {
    expect(formatTimestamp(4523)).toBe("1:15:23");
    expect(formatTimestamp(3600)).toBe("1:00:00");
    expect(formatTimestamp(3661)).toBe("1:01:01");
    expect(formatTimestamp(36661)).toBe("10:11:01");
  });

  it("floors fractional seconds", () => {
    expect(formatTimestamp(754.9)).toBe("12:34");
  });

  it("falls back to 0:00 for invalid input", () => {
    expect(formatTimestamp(NaN)).toBe("0:00");
    expect(formatTimestamp(Infinity)).toBe("0:00");
    expect(formatTimestamp(-Infinity)).toBe("0:00");
    expect(formatTimestamp(-5)).toBe("0:00");
  });
});

describe("parseTimestamp", () => {
  it("parses plain seconds", () => {
    expect(parseTimestamp("90")).toBe(90);
    expect(parseTimestamp("0")).toBe(0);
  });

  it("parses M:SS", () => {
    expect(parseTimestamp("12:34")).toBe(754);
    expect(parseTimestamp("0:45")).toBe(45);
    expect(parseTimestamp("1:5")).toBe(65);
  });

  it("parses H:MM:SS", () => {
    expect(parseTimestamp("1:15:23")).toBe(4523);
    expect(parseTimestamp("10:00:00")).toBe(36000);
  });

  it("round-trips formatTimestamp output", () => {
    for (const seconds of [0, 45, 754, 3600, 4523, 3661]) {
      expect(parseTimestamp(formatTimestamp(seconds))).toBe(seconds);
    }
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseTimestamp(" 12:34 ")).toBe(754);
  });

  it("rejects out-of-range segments", () => {
    expect(parseTimestamp("1:60")).toBeNull();
    expect(parseTimestamp("1:60:00")).toBeNull();
    expect(parseTimestamp("1:00:99")).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(parseTimestamp("")).toBeNull();
    expect(parseTimestamp("abc")).toBeNull();
    expect(parseTimestamp("1:2:3:4")).toBeNull();
    expect(parseTimestamp("-10")).toBeNull();
    expect(parseTimestamp("12:")).toBeNull();
    expect(parseTimestamp(":30")).toBeNull();
    expect(parseTimestamp("1.5")).toBeNull();
  });
});
