import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSortPreference } from "../use-sort-preference";

describe("useSortPreference", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns default sort (createdAt desc) initially", () => {
    const { result } = renderHook(() => useSortPreference("audiobooks"));
    expect(result.current.sortBy).toBe("createdAt");
    expect(result.current.sortOrder).toBe("desc");
  });

  it("loads saved preference from localStorage", () => {
    localStorage.setItem(
      "bookmark-audiobooks-sort",
      JSON.stringify({ sortBy: "title", sortOrder: "asc" })
    );

    const { result } = renderHook(() => useSortPreference("audiobooks"));

    // After the useEffect runs
    expect(result.current.sortBy).toBe("title");
    expect(result.current.sortOrder).toBe("asc");
  });

  it("uses different storage keys for audiobooks and ebooks", () => {
    localStorage.setItem(
      "bookmark-audiobooks-sort",
      JSON.stringify({ sortBy: "title", sortOrder: "asc" })
    );
    localStorage.setItem(
      "bookmark-ebooks-sort",
      JSON.stringify({ sortBy: "author", sortOrder: "desc" })
    );

    const { result: audiobooksResult } = renderHook(() =>
      useSortPreference("audiobooks")
    );
    const { result: ebooksResult } = renderHook(() =>
      useSortPreference("ebooks")
    );

    expect(audiobooksResult.current.sortBy).toBe("title");
    expect(ebooksResult.current.sortBy).toBe("author");
  });

  it("toggles sort order when same field is selected", () => {
    const { result } = renderHook(() => useSortPreference("audiobooks"));

    // Default is createdAt desc
    act(() => {
      result.current.setSortField("createdAt");
    });

    expect(result.current.sortOrder).toBe("asc"); // toggled from desc
  });

  it("uses default direction when switching to a new field", () => {
    const { result } = renderHook(() => useSortPreference("audiobooks"));

    act(() => {
      result.current.setSortField("title");
    });

    expect(result.current.sortBy).toBe("title");
    expect(result.current.sortOrder).toBe("asc"); // default for title
  });

  it("uses desc as default for rating field", () => {
    const { result } = renderHook(() => useSortPreference("audiobooks"));

    act(() => {
      result.current.setSortField("rating");
    });

    expect(result.current.sortBy).toBe("rating");
    expect(result.current.sortOrder).toBe("desc");
  });

  it("persists changes to localStorage", () => {
    const { result } = renderHook(() => useSortPreference("audiobooks"));

    act(() => {
      result.current.setSortField("author");
    });

    const stored = JSON.parse(
      localStorage.getItem("bookmark-audiobooks-sort") || "{}"
    );
    expect(stored.sortBy).toBe("author");
    expect(stored.sortOrder).toBe("asc");
  });

  it("ignores invalid JSON in localStorage", () => {
    localStorage.setItem("bookmark-audiobooks-sort", "not-json");

    const { result } = renderHook(() => useSortPreference("audiobooks"));
    expect(result.current.sortBy).toBe("createdAt");
  });

  it("ignores invalid sortBy values in localStorage", () => {
    localStorage.setItem(
      "bookmark-audiobooks-sort",
      JSON.stringify({ sortBy: "invalid", sortOrder: "asc" })
    );

    const { result } = renderHook(() => useSortPreference("audiobooks"));
    expect(result.current.sortBy).toBe("createdAt");
  });

  it("sets isLoaded to true after mounting", () => {
    const { result } = renderHook(() => useSortPreference("audiobooks"));
    expect(result.current.isLoaded).toBe(true);
  });
});
