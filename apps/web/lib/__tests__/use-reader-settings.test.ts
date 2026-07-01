import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useReaderSettings,
  getInitialReaderSettings,
  DEFAULT_READER_SETTINGS,
} from "../use-reader-settings";

const STORAGE_KEY = "ebook-reader-settings";

describe("useReaderSettings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns defaults when nothing is stored", () => {
    const { result } = renderHook(() => useReaderSettings());
    expect(result.current.settings).toEqual(DEFAULT_READER_SETTINGS);
  });

  it("uses the fallback theme when nothing is stored", () => {
    const { result } = renderHook(() => useReaderSettings("dark"));
    expect(result.current.settings.theme).toBe("dark");
  });

  it("loads saved settings from localStorage", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...DEFAULT_READER_SETTINGS,
        fontSize: 120,
        theme: "sepia",
        flow: "scrolled",
      })
    );

    const { result } = renderHook(() => useReaderSettings());
    expect(result.current.settings.fontSize).toBe(120);
    expect(result.current.settings.theme).toBe("sepia");
    expect(result.current.settings.flow).toBe("scrolled");
  });

  it("persists updates to localStorage", () => {
    const { result } = renderHook(() => useReaderSettings());

    act(() => {
      result.current.update({ fontSize: 130, fontFamily: "sans" });
    });

    expect(result.current.settings.fontSize).toBe(130);
    expect(result.current.settings.fontFamily).toBe("sans");

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.fontSize).toBe(130);
    expect(stored.fontFamily).toBe("sans");
  });

  it("clamps out-of-range values", () => {
    const { result } = renderHook(() => useReaderSettings());

    act(() => {
      result.current.update({ fontSize: 900, lineHeight: 0.1, margin: 50 });
    });

    expect(result.current.settings.fontSize).toBe(160);
    expect(result.current.settings.lineHeight).toBe(1.2);
    expect(result.current.settings.margin).toBe(10);
  });

  it("falls back to defaults for corrupt stored JSON", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(getInitialReaderSettings()).toEqual(DEFAULT_READER_SETTINGS);
  });

  it("sanitizes invalid stored values", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ theme: "hotdog", fontSize: "big", flow: 42 })
    );
    expect(getInitialReaderSettings()).toEqual(DEFAULT_READER_SETTINGS);
  });
});
