"use client";

import { useCallback, useSyncExternalStore } from "react";

// Nothing to subscribe to: these keys are written by a sibling page before this
// one mounts, not updated underneath a mounted reader. useSyncExternalStore
// still requires a stable subscribe function, hence module scope.
const subscribe = () => () => {};

// No sessionStorage on the server. React renders this, expects the first client
// render to match, then re-renders with the real snapshot — which is precisely
// why reading storage this way is not a hydration mismatch.
const getServerSnapshot = () => null;

/**
 * Reads a sessionStorage key during render, safely under SSR.
 *
 * This replaces `useState(null)` + `useEffect(() => setX(sessionStorage...))`.
 * That shape renders twice on mount and, more visibly, means the first painted
 * frame shows the fallback: a detail page's back link pointed at the bare
 * library path, and its prev/next arrows were absent, until the effect landed.
 *
 * Returns the raw string so the snapshot stays referentially stable — React
 * calls getSnapshot during render and bails out on an unchanged value, so
 * anything derived from it (a parsed array, say) must be memoised by the caller
 * rather than built here.
 */
export function useSessionStorageValue(key: string): string | null {
  const getSnapshot = useCallback(() => sessionStorage.getItem(key), [key]);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
