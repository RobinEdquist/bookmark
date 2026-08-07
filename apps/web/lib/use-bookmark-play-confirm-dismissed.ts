"use client";

import { useCallback, useState } from "react";

const STORAGE_KEY = "bookmark.bookmarks.playConfirmDismissed";

/**
 * Tracks whether the user chose "don't ask again" on the play-from-bookmark
 * confirmation (playing a bookmark moves the saved listening progress).
 * Persisted to localStorage per device, mirroring the native apps' local flag.
 *
 * Reads synchronously on init. This hook only renders inside the
 * authenticated layout, which shows a spinner (not page content) during SSR,
 * so there's no hydration mismatch from touching localStorage in the
 * initializer.
 */
export function useBookmarkPlayConfirmDismissed(): [
  boolean,
  (value: boolean) => void,
] {
  const [dismissed, setDismissedState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  const setDismissed = useCallback((value: boolean) => {
    setDismissedState(value);
    try {
      if (value) {
        window.localStorage.setItem(STORAGE_KEY, "true");
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Ignore storage failures (private mode, quota, etc.) — the in-memory
      // state still drives the UI for this session.
    }
  }, []);

  return [dismissed, setDismissed];
}
