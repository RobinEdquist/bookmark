"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type LibraryPath = "/audiobooks" | "/ebooks";

interface ScrollState {
  position: number;
  searchParamsKey: string;
  pagesLoaded: number;
}

const STORAGE_PREFIX = "scroll-position-";

// Debug logging
const DEBUG = true;
function log(...args: unknown[]) {
  if (DEBUG) console.log("[ScrollPosition]", ...args);
}

/**
 * Get the main scroll container from the authenticated layout.
 */
function getScrollContainer(): HTMLElement | null {
  const container = document.querySelector("main.overflow-auto");
  log("getScrollContainer:", container ? "found" : "NOT FOUND");
  return container as HTMLElement | null;
}

/**
 * Save scroll state to sessionStorage.
 */
function saveScrollState(libraryPath: LibraryPath, state: ScrollState): void {
  if (typeof window === "undefined") return;
  log("SAVING scroll state:", { libraryPath, ...state });
  sessionStorage.setItem(
    `${STORAGE_PREFIX}${libraryPath}`,
    JSON.stringify(state)
  );
}

/**
 * Load scroll state from sessionStorage.
 */
function loadScrollState(libraryPath: LibraryPath): ScrollState | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = sessionStorage.getItem(`${STORAGE_PREFIX}${libraryPath}`);
    if (!stored) {
      log("LOAD: No saved state for", libraryPath);
      return null;
    }
    const parsed = JSON.parse(stored) as ScrollState;
    log("LOADED scroll state:", { libraryPath, ...parsed });
    return parsed;
  } catch {
    log("LOAD: Error parsing state for", libraryPath);
    return null;
  }
}

/**
 * Clear scroll state from sessionStorage.
 */
export function clearScrollState(libraryPath: LibraryPath): void {
  if (typeof window === "undefined") return;
  log("CLEARING scroll state for", libraryPath);
  sessionStorage.removeItem(`${STORAGE_PREFIX}${libraryPath}`);
}

/**
 * Hook to save scroll position when navigating away from a library page.
 * Saves continuously on scroll events since Next.js resets scroll before unmount.
 */
export function useSaveScrollPosition(
  libraryPath: LibraryPath,
  searchParamsKey: string,
  pagesLoaded: number
) {
  // Store latest values in refs so scroll handler always has current data
  const searchParamsKeyRef = useRef(searchParamsKey);
  const pagesLoadedRef = useRef(pagesLoaded);

  // Update refs when values change
  useEffect(() => {
    searchParamsKeyRef.current = searchParamsKey;
    pagesLoadedRef.current = pagesLoaded;
    log("useSaveScrollPosition: updated refs", { searchParamsKey, pagesLoaded });
  }, [searchParamsKey, pagesLoaded]);

  useEffect(() => {
    const container = getScrollContainer();
    if (!container) {
      log("useSaveScrollPosition: No container found on mount");
      return;
    }

    let scrollTimeout: ReturnType<typeof setTimeout> | null = null;

    const handleScroll = () => {
      // Debounce: save after scrolling stops for 150ms
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }

      scrollTimeout = setTimeout(() => {
        const scrollTop = container.scrollTop;
        log("Scroll stopped, scrollTop:", scrollTop);

        if (scrollTop > 0) {
          saveScrollState(libraryPath, {
            position: scrollTop,
            searchParamsKey: searchParamsKeyRef.current,
            pagesLoaded: pagesLoadedRef.current,
          });
        }
      }, 150);
    };

    // Save on visibility change (user switches tab)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && container.scrollTop > 0) {
        log("Visibility changed to hidden, saving position:", container.scrollTop);
        saveScrollState(libraryPath, {
          position: container.scrollTop,
          searchParamsKey: searchParamsKeyRef.current,
          pagesLoaded: pagesLoadedRef.current,
        });
      }
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);

    log("useSaveScrollPosition: scroll listener attached");

    return () => {
      log("useSaveScrollPosition UNMOUNTING");
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }
      container.removeEventListener("scroll", handleScroll);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [libraryPath]);
}

/**
 * Hook to restore scroll position when returning to a library page.
 * Handles infinite scroll by fetching more pages if needed before scrolling.
 */
export function useRestoreScrollPosition(
  libraryPath: LibraryPath,
  searchParamsKey: string,
  pagesLoaded: number,
  isLoading: boolean,
  isFetchingNextPage: boolean,
  fetchNextPage: () => void,
  hasNextPage: boolean
): { isRestoring: boolean } {
  const [isRestoring, setIsRestoring] = useState(false);
  const restoredRef = useRef(false);
  const targetStateRef = useRef<ScrollState | null>(null);

  log("useRestoreScrollPosition render:", {
    libraryPath,
    searchParamsKey,
    pagesLoaded,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    restoredRef: restoredRef.current,
    targetState: targetStateRef.current,
    isRestoring,
  });

  // On mount, check if we should restore
  useEffect(() => {
    log("MOUNT EFFECT running, restoredRef:", restoredRef.current);
    if (restoredRef.current) {
      log("Already restored, skipping mount effect");
      return;
    }

    const savedState = loadScrollState(libraryPath);

    // Don't restore if:
    // 1. No saved state
    // 2. Search params changed (user did new search/sort)
    // 3. Position is at top
    if (!savedState) {
      log("No saved state, clearing and returning");
      clearScrollState(libraryPath);
      return;
    }

    if (savedState.searchParamsKey !== searchParamsKey) {
      log("searchParamsKey mismatch:", { saved: savedState.searchParamsKey, current: searchParamsKey });
      clearScrollState(libraryPath);
      return;
    }

    if (savedState.position <= 0) {
      log("Saved position is 0, clearing and returning");
      clearScrollState(libraryPath);
      return;
    }

    log("Setting targetStateRef to:", savedState);
    targetStateRef.current = savedState;
    setIsRestoring(true);
  }, [libraryPath, searchParamsKey]);

  // Fetch more pages if needed, then restore scroll
  useEffect(() => {
    const targetState = targetStateRef.current;

    log("RESTORE EFFECT running:", {
      hasTargetState: !!targetState,
      restoredRef: restoredRef.current,
      isLoading,
      isFetchingNextPage,
      pagesLoaded,
      targetPagesLoaded: targetState?.pagesLoaded,
      hasNextPage,
    });

    // Wait for loading and fetching to complete before attempting scroll
    if (!targetState) {
      log("No target state, returning");
      return;
    }
    if (restoredRef.current) {
      log("Already restored, returning");
      return;
    }
    if (isLoading) {
      log("isLoading is true, waiting...");
      return;
    }
    if (isFetchingNextPage) {
      log("isFetchingNextPage is true, waiting...");
      return;
    }

    // Need to load more pages first?
    if (pagesLoaded < targetState.pagesLoaded && hasNextPage) {
      log("Need more pages, fetching next page. Current:", pagesLoaded, "Target:", targetState.pagesLoaded);
      fetchNextPage();
      return;
    }

    // Ready to restore scroll position - use double rAF for layout stability
    log("READY TO RESTORE! Target position:", targetState.position);
    const container = getScrollContainer();
    if (container) {
      log("Container found, scrollHeight:", container.scrollHeight, "clientHeight:", container.clientHeight);
      log("Max scrollTop possible:", container.scrollHeight - container.clientHeight);

      requestAnimationFrame(() => {
        log("First rAF fired");
        requestAnimationFrame(() => {
          log("Second rAF fired, setting scrollTop to:", targetState.position);
          container.scrollTop = targetState.position;
          log("scrollTop after assignment:", container.scrollTop);
          restoredRef.current = true;
          setIsRestoring(false);
          clearScrollState(libraryPath);
          log("Restoration complete!");
        });
      });
    } else {
      log("ERROR: No container found for scroll restoration!");
    }
  }, [libraryPath, pagesLoaded, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage]);

  return { isRestoring };
}
