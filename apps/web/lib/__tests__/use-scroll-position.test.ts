import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  useSaveScrollPosition,
  useRestoreScrollPosition,
  clearScrollState,
} from "../use-scroll-position";

// Suppress debug logging from the hook
vi.spyOn(console, "log").mockImplementation(() => {});

describe("useSaveScrollPosition", () => {
  let scrollContainer: HTMLElement;
  let sessionStorageMock: Record<string, string>;

  beforeEach(() => {
    vi.useFakeTimers();

    // Create a mock scroll container that matches the selector "main.overflow-auto"
    scrollContainer = document.createElement("main");
    scrollContainer.classList.add("overflow-auto");
    document.body.appendChild(scrollContainer);

    // Mock sessionStorage
    sessionStorageMock = {};
    vi.stubGlobal("sessionStorage", {
      getItem: vi.fn((key: string) => sessionStorageMock[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        sessionStorageMock[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete sessionStorageMock[key];
      }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    // Remove scroll container from DOM
    if (scrollContainer.parentNode) {
      scrollContainer.parentNode.removeChild(scrollContainer);
    }
  });

  it("attaches a scroll listener to the main container", () => {
    const addEventSpy = vi.spyOn(scrollContainer, "addEventListener");

    renderHook(() =>
      useSaveScrollPosition("/audiobooks", "sort=title", 1)
    );

    expect(addEventSpy).toHaveBeenCalledWith(
      "scroll",
      expect.any(Function),
      { passive: true }
    );
  });

  it("removes scroll listener on unmount", () => {
    const removeEventSpy = vi.spyOn(scrollContainer, "removeEventListener");

    const { unmount } = renderHook(() =>
      useSaveScrollPosition("/audiobooks", "sort=title", 1)
    );

    unmount();

    expect(removeEventSpy).toHaveBeenCalledWith(
      "scroll",
      expect.any(Function)
    );
  });

  it("saves scroll position to sessionStorage after debounce", () => {
    renderHook(() =>
      useSaveScrollPosition("/audiobooks", "sort=title", 2)
    );

    // Simulate scrolling by setting scrollTop and dispatching event
    Object.defineProperty(scrollContainer, "scrollTop", {
      value: 500,
      writable: true,
      configurable: true,
    });
    scrollContainer.dispatchEvent(new Event("scroll"));

    // Should not have saved yet (debounce is 150ms)
    expect(sessionStorage.setItem).not.toHaveBeenCalled();

    // Advance past debounce
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(sessionStorage.setItem).toHaveBeenCalledWith(
      "scroll-position-/audiobooks",
      JSON.stringify({
        position: 500,
        searchParamsKey: "sort=title",
        pagesLoaded: 2,
      })
    );
  });

  it("clears saved state when scrolled to top", () => {
    renderHook(() =>
      useSaveScrollPosition("/audiobooks", "sort=title", 1)
    );

    Object.defineProperty(scrollContainer, "scrollTop", {
      value: 0,
      writable: true,
      configurable: true,
    });
    scrollContainer.dispatchEvent(new Event("scroll"));

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(sessionStorage.removeItem).toHaveBeenCalledWith(
      "scroll-position-/audiobooks"
    );
  });

  it("uses different storage keys for different library paths", () => {
    renderHook(() =>
      useSaveScrollPosition("/audiobooks", "sort=title", 1)
    );

    const { unmount } = renderHook(() =>
      useSaveScrollPosition("/ebooks", "sort=title", 1)
    );

    Object.defineProperty(scrollContainer, "scrollTop", {
      value: 300,
      writable: true,
      configurable: true,
    });
    scrollContainer.dispatchEvent(new Event("scroll"));

    act(() => {
      vi.advanceTimersByTime(150);
    });

    // Both hooks listen to the same container's scroll events
    // Check that setItem was called with both paths
    const calls = (sessionStorage.setItem as ReturnType<typeof vi.fn>).mock
      .calls;
    const keys = calls.map((c: string[]) => c[0]);
    expect(keys).toContain("scroll-position-/audiobooks");
    expect(keys).toContain("scroll-position-/ebooks");

    unmount();
  });

  it("saves on visibility change to hidden", () => {
    renderHook(() =>
      useSaveScrollPosition("/audiobooks", "sort=title", 1)
    );

    Object.defineProperty(scrollContainer, "scrollTop", {
      value: 200,
      writable: true,
      configurable: true,
    });

    // Simulate page becoming hidden
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      writable: true,
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(sessionStorage.setItem).toHaveBeenCalledWith(
      "scroll-position-/audiobooks",
      expect.stringContaining('"position":200')
    );
  });

  it("updates refs when searchParamsKey or pagesLoaded change", () => {
    const { rerender } = renderHook(
      (props) =>
        useSaveScrollPosition(
          "/audiobooks",
          props.searchParamsKey,
          props.pagesLoaded
        ),
      { initialProps: { searchParamsKey: "sort=title", pagesLoaded: 1 } }
    );

    rerender({ searchParamsKey: "sort=author", pagesLoaded: 3 });

    Object.defineProperty(scrollContainer, "scrollTop", {
      value: 100,
      writable: true,
      configurable: true,
    });
    scrollContainer.dispatchEvent(new Event("scroll"));

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(sessionStorage.setItem).toHaveBeenCalledWith(
      "scroll-position-/audiobooks",
      JSON.stringify({
        position: 100,
        searchParamsKey: "sort=author",
        pagesLoaded: 3,
      })
    );
  });
});

describe("useRestoreScrollPosition", () => {
  let scrollContainer: HTMLElement;
  let sessionStorageMock: Record<string, string>;
  let rafCallbacks: FrameRequestCallback[];

  beforeEach(() => {
    vi.useFakeTimers();

    scrollContainer = document.createElement("main");
    scrollContainer.classList.add("overflow-auto");
    document.body.appendChild(scrollContainer);

    // Make scrollTop writable
    let _scrollTop = 0;
    Object.defineProperty(scrollContainer, "scrollTop", {
      get: () => _scrollTop,
      set: (v: number) => {
        _scrollTop = v;
      },
      configurable: true,
    });

    sessionStorageMock = {};
    vi.stubGlobal("sessionStorage", {
      getItem: vi.fn((key: string) => sessionStorageMock[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        sessionStorageMock[key] = value;
      }),
      removeItem: vi.fn((key: string) => {
        delete sessionStorageMock[key];
      }),
    });

    // Mock requestAnimationFrame to collect callbacks
    rafCallbacks = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    if (scrollContainer.parentNode) {
      scrollContainer.parentNode.removeChild(scrollContainer);
    }
  });

  function flushRAF() {
    // Flush all pending rAF callbacks (the hook uses double rAF)
    while (rafCallbacks.length > 0) {
      const cb = rafCallbacks.shift()!;
      cb(0);
    }
  }

  it("returns isRestoring: false when no saved state exists", () => {
    const { result } = renderHook(() =>
      useRestoreScrollPosition(
        "/audiobooks",
        "sort=title",
        1,
        false,
        false,
        vi.fn(),
        true
      )
    );

    expect(result.current.isRestoring).toBe(false);
  });

  it("restores scroll position from sessionStorage", () => {
    sessionStorageMock["scroll-position-/audiobooks"] = JSON.stringify({
      position: 500,
      searchParamsKey: "sort=title",
      pagesLoaded: 1,
    });

    const { result } = renderHook(() =>
      useRestoreScrollPosition(
        "/audiobooks",
        "sort=title",
        1,
        false,
        false,
        vi.fn(),
        true
      )
    );

    // Flush the double rAF
    act(() => {
      flushRAF();
    });

    expect(scrollContainer.scrollTop).toBe(500);
    expect(result.current.isRestoring).toBe(false);
  });

  it("sets isRestoring to true while restoring", () => {
    sessionStorageMock["scroll-position-/audiobooks"] = JSON.stringify({
      position: 500,
      searchParamsKey: "sort=title",
      pagesLoaded: 1,
    });

    const { result } = renderHook(() =>
      useRestoreScrollPosition(
        "/audiobooks",
        "sort=title",
        1,
        false,
        false,
        vi.fn(),
        true
      )
    );

    // Before rAF fires, should be restoring
    expect(result.current.isRestoring).toBe(true);

    act(() => {
      flushRAF();
    });

    expect(result.current.isRestoring).toBe(false);
  });

  it("does not restore when searchParamsKey has changed", () => {
    sessionStorageMock["scroll-position-/audiobooks"] = JSON.stringify({
      position: 500,
      searchParamsKey: "sort=title",
      pagesLoaded: 1,
    });

    renderHook(() =>
      useRestoreScrollPosition(
        "/audiobooks",
        "sort=author", // Different from saved
        1,
        false,
        false,
        vi.fn(),
        true
      )
    );

    act(() => {
      flushRAF();
    });

    expect(scrollContainer.scrollTop).toBe(0);
    // Should have cleared the stale state
    expect(sessionStorage.removeItem).toHaveBeenCalledWith(
      "scroll-position-/audiobooks"
    );
  });

  it("does not restore when saved position is 0", () => {
    sessionStorageMock["scroll-position-/audiobooks"] = JSON.stringify({
      position: 0,
      searchParamsKey: "sort=title",
      pagesLoaded: 1,
    });

    const { result } = renderHook(() =>
      useRestoreScrollPosition(
        "/audiobooks",
        "sort=title",
        1,
        false,
        false,
        vi.fn(),
        true
      )
    );

    expect(result.current.isRestoring).toBe(false);
    expect(scrollContainer.scrollTop).toBe(0);
  });

  it("fetches more pages before restoring if needed", () => {
    sessionStorageMock["scroll-position-/audiobooks"] = JSON.stringify({
      position: 1000,
      searchParamsKey: "sort=title",
      pagesLoaded: 3,
    });

    const fetchNextPage = vi.fn();

    renderHook(() =>
      useRestoreScrollPosition(
        "/audiobooks",
        "sort=title",
        1, // Only 1 page loaded, need 3
        false,
        false,
        fetchNextPage,
        true
      )
    );

    expect(fetchNextPage).toHaveBeenCalled();
    // Should not have scrolled yet
    expect(scrollContainer.scrollTop).toBe(0);
  });

  it("waits for loading to complete before restoring", () => {
    sessionStorageMock["scroll-position-/audiobooks"] = JSON.stringify({
      position: 500,
      searchParamsKey: "sort=title",
      pagesLoaded: 1,
    });

    const { rerender } = renderHook(
      (props) =>
        useRestoreScrollPosition(
          "/audiobooks",
          "sort=title",
          1,
          props.isLoading,
          false,
          vi.fn(),
          true
        ),
      { initialProps: { isLoading: true } }
    );

    act(() => {
      flushRAF();
    });

    // Should not scroll while loading
    expect(scrollContainer.scrollTop).toBe(0);

    // Now finish loading
    rerender({ isLoading: false });

    act(() => {
      flushRAF();
    });

    expect(scrollContainer.scrollTop).toBe(500);
  });

  it("clears saved state after successful restore", () => {
    sessionStorageMock["scroll-position-/audiobooks"] = JSON.stringify({
      position: 500,
      searchParamsKey: "sort=title",
      pagesLoaded: 1,
    });

    renderHook(() =>
      useRestoreScrollPosition(
        "/audiobooks",
        "sort=title",
        1,
        false,
        false,
        vi.fn(),
        true
      )
    );

    act(() => {
      flushRAF();
    });

    expect(sessionStorage.removeItem).toHaveBeenCalledWith(
      "scroll-position-/audiobooks"
    );
  });

  it("handles different library paths independently", () => {
    sessionStorageMock["scroll-position-/audiobooks"] = JSON.stringify({
      position: 300,
      searchParamsKey: "sort=title",
      pagesLoaded: 1,
    });

    // Restoring /ebooks should not find /audiobooks state
    const { result } = renderHook(() =>
      useRestoreScrollPosition(
        "/ebooks",
        "sort=title",
        1,
        false,
        false,
        vi.fn(),
        true
      )
    );

    expect(result.current.isRestoring).toBe(false);
    expect(scrollContainer.scrollTop).toBe(0);
  });
});

describe("clearScrollState", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("removes the correct key from sessionStorage", () => {
    clearScrollState("/audiobooks");
    expect(sessionStorage.removeItem).toHaveBeenCalledWith(
      "scroll-position-/audiobooks"
    );
  });

  it("uses different keys for different paths", () => {
    clearScrollState("/ebooks");
    expect(sessionStorage.removeItem).toHaveBeenCalledWith(
      "scroll-position-/ebooks"
    );
  });
});
