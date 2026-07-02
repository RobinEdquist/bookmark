"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { Document, Page, pdfjs } from "react-pdf";

import type { ReaderThemeName } from "../../../lib/reader-themes";
import type { ReaderController, ReaderRelocateInfo } from "./types";
import type { ReaderTocItem } from "./types";

// Served from public/. The file is copied from pdfjs-dist and must match
// the version react-pdf pins (see package.json / pnpm-lock.yaml).
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

const PDF_LOCATOR_PATTERN = /^page:(\d+)$/;

export function parsePdfLocator(locator: string | null): number | null {
  if (!locator) return null;
  const match = PDF_LOCATOR_PATTERN.exec(locator);
  if (!match || !match[1]) return null;
  const page = parseInt(match[1], 10);
  return Number.isNaN(page) || page < 1 ? null : page;
}

interface PdfReaderProps {
  ebookId: string;
  initialLocator: string | null;
  theme: ReaderThemeName;
  controllerRef: MutableRefObject<ReaderController | null>;
  onRelocate: (info: ReaderRelocateInfo) => void;
  onReady: (toc: ReaderTocItem[]) => void;
  onError: (error: Error) => void;
}

export function PdfReader({
  ebookId,
  initialLocator,
  theme,
  controllerRef,
  onRelocate,
  onReady,
  onError,
}: PdfReaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(() => parsePdfLocator(initialLocator) ?? 1);
  const [pageAspect, setPageAspect] = useState<number | null>(null);

  const onRelocateRef = useRef(onRelocate);
  onRelocateRef.current = onRelocate;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Referentially stable file descriptor - react-pdf reloads the document
  // whenever this object identity changes. withCredentials lets pdf.js
  // stream the file with range requests through the authenticated proxy.
  const file = useMemo(
    () => ({ url: `/api/ebooks/${ebookId}/stream`, withCredentials: true }),
    [ebookId],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const goToPage = useCallback(
    (target: number) => {
      setPage((current) => {
        const clamped = Math.min(Math.max(target, 1), numPages || 1);
        return clamped === current ? current : clamped;
      });
    },
    [numPages],
  );

  // Expose navigation to the shell and report the current position
  useEffect(() => {
    if (!numPages) return;
    controllerRef.current = {
      prev: () => goToPage(page - 1),
      next: () => goToPage(page + 1),
      goToFraction: (fraction) =>
        goToPage(Math.max(1, Math.round(fraction * numPages))),
      goToHref: () => {},
    };
    onRelocateRef.current({
      locator: `page:${page}`,
      fraction: page / numPages,
      pageLabel: `${page} / ${numPages}`,
    });
  }, [page, numPages, goToPage, controllerRef]);

  useEffect(() => {
    return () => {
      controllerRef.current = null;
    };
  }, [controllerRef]);

  const handleLoadSuccess = useCallback(
    ({ numPages: total }: { numPages: number }) => {
      setNumPages(total);
      setPage((current) => Math.min(Math.max(current, 1), total));
      onReadyRef.current([]);
    },
    [],
  );

  const handleLoadError = useCallback((error: Error) => {
    onErrorRef.current(error);
  }, []);

  // Fit the page inside the container (contain), once we know its aspect
  const pageSize = useMemo(() => {
    if (!containerSize) return {};
    const width = containerSize.width;
    const height = containerSize.height;
    if (!pageAspect) return { width };
    return width / height > pageAspect
      ? { height }
      : { width };
  }, [containerSize, pageAspect]);

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full items-center justify-center overflow-hidden"
    >
      <Document
        file={file}
        onLoadSuccess={handleLoadSuccess}
        onLoadError={handleLoadError}
        loading={null}
        error={null}
      >
        {numPages > 0 && containerSize && (
          <div
            className={
              theme === "dark"
                ? "[filter:invert(0.92)_hue-rotate(180deg)]"
                : undefined
            }
          >
            <Page
              pageNumber={page}
              {...pageSize}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              loading={null}
              onLoadSuccess={(loadedPage) => {
                const { width, height } = loadedPage.getViewport({ scale: 1 });
                if (height > 0) setPageAspect(width / height);
              }}
            />
          </div>
        )}
      </Document>
    </div>
  );
}
