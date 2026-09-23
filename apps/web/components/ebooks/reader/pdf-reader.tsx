"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
} from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Maximize2, Minus, Plus, RectangleHorizontal } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { Input } from "@repo/ui/components/ui/input";
import { useTranslations } from "next-intl";

import { readerThemes, type ReaderThemeName } from "../../../lib/reader-themes";
import { useLatestRef } from "../../../lib/use-latest-ref";
import type { ReaderController, ReaderRelocateInfo } from "./types";
import type { ReaderTocItem } from "./types";
import {
  applyZoomToPageSize,
  clampPage,
  clampZoom,
  computeBasePageSize,
  parsePageInput,
  stepZoom,
  type PdfFitMode,
  PDF_ZOOM_DEFAULT,
  PDF_ZOOM_MAX,
  PDF_ZOOM_MIN,
  parsePdfLocator,
  formatPdfLocator,
} from "./pdf-reader-layout";

export { parsePdfLocator } from "./pdf-reader-layout";

import "react-pdf/dist/Page/TextLayer.css";

// Served from public/. Refresh with `pnpm copy-pdfjs-assets` so the worker
// matches the pdfjs-dist version react-pdf pins (see public/pdfjs/VERSION).
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

/** Stable Document options — asset URLs must stay referentially stable. */
const PDF_DOCUMENT_OPTIONS = {
  cMapUrl: "/pdfjs/cmaps/",
  cMapPacked: true,
  standardFontDataUrl: "/pdfjs/standard_fonts/",
  wasmUrl: "/pdfjs/wasm/",
} as const;

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
  const t = useTranslations("ebooks");
  const scrollRef = useRef<HTMLDivElement>(null);
  const skipPageBlurCommitRef = useRef(false);
  const [containerSize, setContainerSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(() => parsePdfLocator(initialLocator) ?? 1);
  const [pageAspect, setPageAspect] = useState<number | null>(null);
  const [fitMode, setFitMode] = useState<PdfFitMode>("page");
  const [zoom, setZoom] = useState(PDF_ZOOM_DEFAULT);
  /** Non-null while the page field is being edited; otherwise show `page`. */
  const [pageDraft, setPageDraft] = useState<string | null>(null);

  const onRelocateRef = useLatestRef(onRelocate);
  const onReadyRef = useLatestRef(onReady);
  const onErrorRef = useLatestRef(onError);

  const file = useMemo(
    () => ({ url: `/api/ebooks/${ebookId}/stream`, withCredentials: true }),
    [ebookId],
  );

  useEffect(() => {
    const container = scrollRef.current;
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
        const clamped = clampPage(target, numPages || 1);
        return clamped === current ? current : clamped;
      });
    },
    [numPages],
  );

  // When the page changes under zoom, reset scroll so the top of the page is visible.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    }
  }, [page]);

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
      locator: formatPdfLocator(page),
      fraction: page / numPages,
      pageLabel: `${page} / ${numPages}`,
    });
  }, [page, numPages, goToPage, controllerRef, onRelocateRef]);

  useEffect(() => {
    return () => {
      controllerRef.current = null;
    };
  }, [controllerRef]);

  const handleLoadSuccess = useCallback(
    ({ numPages: total }: { numPages: number }) => {
      setNumPages(total);
      // Clamp restored/out-of-range pages once the real page count is known.
      setPage((current) => clampPage(current, total));
      onReadyRef.current([]);
    },
    [onReadyRef],
  );

  const handleLoadError = useCallback(
    (error: Error) => {
      onErrorRef.current(new Error(t("reader.pdfLoadError"), { cause: error }));
    },
    [onErrorRef, t],
  );

  const handlePassword = useCallback(
    (callback: (password: string | null) => void) => {
      onErrorRef.current(new Error(t("reader.pdfPasswordRequired")));
      // Abort the password prompt so react-pdf does not hang waiting.
      callback(null);
    },
    [onErrorRef, t],
  );

  const commitPageInput = useCallback(() => {
    const raw = pageDraft ?? String(page);
    const next = parsePageInput(raw, numPages || 1);
    setPageDraft(null);
    if (next == null) return;
    goToPage(next);
  }, [pageDraft, numPages, page, goToPage]);

  const onPageFormSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      commitPageInput();
    },
    [commitPageInput],
  );

  const onPageInputKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      // Stop shell page-turn keys while editing the page field.
      event.stopPropagation();
      if (event.key === "Escape") {
        // blur fires synchronously, before React commits the cleared draft.
        skipPageBlurCommitRef.current = true;
        setPageDraft(null);
        event.currentTarget.blur();
      }
    },
    [],
  );

  const pageSize = useMemo(() => {
    if (!containerSize) return {};
    const base = computeBasePageSize(fitMode, containerSize, pageAspect);
    return applyZoomToPageSize(base, zoom);
  }, [containerSize, fitMode, pageAspect, zoom]);

  const zoomPercent = Math.round(clampZoom(zoom) * 100);

  return (
    <div className="flex h-full w-full flex-col">
      <div className="z-10 flex shrink-0 flex-wrap items-center justify-center gap-1 border-b bg-background/95 px-2 py-1 backdrop-blur">
        <div
          className="flex items-center gap-0.5"
          role="group"
          aria-label={t("reader.fitMode")}
        >
          <Button
            type="button"
            variant={fitMode === "page" ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            aria-pressed={fitMode === "page"}
            aria-label={t("reader.fitPage")}
            onClick={() => {
              setFitMode("page");
              setZoom(PDF_ZOOM_DEFAULT);
            }}
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant={fitMode === "width" ? "secondary" : "ghost"}
            size="icon"
            className="h-8 w-8"
            aria-pressed={fitMode === "width"}
            aria-label={t("reader.fitWidth")}
            onClick={() => {
              setFitMode("width");
              setZoom(PDF_ZOOM_DEFAULT);
            }}
          >
            <RectangleHorizontal className="h-4 w-4" />
          </Button>
        </div>

        <div className="mx-1 h-4 w-px bg-border" aria-hidden />

        <div
          className="flex items-center gap-0.5"
          role="group"
          aria-label={t("reader.zoom")}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={t("reader.zoomOut")}
            disabled={zoom <= PDF_ZOOM_MIN}
            onClick={() => setZoom((z) => stepZoom(z, -1))}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <span className="min-w-12 text-center text-xs tabular-nums text-muted-foreground">
            {t("reader.zoomPercent", { percent: zoomPercent })}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={t("reader.zoomIn")}
            disabled={zoom >= PDF_ZOOM_MAX}
            onClick={() => setZoom((z) => stepZoom(z, 1))}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="mx-1 h-4 w-px bg-border" aria-hidden />

        <form
          className="flex items-center gap-1"
          onSubmit={onPageFormSubmit}
          aria-label={t("reader.goToPage")}
        >
          <label className="sr-only" htmlFor={`pdf-page-${ebookId}`}>
            {t("reader.goToPage")}
          </label>
          <Input
            id={`pdf-page-${ebookId}`}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            className="h-8 w-14 px-2 text-center text-xs tabular-nums"
            value={pageDraft ?? String(page)}
            onFocus={() => setPageDraft(String(page))}
            onChange={(e) => setPageDraft(e.target.value)}
            onBlur={() => {
              if (skipPageBlurCommitRef.current) {
                skipPageBlurCommitRef.current = false;
                return;
              }
              commitPageInput();
            }}
            onKeyDown={onPageInputKeyDown}
            disabled={numPages < 1}
            aria-label={t("reader.goToPage")}
          />
          <span className="text-xs tabular-nums text-muted-foreground">
            / {numPages || "—"}
          </span>
        </form>
      </div>

      <div
        ref={scrollRef}
        data-testid="pdf-viewport"
        className="min-h-0 flex-1 overflow-auto"
        // Allow pan/scroll when zoomed; text selection must not be blocked.
      >
        <div className="flex min-h-full w-max min-w-full items-start justify-center p-2">
          <Document
            file={file}
            // Keep failures in the shell's error UI instead of throwing to Next.
            suspense={false}
            options={PDF_DOCUMENT_OPTIONS}
            onLoadSuccess={handleLoadSuccess}
            onLoadError={handleLoadError}
            onSourceError={handleLoadError}
            onPassword={handlePassword}
            loading={null}
            error={null}
          >
            {numPages > 0 && containerSize && (
              <div
                className={
                  readerThemes[theme].isDark
                    ? "[filter:invert(0.92)_hue-rotate(180deg)]"
                    : undefined
                }
              >
                <Page
                  pageNumber={page}
                  suspense={false}
                  {...pageSize}
                  renderTextLayer
                  renderAnnotationLayer={false}
                  loading={null}
                  onLoadSuccess={(loadedPage) => {
                    const { width, height } = loadedPage.getViewport({
                      scale: 1,
                    });
                    if (height > 0) setPageAspect(width / height);
                  }}
                  onLoadError={handleLoadError}
                  onRenderError={handleLoadError}
                  className="shadow-sm"
                />
              </div>
            )}
          </Document>
        </div>
      </div>
    </div>
  );
}
