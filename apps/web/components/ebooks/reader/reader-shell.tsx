"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { useTranslations } from "next-intl";

import { useEbook } from "../../../lib/use-ebooks";
import {
  useEbookProgress,
  useUpdateEbookProgress,
} from "../../../lib/use-ebook-progress";
import { useReaderSettings } from "../../../lib/use-reader-settings";
import { readerThemes } from "../../../lib/reader-themes";
import { useTheme } from "../../../lib/use-theme";
import { FoliateReader } from "./foliate-reader";
import { PdfReader } from "./pdf-reader";
import { ReaderTopBar } from "./reader-top-bar";
import { ReaderBottomBar } from "./reader-bottom-bar";
import { ReaderToc } from "./reader-toc";
import type {
  ReaderController,
  ReaderRelocateInfo,
  ReaderTocItem,
} from "./types";

const FOLIATE_FORMATS = new Set(["epub", "mobi", "azw3", "fb2", "cbz"]);

const SAVE_DEBOUNCE_MS = 1500;

interface ReaderShellProps {
  ebookId: string;
}

export default function ReaderShell({ ebookId }: ReaderShellProps) {
  const t = useTranslations("ebooks");
  const router = useRouter();
  const { isDark } = useTheme();
  const { settings, update: updateSettings } = useReaderSettings(
    isDark ? "dark" : "light",
  );

  const ebookQuery = useEbook(ebookId);
  const progressQuery = useEbookProgress(ebookId);
  const updateProgress = useUpdateEbookProgress();

  const [toc, setToc] = useState<ReaderTocItem[]>([]);
  const [tocOpen, setTocOpen] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [position, setPosition] = useState<{
    percent: number;
    label: string | null;
  }>({ percent: 0, label: null });

  const controllerRef = useRef<ReaderController | null>(null);
  const isReadyRef = useRef(false);
  const pendingSaveRef = useRef<{ locator: string; percent: number } | null>(
    null,
  );
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateProgressRef = useRef(updateProgress);
  updateProgressRef.current = updateProgress;

  const close = useCallback(() => {
    router.push(`/ebooks/${ebookId}`);
  }, [router, ebookId]);

  const flushSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const pending = pendingSaveRef.current;
    if (!pending) return;
    pendingSaveRef.current = null;
    updateProgressRef.current.mutate({
      ebookId,
      cfi: pending.locator,
      progressPercent: pending.percent,
    });
  }, [ebookId]);

  const handleRelocate = useCallback(
    (info: ReaderRelocateInfo) => {
      const percent = Math.round(
        Math.min(Math.max(info.fraction, 0), 1) * 100,
      );
      setPosition({
        percent: Math.min(Math.max(info.fraction, 0), 1) * 100,
        label: info.pageLabel ?? info.tocLabel ?? null,
      });
      // Don't persist relocations fired while restoring the saved position
      if (!isReadyRef.current) return;
      pendingSaveRef.current = { locator: info.locator, percent };
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
    },
    [flushSave],
  );

  const handleReady = useCallback((tocItems: ReaderTocItem[]) => {
    setToc(tocItems);
    setIsReady(true);
    isReadyRef.current = true;
  }, []);

  const handleError = useCallback((error: Error) => {
    setLoadError(error.message);
  }, []);

  // Flush pending progress on unmount; use a keepalive request on tab
  // close so the last position survives the page being torn down.
  useEffect(() => {
    const onPageHide = () => {
      const pending = pendingSaveRef.current;
      if (!pending) return;
      pendingSaveRef.current = null;
      void fetch(`/api/ebook-progress/${ebookId}`, {
        method: "PATCH",
        keepalive: true,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cfi: pending.locator,
          progressPercent: pending.percent,
        }),
      });
    };
    document.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("pagehide", onPageHide);
    };
  }, [ebookId]);

  useEffect(() => flushSave, [flushSave]);

  // Keyboard navigation - shared between the app window and (via
  // onContentKeyDown) documents inside foliate's iframes
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      switch (event.key) {
        case "ArrowLeft":
        case "PageUp":
          controllerRef.current?.prev();
          break;
        case "ArrowRight":
        case "PageDown":
        case " ":
          controllerRef.current?.next();
          break;
        case "Escape":
          close();
          break;
        default:
          return;
      }
      event.preventDefault();
    },
    [close],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const handleTocNavigate = useCallback((href: string) => {
    controllerRef.current?.goToHref(href);
    setTocOpen(false);
  }, []);

  const theme = readerThemes[settings.theme];
  const ebook = ebookQuery.data;
  // A book that was never started returns default progress (0%, null cfi);
  // a query error is treated the same so the reader still opens.
  const progressSettled = progressQuery.isSuccess || progressQuery.isError;
  const initialLocator = progressQuery.data?.cfi ?? null;
  const initialPercent = progressQuery.data?.progressPercent ?? 0;

  const format = ebook?.format.toLowerCase() ?? "";
  const isFoliate = FOLIATE_FORMATS.has(format);
  const isPdf = format === "pdf";

  const errorMessage =
    loadError ??
    (ebookQuery.isError ? t("reader.loadError") : null) ??
    (ebook && !isFoliate && !isPdf ? t("reader.unsupportedFormat") : null);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ backgroundColor: theme.bg }}
    >
      <ReaderTopBar
        title={ebook?.title ?? ""}
        settings={settings}
        onUpdateSettings={updateSettings}
        showTypography={isFoliate}
        hasToc={toc.length > 0}
        onOpenToc={() => setTocOpen(true)}
        onClose={close}
      />

      <div className="relative min-h-0 flex-1">
        {errorMessage ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 px-4 text-center">
              <p className="text-sm text-destructive">{errorMessage}</p>
              <Button variant="outline" size="sm" onClick={close}>
                {t("reader.close")}
              </Button>
            </div>
          </div>
        ) : !ebook || !progressSettled ? (
          <ReaderLoading label={t("reader.loadingBook")} fg={theme.fg} />
        ) : (
          <>
            {!isReady && (
              <ReaderLoading label={t("reader.loadingBook")} fg={theme.fg} />
            )}
            {isFoliate && (
              <FoliateReader
                ebookId={ebookId}
                fileName={ebook.fileName}
                initialLocator={initialLocator}
                initialPercent={initialPercent}
                settings={settings}
                controllerRef={controllerRef}
                onRelocate={handleRelocate}
                onReady={handleReady}
                onError={handleError}
                onContentKeyDown={handleKeyDown}
              />
            )}
            {isPdf && (
              <PdfReader
                ebookId={ebookId}
                initialLocator={initialLocator}
                theme={settings.theme}
                controllerRef={controllerRef}
                onRelocate={handleRelocate}
                onReady={handleReady}
                onError={handleError}
              />
            )}
            {/* Edge tap zones for page turns (cover the column gaps; taps
                inside foliate's iframe are handled by its swipe support) */}
            {isReady && (
              <>
                <button
                  type="button"
                  aria-label={t("reader.previousPage")}
                  className="absolute inset-y-0 left-0 z-10 w-[10%] cursor-w-resize opacity-0"
                  onClick={() => controllerRef.current?.prev()}
                  tabIndex={-1}
                />
                <button
                  type="button"
                  aria-label={t("reader.nextPage")}
                  className="absolute inset-y-0 right-0 z-10 w-[10%] cursor-e-resize opacity-0"
                  onClick={() => controllerRef.current?.next()}
                  tabIndex={-1}
                />
              </>
            )}
          </>
        )}
      </div>

      <ReaderBottomBar
        percent={position.percent}
        positionLabel={position.label}
        disabled={!isReady || !!errorMessage}
        onPrev={() => controllerRef.current?.prev()}
        onNext={() => controllerRef.current?.next()}
        onSeek={(percent) => controllerRef.current?.goToFraction(percent / 100)}
      />

      <ReaderToc
        open={tocOpen}
        onOpenChange={setTocOpen}
        items={toc}
        onNavigate={handleTocNavigate}
      />
    </div>
  );
}

function ReaderLoading({ label, fg }: { label: string; fg: string }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3" style={{ color: fg }}>
        <Loader2 className="h-8 w-8 animate-spin opacity-60" />
        <p className="text-sm opacity-60">{label}</p>
      </div>
    </div>
  );
}
