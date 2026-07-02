"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import type {
  FoliateView,
  FoliateRelocateDetail,
  FoliateLoadDetail,
  FoliateDataDetail,
} from "../../../lib/foliate-js/foliate-view";
import { applyReaderStyles } from "../../../lib/reader-themes";
import type { ReaderSettings } from "../../../lib/use-reader-settings";
import type {
  ReaderController,
  ReaderRelocateInfo,
  ReaderTocItem,
} from "./types";

interface FoliateReaderProps {
  ebookId: string;
  fileName: string;
  initialLocator: string | null;
  initialPercent: number;
  settings: ReaderSettings;
  controllerRef: MutableRefObject<ReaderController | null>;
  onRelocate: (info: ReaderRelocateInfo) => void;
  onReady: (toc: ReaderTocItem[]) => void;
  onError: (error: Error) => void;
  onContentKeyDown?: (event: KeyboardEvent) => void;
}

/**
 * Remove <script> elements and inline event handlers from book content
 * before foliate-js turns it into a blob URL. Belt-and-braces on top of
 * blocking script resources: foliate's iframes need `allow-scripts` for a
 * WebKit event bug, so scripted EPUB content must not reach them.
 */
function stripScripts(data: string, type: string): string {
  try {
    const doc = new DOMParser().parseFromString(
      data,
      type as DOMParserSupportedType,
    );
    for (const script of doc.querySelectorAll("script")) {
      script.remove();
    }
    for (const el of doc.querySelectorAll("*")) {
      for (const attr of [...el.attributes]) {
        if (attr.name.toLowerCase().startsWith("on")) {
          el.removeAttribute(attr.name);
        }
      }
    }
    return new XMLSerializer().serializeToString(doc);
  } catch {
    return data;
  }
}

export function FoliateReader({
  ebookId,
  fileName,
  initialLocator,
  initialPercent,
  settings,
  controllerRef,
  onRelocate,
  onReady,
  onError,
  onContentKeyDown,
}: FoliateReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<FoliateView | null>(null);

  // Callbacks and settings are kept in refs so the open-once effect below
  // doesn't reopen the book when they change (same pattern as
  // player-provider's playbackRateRef).
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const onRelocateRef = useRef(onRelocate);
  onRelocateRef.current = onRelocate;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onContentKeyDownRef = useRef(onContentKeyDown);
  onContentKeyDownRef.current = onContentKeyDown;
  const initialLocatorRef = useRef(initialLocator);
  const initialPercentRef = useRef(initialPercent);

  useEffect(() => {
    let cancelled = false;
    let view: FoliateView | null = null;

    const openBook = async () => {
      // Importing view.js registers the <foliate-view> custom element
      await import("../../../lib/foliate-js/view.js");

      const response = await fetch(`/api/ebooks/${ebookId}/stream`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`Failed to load ebook (${response.status})`);
      }
      const blob = await response.blob();
      if (cancelled || !containerRef.current) return;

      view = document.createElement("foliate-view") as FoliateView;
      view.style.width = "100%";
      view.style.height = "100%";
      view.style.display = "block";

      view.addEventListener("relocate", (event) => {
        const detail = (event as CustomEvent<FoliateRelocateDetail>).detail;
        onRelocateRef.current({
          locator: detail.cfi,
          fraction: detail.fraction,
          tocLabel: detail.tocItem?.label,
          pageLabel: detail.pageItem?.label,
        });
      });
      view.addEventListener("load", (event) => {
        const { doc } = (event as CustomEvent<{ doc: Document }>).detail;
        doc.addEventListener("keydown", (e) => {
          onContentKeyDownRef.current?.(e);
        });
      });

      containerRef.current.replaceChildren(view);
      viewRef.current = view;

      await view.open(new File([blob], fileName));
      if (cancelled) return;

      // Block scripted EPUB content (resources and inline)
      view.book.transformTarget?.addEventListener("load", (event) => {
        const detail = (event as CustomEvent<FoliateLoadDetail>).detail;
        if (detail.isScript) detail.allow = false;
      });
      view.book.transformTarget?.addEventListener("data", (event) => {
        const detail = (event as CustomEvent<FoliateDataDetail>).detail;
        if (
          typeof detail.data === "string" &&
          /x?html|xml/i.test(detail.type)
        ) {
          detail.data = stripScripts(detail.data, detail.type);
        }
      });

      applyReaderStyles(view, settingsRef.current);

      const locator = initialLocatorRef.current;
      try {
        await view.init({ lastLocation: locator ?? undefined });
      } catch {
        // Saved location no longer resolves (e.g. re-vendored foliate-js
        // changed synthesized MOBI CFIs) - fall back to the saved percentage
        if (cancelled) return;
        await view.goToFraction(
          Math.min(Math.max(initialPercentRef.current / 100, 0), 1),
        );
      }
      if (cancelled) return;

      controllerRef.current = {
        prev: () => void viewRef.current?.prev(),
        next: () => void viewRef.current?.next(),
        goToFraction: (fraction) =>
          void viewRef.current?.goToFraction(fraction),
        goToHref: (href) => void viewRef.current?.goTo(href),
      };
      onReadyRef.current(view.book.toc ?? []);
    };

    openBook().catch((error: unknown) => {
      if (!cancelled) {
        onErrorRef.current(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    });

    return () => {
      cancelled = true;
      controllerRef.current = null;
      try {
        view?.close();
      } catch {
        // Ignore errors from closing a partially opened book
      }
      view?.remove();
      viewRef.current = null;
    };
  }, [ebookId, fileName, controllerRef]);

  // Live-apply settings changes without reopening the book
  useEffect(() => {
    const view = viewRef.current;
    if (view) applyReaderStyles(view, settings);
  }, [settings]);

  return <div ref={containerRef} className="h-full w-full" />;
}
