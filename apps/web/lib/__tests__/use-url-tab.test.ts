import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUrlTab } from "../use-url-tab";

const { mockReplace, mockGet } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockGet: vi.fn(),
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
  usePathname: () => "/library",
  useSearchParams: () => {
    const params = new URLSearchParams();
    const getResult = mockGet();
    if (getResult) {
      for (const [key, value] of Object.entries(getResult)) {
        params.set(key, value as string);
      }
    }
    return params;
  },
}));

describe("useUrlTab", () => {
  beforeEach(() => {
    mockReplace.mockClear();
    mockGet.mockReturnValue(null);
  });

  it("returns default value when param is not in URL", () => {
    const { result } = renderHook(() =>
      useUrlTab("tab", "all", ["all", "completed", "in-progress"] as const)
    );
    expect(result.current[0]).toBe("all");
  });

  it("reads value from URL search params", () => {
    mockGet.mockReturnValue({ tab: "completed" });

    const { result } = renderHook(() =>
      useUrlTab("tab", "all", ["all", "completed", "in-progress"] as const)
    );
    expect(result.current[0]).toBe("completed");
  });

  it("returns default for invalid URL values", () => {
    mockGet.mockReturnValue({ tab: "invalid" });

    const { result } = renderHook(() =>
      useUrlTab("tab", "all", ["all", "completed", "in-progress"] as const)
    );
    expect(result.current[0]).toBe("all");
  });

  it("calls router.replace when value changes", () => {
    const { result } = renderHook(() =>
      useUrlTab("tab", "all", ["all", "completed"] as const)
    );

    act(() => {
      result.current[1]("completed");
    });

    expect(mockReplace).toHaveBeenCalledWith("/library?tab=completed");
  });

  it("removes param from URL when setting default value", () => {
    mockGet.mockReturnValue({ tab: "completed" });

    const { result } = renderHook(() =>
      useUrlTab("tab", "all", ["all", "completed"] as const)
    );

    act(() => {
      result.current[1]("all");
    });

    expect(mockReplace).toHaveBeenCalledWith("/library");
  });

  it("works without validValues (accepts any string)", () => {
    mockGet.mockReturnValue({ status: "custom-value" });

    const { result } = renderHook(() => useUrlTab("status", "default"));
    expect(result.current[0]).toBe("custom-value");
  });
});
