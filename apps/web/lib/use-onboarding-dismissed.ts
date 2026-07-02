"use client";

import { useCallback, useState } from "react";

const STORAGE_KEY = "bookmark.onboarding.dismissed";

/**
 * Tracks whether the admin has chosen to skip the first-run library setup
 * wizard. Persisted to localStorage so the wizard doesn't nag on every reload,
 * but easily reversible ("Resume setup").
 *
 * Reads synchronously on init. This hook only renders inside the authenticated
 * layout, which shows a spinner (not page content) during SSR, so there's no
 * hydration mismatch from touching localStorage in the initializer.
 */
export function useOnboardingDismissed(): [boolean, (value: boolean) => void] {
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
