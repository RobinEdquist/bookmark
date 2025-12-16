"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type LibraryPath = "/audiobooks" | "/ebooks";

interface ScrollState {
  position: number;
  searchParamsKey: string;
  pagesLoaded: number;
}

const STORAGE_PREFIX = "scroll-position-";

/**
 * Get the main scroll container from the authenticated layout.
 */
function getScrollContainer(): HTMLElement | null {
  return document.querySelector("main.overflow-auto");
}

/**
 * Save scroll state to sessionStorage.
 */
function saveScrollState(libraryPath: LibraryPath, state: ScrollState): void {
  if (typeof window === "undefined") return;
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
    if (!stored) return null;
    return JSON.parse(stored) as ScrollState;
  } catch {
    return null;
  }
}

/**
 * Clear scroll state from sessionStorage.
 */
export function clearScrollState(libraryPath: LibraryPath): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(`${STORAGE_PREFIX}${libraryPath}`);
}

/**
 * Hook to save scroll position when navigating away from a library page.
 * Call this in the list page component.
 */
export function useSaveScrollPosition(
  libraryPath: LibraryPath,
  searchParamsKey: string,
  pagesLoaded: number
) {
  const savedRef = useRef(false);

  const savePosition = useCallback(() => {
    if (savedRef.current) return;

    const container = getScrollContainer();
    if (!container) return;

    // Only save if there's a meaningful scroll position
    if (container.scrollTop > 0) {
      saveScrollState(libraryPath, {
        position: container.scrollTop,
        searchParamsKey,
        pagesLoaded,
      });
    }
    savedRef.current = true;
  }, [libraryPath, searchParamsKey, pagesLoaded]);

  // Reset saved flag when dependencies change
  useEffect(() => {
    savedRef.current = false;
  }, [searchParamsKey, pagesLoaded]);

  useEffect(() => {
    // Save on visibility change (user switches tab before navigating)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        savePosition();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Save on unmount (navigation to detail page)
    return () => {
      savePosition();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [savePosition]);
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

  // On mount, check if we should restore
  useEffect(() => {
    if (restoredRef.current) return;

    const savedState = loadScrollState(libraryPath);

    // Don't restore if:
    // 1. No saved state
    // 2. Search params changed (user did new search/sort)
    // 3. Position is at top
    if (
      !savedState ||
      savedState.searchParamsKey !== searchParamsKey ||
      savedState.position <= 0
    ) {
      clearScrollState(libraryPath);
      return;
    }

    targetStateRef.current = savedState;
    setIsRestoring(true);
  }, [libraryPath, searchParamsKey]);

  // Fetch more pages if needed, then restore scroll
  useEffect(() => {
    const targetState = targetStateRef.current;
    // Wait for loading and fetching to complete before attempting scroll
    if (!targetState || restoredRef.current || isLoading || isFetchingNextPage) return;

    // Need to load more pages first?
    if (pagesLoaded < targetState.pagesLoaded && hasNextPage) {
      fetchNextPage();
      return;
    }

    // Ready to restore scroll position - use double rAF for layout stability
    // First rAF: scheduled after React's DOM updates
    // Second rAF: scheduled after browser layout/paint
    const container = getScrollContainer();
    if (container) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          container.scrollTop = targetState.position;
          restoredRef.current = true;
          setIsRestoring(false);
          clearScrollState(libraryPath);
        });
      });
    }
  }, [libraryPath, pagesLoaded, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage]);

  return { isRestoring };
}
