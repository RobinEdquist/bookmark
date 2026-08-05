"use client";

import { useSyncExternalStore } from "react";

// The origin never changes for the lifetime of the document, so there is
// nothing to subscribe to — but useSyncExternalStore still wants a subscribe
// function, and it has to be referentially stable, hence module scope.
const subscribe = () => () => {};

const getSnapshot = () => window.location.origin;

// Rendered on the server, where there is no location. React expects the first
// client render to agree with this, then re-renders with the real snapshot —
// which is why this is not a hydration mismatch.
const getServerSnapshot = () => "";

/**
 * The current origin (e.g. `https://books.example.com`), for URLs we show to
 * the user so they can point a client at this instance.
 *
 * This replaces `useState("")` + `useEffect(() => setServerUrl(location.origin))`.
 * That shape works, but it makes the component render twice on mount for a value
 * that is constant, and it is the reason the effect tripped
 * `react-hooks/set-state-in-effect`.
 */
export function useOrigin(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
