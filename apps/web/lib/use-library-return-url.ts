"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type LibraryPath = "/audiobooks" | "/ebooks" | "/comics";

/**
 * Call this on library pages to save the current URL (including search params)
 * so detail pages can link back to the same state.
 */
export function useSaveLibraryUrl(libraryPath: LibraryPath) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const query = searchParams.toString();
    sessionStorage.setItem(
      `${libraryPath}-return-url`,
      pathname + (query ? `?${query}` : "")
    );
  }, [libraryPath, pathname, searchParams]);
}

/**
 * Call this on detail pages to get the return URL for the library.
 * Returns the saved URL with search params, or falls back to the base library path.
 */
export function useLibraryReturnUrl(libraryPath: LibraryPath): string {
  const [returnUrl, setReturnUrl] = useState<string>(libraryPath);

  useEffect(() => {
    const saved = sessionStorage.getItem(`${libraryPath}-return-url`);
    if (saved) {
      setReturnUrl(saved);
    }
  }, [libraryPath]);

  return returnUrl;
}
