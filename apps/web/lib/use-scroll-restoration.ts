"use client";

import { useLayoutEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Scroll restoration for pages rendered inside the app's scroll container
 * (the `[data-scroll-container]` <main> in the authenticated layout, which
 * persists across navigations — only page content swaps).
 *
 * Positions live in an in-memory map keyed by URL (+ `extraKey` for list
 * state that isn't URL-synced, like the localStorage sort preference). On
 * mount the position is applied in a layout effect — before paint — the
 * moment `ready` is true, which with a warm React Query cache is the very
 * first render. No flicker, so no fades or rAF timing are needed.
 *
 * Interplay with Next.js: its own scroll reset (`scrollIntoView` in
 * `InnerScrollAndFocusHandler`) runs after page layout effects, only for
 * push/replace navigations without `scroll: false`, and never on browser
 * back/forward. Links INTO a page using this hook must therefore pass
 * `scroll={false}` — the hook then decides (restore, or explicit top when
 * it has nothing saved). Links without it keep native land-at-top behavior.
 */

const positions = new Map<string, number>();

function getContainer(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-scroll-container]");
}

interface UseScrollRestorationOptions {
  /** True once real content backing the scroll height is rendered (e.g. `!!data`). */
  ready: boolean;
  /** Key material for list state not reflected in the URL (e.g. stored sort). */
  extraKey?: string;
}

export function useScrollRestoration({
  ready,
  extraKey = "",
}: UseScrollRestorationOptions): {
  /** Whether a position was saved for this key when the component mounted. */
  hasSavedPosition: boolean;
} {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const key = `${pathname}?${searchParams.toString()}::${extraKey}`;

  // Captured once at first render: what (if anything) to restore for this
  // mount. Reading the map later would see the values our own mount-time
  // writes (zero-pin, restore write-through) put there.
  const stashRef = useRef<{ key: string; pos: number | null } | null>(null);
  const stash =
    stashRef.current ??
    (stashRef.current = { key, pos: positions.get(key) ?? null });

  // Live key for the save path, so filter changes via router.replace re-key
  // subsequent saves without remounting. Synced before the restore effect runs.
  const keyRef = useRef(key);
  useLayoutEffect(() => {
    keyRef.current = key;
  });

  // Save: track the container's position under the current key. The unmount
  // snapshot covers visits where the user never scrolled (cleanup runs before
  // the old page's DOM is removed, so the position is still intact).
  useLayoutEffect(() => {
    const container = getContainer();
    if (!container) return;
    const onScroll = () => {
      positions.set(keyRef.current, container.scrollTop);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", onScroll);
      positions.set(keyRef.current, container.scrollTop);
    };
  }, []);

  // Restore: at most once per mount, at the first moment `ready` is true.
  // Until then the container is pinned to top so skeletons don't render at a
  // stale offset. The explicit 0 when nothing is saved matters: entry links
  // use scroll={false}, so Next.js won't reset the container for us.
  const restoredRef = useRef(false);
  useLayoutEffect(() => {
    if (restoredRef.current) return;
    const container = getContainer();
    if (!container) {
      restoredRef.current = true;
      return;
    }
    if (!ready) {
      container.scrollTop = 0;
      return;
    }
    restoredRef.current = true;
    const { key: mountKey, pos } = stashRef.current!;
    container.scrollTop = keyRef.current === mountKey && pos !== null ? pos : 0;
  }, [ready]);

  return { hasSavedPosition: stash.pos !== null };
}
