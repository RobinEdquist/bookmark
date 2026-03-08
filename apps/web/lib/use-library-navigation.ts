"use client";

import { useEffect, useState } from "react";

type LibraryPath = "/audiobooks" | "/ebooks";

const STORAGE_KEY_SUFFIX = "-navigation-ids";

/**
 * Call on list pages to save the current ordered item IDs to sessionStorage,
 * so detail pages can provide next/previous navigation.
 */
export function useSaveLibraryNavigation(
  libraryPath: LibraryPath,
  ids: string[],
) {
  useEffect(() => {
    if (ids.length === 0) return;
    sessionStorage.setItem(
      `${libraryPath}${STORAGE_KEY_SUFFIX}`,
      JSON.stringify(ids),
    );
  });
}

/**
 * Call on detail pages to get previous/next item IDs for navigation.
 * Returns null values when no browsing context exists.
 */
export function useLibraryNavigation(
  libraryPath: LibraryPath,
  currentId: string,
): { previousId: string | null; nextId: string | null } {
  const [nav, setNav] = useState<{
    previousId: string | null;
    nextId: string | null;
  }>({ previousId: null, nextId: null });

  useEffect(() => {
    const stored = sessionStorage.getItem(
      `${libraryPath}${STORAGE_KEY_SUFFIX}`,
    );
    if (!stored) return;

    try {
      const ids: string[] = JSON.parse(stored);
      const currentIndex = ids.indexOf(currentId);
      if (currentIndex === -1) return;

      setNav({
        previousId: currentIndex > 0 ? (ids[currentIndex - 1] ?? null) : null,
        nextId:
          currentIndex < ids.length - 1
            ? (ids[currentIndex + 1] ?? null)
            : null,
      });
    } catch {
      // Corrupted data, ignore
    }
  }, [libraryPath, currentId]);

  return nav;
}
