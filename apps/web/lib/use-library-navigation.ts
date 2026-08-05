"use client";

import { useEffect, useMemo } from "react";

import { useSessionStorageValue } from "./use-session-storage-value";

type LibraryPath = "/audiobooks" | "/ebooks" | "/comics";

const STORAGE_KEY_SUFFIX = "-navigation-ids";

// Shared so the "no browsing context" result keeps a stable identity across
// renders, letting consumers memoise on it.
const NO_NAVIGATION = { previousId: null, nextId: null } as const;

/**
 * Call on list pages to save the current ordered item IDs to sessionStorage,
 * so detail pages can provide next/previous navigation.
 */
export function useSaveLibraryNavigation(
  libraryPath: LibraryPath,
  ids: string[],
) {
  const idsJson = JSON.stringify(ids);
  useEffect(() => {
    if (idsJson === "[]") return;
    sessionStorage.setItem(`${libraryPath}${STORAGE_KEY_SUFFIX}`, idsJson);
  }, [libraryPath, idsJson]);
}

/**
 * Call on detail pages to get previous/next item IDs for navigation.
 * Returns null values when no browsing context exists.
 */
export function useLibraryNavigation(
  libraryPath: LibraryPath,
  currentId: string,
): { previousId: string | null; nextId: string | null } {
  // Read during render rather than syncing into state from an effect, so the
  // arrows are correct on the first paint instead of appearing a frame later.
  // The stored value is the raw JSON string, which keeps the external-store
  // snapshot referentially stable; parsing happens in the memo below.
  const stored = useSessionStorageValue(`${libraryPath}${STORAGE_KEY_SUFFIX}`);

  return useMemo(() => {
    if (!stored) return NO_NAVIGATION;

    try {
      const ids: string[] = JSON.parse(stored);
      const currentIndex = ids.indexOf(currentId);
      if (currentIndex === -1) return NO_NAVIGATION;

      return {
        previousId: currentIndex > 0 ? (ids[currentIndex - 1] ?? null) : null,
        nextId:
          currentIndex < ids.length - 1
            ? (ids[currentIndex + 1] ?? null)
            : null,
      };
    } catch {
      // Corrupted data, ignore
      return NO_NAVIGATION;
    }
  }, [stored, currentId]);
}
