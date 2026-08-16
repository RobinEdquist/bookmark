import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUrlFilters } from "../use-url-filters";

const { mockReplace, mockSearch } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockSearch: vi.fn(() => ""),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: mockReplace,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/metadata",
  useSearchParams: () => new URLSearchParams(mockSearch()),
}));

// Must be module-level: the hook takes the defaults as a dependency.
const DEFAULTS = {
  missing: [] as string[],
  match: "any",
  page: 1,
};

describe("useUrlFilters", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockSearch.mockReturnValue("");
  });

  it("falls back to the defaults when the URL is empty", () => {
    const { result } = renderHook(() => useUrlFilters(DEFAULTS));

    expect(result.current[0]).toEqual({ missing: [], match: "any", page: 1 });
  });

  it("parses each value by the type of its default", () => {
    mockSearch.mockReturnValue("missing=description,narrator&match=all&page=3");

    const { result } = renderHook(() => useUrlFilters(DEFAULTS));

    expect(result.current[0]).toEqual({
      missing: ["description", "narrator"],
      match: "all",
      page: 3,
    });
  });

  it("ignores a number that is not a number", () => {
    mockSearch.mockReturnValue("page=nonsense");

    const { result } = renderHook(() => useUrlFilters(DEFAULTS));

    expect(result.current[0].page).toBe(1);
  });

  it("drops empty entries from a list", () => {
    mockSearch.mockReturnValue("missing=description,,");

    const { result } = renderHook(() => useUrlFilters(DEFAULTS));

    expect(result.current[0].missing).toEqual(["description"]);
  });

  it("writes a patch without disturbing the other params", () => {
    mockSearch.mockReturnValue("match=all&page=2");

    const { result } = renderHook(() => useUrlFilters(DEFAULTS));
    act(() => result.current[1]({ missing: ["genres"] }));

    const [url] = mockReplace.mock.calls[0]!;
    const params = new URLSearchParams(String(url).split("?")[1]);
    expect(params.get("missing")).toBe("genres");
    expect(params.get("match")).toBe("all");
    expect(params.get("page")).toBe("2");
  });

  it("removes values that are back to their default", () => {
    mockSearch.mockReturnValue("missing=genres&page=4");

    const { result } = renderHook(() => useUrlFilters(DEFAULTS));
    act(() => result.current[1]({ missing: [], page: 1 }));

    expect(mockReplace).toHaveBeenCalledWith("/metadata", { scroll: false });
  });

  it("does not scroll the page on a filter change", () => {
    // A filter change is not a new page; jumping to the top on every chip
    // click loses the reader's place in the table.
    const { result } = renderHook(() => useUrlFilters(DEFAULTS));
    act(() => result.current[1]({ match: "all" }));

    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining("?"),
      expect.objectContaining({ scroll: false }),
    );
  });

  it("leaves params it does not own alone", () => {
    // The tab lives in the same query string under `type`.
    mockSearch.mockReturnValue("type=ebook");

    const { result } = renderHook(() => useUrlFilters(DEFAULTS));
    act(() => result.current[1]({ page: 2 }));

    const [url] = mockReplace.mock.calls[0]!;
    expect(String(url)).toContain("type=ebook");
    expect(String(url)).toContain("page=2");
  });
});
