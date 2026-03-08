"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { ReactReader, type IReactReaderStyle } from "react-reader";
import { X, Loader2 } from "lucide-react";
import { Button } from "@repo/ui/components/ui/button";
import { Slider } from "@repo/ui/components/ui/slider";
import { useUpdateEbookProgress } from "../../lib/use-ebook-progress";
import { useTranslations } from "next-intl";
import { useTheme } from "../../lib/use-theme";

interface EpubReaderProps {
  ebookId: string;
  ebookTitle: string;
  initialCfi?: string | null;
  onClose: () => void;
}

// Theme styles for epub.js content
const lightTheme = {
  body: {
    background: "#ffffff",
    color: "#1a1a1a",
  },
};

const darkTheme = {
  body: {
    background: "#1a1a1a",
    color: "#e5e5e5",
  },
};

export function EpubReader({
  ebookId,
  ebookTitle,
  initialCfi,
  onClose,
}: EpubReaderProps) {
  const t = useTranslations("ebooks");
  const { isDark } = useTheme();
  const [location, setLocation] = useState<string | number>(initialCfi || 0);
  const [currentPercent, setCurrentPercent] = useState(0);
  const [isGeneratingLocations, setIsGeneratingLocations] = useState(true);
  const [epubData, setEpubData] = useState<ArrayBuffer | null>(null);
  const [isLoadingEpub, setIsLoadingEpub] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renditionRef = useRef<any>(null);
  const tocRef = useRef<{ label: string; href: string }[]>([]);
  const updateProgress = useUpdateEbookProgress();

  // ReactReader container styles based on theme
  const readerStyles = useMemo(
    () => ({
      readerArea: {
        backgroundColor: isDark ? "#1a1a1a" : "#ffffff",
        transition: "background-color 0.3s ease",
      },
      loadingView: {
        backgroundColor: isDark ? "#1a1a1a" : "#ffffff",
      },
    }),
    [isDark]
  ) as IReactReaderStyle;

  // Apply theme to epub.js rendition when isDark changes
  useEffect(() => {
    if (renditionRef.current) {
      const themeName = isDark ? "dark" : "light";
      renditionRef.current.themes.select(themeName);
    }
  }, [isDark]);

  // Handle location change from ReactReader (page turn, navigation, etc.)
  const handleLocationChange = useCallback(
    (cfi: string) => {
      setLocation(cfi);

      // Calculate percentage from epub.js locations
      if (renditionRef.current?.book?.locations?.length()) {
        const percent =
          renditionRef.current.book.locations.percentageFromCfi(cfi);
        const percentRounded = Math.round(percent * 100);
        setCurrentPercent(percentRounded);

        // Save progress on every page turn
        updateProgress.mutate({
          ebookId,
          cfi,
          progressPercent: percentRounded,
        });
      }
    },
    [ebookId, updateProgress]
  );

  // Fetch EPUB file as ArrayBuffer on mount
  useEffect(() => {
    const fetchEpub = async () => {
      try {
        setIsLoadingEpub(true);
        setLoadError(null);

        const response = await fetch(`/api/ebooks/${ebookId}/stream`, {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error(`Failed to load ebook: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        setEpubData(arrayBuffer);
      } catch (error) {
        console.error("Error loading EPUB:", error);
        setLoadError(
          error instanceof Error ? error.message : "Failed to load ebook"
        );
      } finally {
        setIsLoadingEpub(false);
      }
    };

    fetchEpub();
  }, [ebookId]);

  // Escape key to close reader
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Handle slider change for navigation
  const handleSliderChange = useCallback((value: number[]) => {
    const percentValue = value[0];
    if (percentValue === undefined) return;
    const percent = percentValue / 100;
    if (renditionRef.current?.book?.locations?.length()) {
      const cfi =
        renditionRef.current.book.locations.cfiFromPercentage(percent);
      renditionRef.current.display(cfi);
    }
  }, []);

  // Get rendition callback to set up epub.js
  const handleGetRendition = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (rendition: any) => {
      renditionRef.current = rendition;

      // Register themes for light and dark mode
      rendition.themes.register("light", lightTheme);
      rendition.themes.register("dark", darkTheme);
      rendition.themes.select(isDark ? "dark" : "light");

      // Generate locations for percentage tracking
      rendition.book.ready
        .then(() => {
          setIsGeneratingLocations(true);
          return rendition.book.locations.generate(1024);
        })
        .then(() => {
          setIsGeneratingLocations(false);
          // Recalculate percent after locations are generated
          if (initialCfi && renditionRef.current?.book?.locations?.length()) {
            const percent =
              renditionRef.current.book.locations.percentageFromCfi(initialCfi);
            setCurrentPercent(Math.round(percent * 100));
          }
        });

      // Get table of contents
      rendition.book.loaded.navigation.then(
        (nav: { toc: Array<{ label: string; href: string }> }) => {
          tocRef.current = nav.toc.map(
            (item: { label: string; href: string }) => ({
              label: item.label,
              href: item.href,
            })
          );
        }
      );
    },
    [initialCfi, isDark]
  );

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header with close button */}
      <header className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-4 py-3 bg-background/95 backdrop-blur border-b">
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
          <span className="sr-only">{t("reader.close")}</span>
        </Button>
        <h1 className="text-sm font-medium truncate max-w-[60%]">
          {ebookTitle}
        </h1>
        <div className="w-10" /> {/* Spacer for centering */}
      </header>

      {/* Reader area - ReactReader handles its own prev/next navigation */}
      <div className="flex-1 relative pt-[52px] pb-[72px]">
        {isLoadingEpub && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {t("reader.loadingBook")}
              </p>
            </div>
          </div>
        )}
        {loadError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-center px-4">
              <p className="text-sm text-destructive">{loadError}</p>
              <Button variant="outline" size="sm" onClick={onClose}>
                {t("reader.close")}
              </Button>
            </div>
          </div>
        )}
        {epubData && (
          <ReactReader
            url={epubData}
            location={location}
            locationChanged={handleLocationChange}
            getRendition={handleGetRendition}
            showToc={false}
            readerStyles={readerStyles}
            epubOptions={{
              allowScriptedContent: true,
            }}
          />
        )}
      </div>

      {/* Footer with progress slider */}
      <footer className="absolute bottom-0 inset-x-0 z-20 px-4 py-3 bg-background/95 backdrop-blur border-t">
        <div className="px-2">
          <Slider
            value={[currentPercent]}
            max={100}
            step={1}
            onValueChange={handleSliderChange}
            disabled={isGeneratingLocations}
          />
        </div>
        <p className="text-center text-xs text-muted-foreground mt-2">
          {isGeneratingLocations
            ? t("reader.loading")
            : t("reader.progress", { percent: currentPercent })}
        </p>
      </footer>
    </div>
  );
}
