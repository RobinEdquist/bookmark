import { describe, it, expect } from "vitest";
import {
  formatDurationLong,
  formatDurationShort,
  formatDurationHours,
} from "../format-duration";

describe("formatDurationLong", () => {
  it("formats seconds", () => {
    expect(formatDurationLong(30)).toBe("30 seconds");
  });

  it("formats 1 second", () => {
    expect(formatDurationLong(1)).toBe("1 seconds");
  });

  it("formats 59 seconds", () => {
    expect(formatDurationLong(59)).toBe("59 seconds");
  });

  it("formats exact minutes", () => {
    expect(formatDurationLong(60)).toBe("1 minute");
    expect(formatDurationLong(120)).toBe("2 minutes");
  });

  it("formats minutes (no hours)", () => {
    expect(formatDurationLong(2700)).toBe("45 minutes");
  });

  it("formats exact hours", () => {
    expect(formatDurationLong(3600)).toBe("1 hour");
    expect(formatDurationLong(7200)).toBe("2 hours");
  });

  it("formats hours and minutes", () => {
    expect(formatDurationLong(19800)).toBe("5 hours 30 minutes");
  });

  it("formats 1 hour 1 minute", () => {
    expect(formatDurationLong(3660)).toBe("1 hour 1 minute");
  });

  it("formats exact days", () => {
    expect(formatDurationLong(86400)).toBe("1 day");
    expect(formatDurationLong(172800)).toBe("2 days");
  });

  it("formats days and hours", () => {
    expect(formatDurationLong(216000)).toBe("2 days 12 hours");
  });

  it("formats large durations", () => {
    expect(formatDurationLong(1234567)).toBe("14 days 6 hours");
  });

  it("formats 1 day 1 hour", () => {
    expect(formatDurationLong(90000)).toBe("1 day 1 hour");
  });

  it("handles zero", () => {
    expect(formatDurationLong(0)).toBe("0 seconds");
  });
});

describe("formatDurationShort", () => {
  it("returns dash for null", () => {
    expect(formatDurationShort(null)).toBe("—");
  });

  it("returns dash for zero", () => {
    expect(formatDurationShort(0)).toBe("—");
  });

  it("formats minutes only", () => {
    expect(formatDurationShort(1800)).toBe("30m");
  });

  it("formats hours only", () => {
    expect(formatDurationShort(3600)).toBe("1h");
  });

  it("formats hours and minutes", () => {
    expect(formatDurationShort(19800)).toBe("5h 30m");
  });

  it("formats large hours", () => {
    expect(formatDurationShort(511200)).toBe("142h");
  });

  it("formats small seconds as 0m", () => {
    expect(formatDurationShort(30)).toBe("0m");
  });
});

describe("formatDurationHours", () => {
  it("formats to hours", () => {
    expect(formatDurationHours(511200)).toBe("142 hours");
  });

  it("rounds to nearest hour", () => {
    expect(formatDurationHours(5400)).toBe("2 hours");
  });

  it("formats 1 hour singular", () => {
    expect(formatDurationHours(3600)).toBe("1 hour");
  });

  it("formats 0 hours", () => {
    expect(formatDurationHours(0)).toBe("0 hours");
  });

  it("rounds down when appropriate", () => {
    expect(formatDurationHours(1800)).toBe("1 hour");
  });
});
